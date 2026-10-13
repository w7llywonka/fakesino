import { el, sleep } from '../dom.js';
import { amountField } from '../ui/controls.js';
import { playingCard, coin } from '../icons.js';
import { roundDown } from '../shared/currencies.js';
import { options, stepMultiplier, isCorrect } from '../shared/games/hilo.js';
import { floor4 } from '../shared/games/util.js';

const SLUG = 'hilo';

const svg = (d, size = 18, sw = 2.4) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const GLYPH = {
  higher: '<path d="M12 19V6M6 11l6-6 6 6"/>',
  lower: '<path d="M12 5v13M6 13l6 6 6-6"/>',
  same: '<path d="M5 9h14M5 15h14"/>',
  higher_or_same: '<path d="M12 16V5M6.5 10.5L12 5l5.5 5.5M6 20h12"/>',
  lower_or_same: '<path d="M12 4v11M6.5 9.5L12 15l5.5-5.5M6 20h12"/>',
  skip: '<path d="M5 6l6 6-6 6M13 6l6 6-6 6"/>',
};

const GUESS = {
  higher: { label: 'Higher', short: 'Higher' },
  lower: { label: 'Lower', short: 'Lower' },
  same: { label: 'Same', short: 'Same' },
  higher_or_same: { label: 'Higher or Same', short: 'Higher' },
  lower_or_same: { label: 'Lower or Same', short: 'Lower' },
  skip: { label: 'Skip', short: 'Skip' },
};

const icon = (g, size, sw) => svg(GLYPH[g], size, sw);

// The two guess buttons: the "up" slot and the "down" slot. At an Ace only
// Higher/Same exist, at a King only Same/Lower.
function slotsFor(card) {
  if (!card) return ['higher_or_same', 'lower_or_same'];
  const opts = options(card);
  if (opts.includes('higher_or_same')) return ['higher_or_same', 'lower_or_same'];
  if (opts.includes('higher')) return ['higher', 'same'];
  return ['same', 'lower'];
}

// Running multiplier after every card, recomputed with the shared rules.
function runningMultipliers(cards) {
  let exact = 1;
  return cards.map((c, i) => {
    if (i === 0) return { kind: 'start', m: 1 };
    const prev = cards[i - 1];
    if (c.guess === 'skip') return { kind: 'skip', m: floor4(exact) };
    if (isCorrect(prev, c, c.guess)) {
      exact *= stepMultiplier(prev, c.guess);
      return { kind: 'win', m: floor4(exact) };
    }
    return { kind: 'lose', m: 0 };
  });
}

export default function mountHilo(ctx) {
  const { api, sound, fmt } = ctx;
  const animate = () => ctx.animations();

  let game = null;
  let busy = false;
  let destroyed = false;
  let seenUser = ctx.state.user?.id ?? null;
  let current = null; // card on top of the deck
  let guessEls = [];
  let skipBtn = null;

  const panel = ctx.createBetPanel({
    fields: [
      amountField(),
      {
        key: 'guesses',
        type: 'custom',
        keepEnabled: true,
        render(box) {
          box.innerHTML = `<div class="hl-guesses">
              <button type="button" class="hl-gbtn up" data-slot="0" aria-keyshortcuts="Q" disabled><span class="hl-gl"></span><span class="hl-gi"></span><span class="hl-gp"></span></button>
              <button type="button" class="hl-gbtn down" data-slot="1" aria-keyshortcuts="W" disabled><span class="hl-gl"></span><span class="hl-gi"></span><span class="hl-gp"></span></button>
            </div>
            <button type="button" class="btn btn-secondary btn-block hl-skip" aria-keyshortcuts="E" disabled>Skip Card ${icon('skip', 16, 2.4)}</button>`;
          guessEls = [...box.querySelectorAll('.hl-gbtn')];
          guessEls.forEach((b, i) => b.addEventListener('click', () => guess(slotsFor(current)[i])));
          skipBtn = box.querySelector('.hl-skip');
          skipBtn.addEventListener('click', () => guess('skip'));
        },
      },
      { key: 'profitUp', type: 'readonly', label: 'Profit Higher', suffix: coin(ctx.currency()), value: '0.00' },
      { key: 'profitDown', type: 'readonly', label: 'Profit Lower', suffix: coin(ctx.currency()), value: '0.00' },
      { key: 'profitTotal', type: 'readonly', label: 'Total Profit (1.00×)', suffix: coin(ctx.currency()), value: '0.00' },
    ],
    onBet: () => (live() ? cashout() : start()),
    hotkeys: {
      q: () => guess(slotsFor(current)[0]),
      w: () => guess(slotsFor(current)[1]),
      e: () => guess('skip'),
    },
  });

  const stage = el(`<div class="hl-stage">
    <div class="hl-board">
      <div class="hl-side left"><div class="hl-mini">K</div><div class="hl-arrow">${icon('higher', 20, 2.6)}</div><div class="hl-side-text">King being<br>the highest</div></div>
      <div class="hl-center">
        <div class="hl-deck" aria-hidden="true">${Array.from({ length: 5 }, (_, i) => `<span style="--i:${i}"></span>`).join('')}</div>
        <div class="hl-slot"></div>
        <div class="hl-status"></div>
      </div>
      <div class="hl-side right"><div class="hl-mini">A</div><div class="hl-arrow">${icon('lower', 20, 2.6)}</div><div class="hl-side-text">Ace being<br>the lowest</div></div>
    </div>
    <div class="hl-history"><div class="hl-track"></div></div>
  </div>`);
  ctx.stage.appendChild(stage);
  const slot = stage.querySelector('.hl-slot');
  const status = stage.querySelector('.hl-status');
  const track = stage.querySelector('.hl-track');
  const historyEl = stage.querySelector('.hl-history');

  // ---- cards ------------------------------------------------------------------

  const faceHtml = (card) => (card ? playingCard(card, 'hl-face') : '<div class="pcard hl-face"></div>');

  function cardNode(card, down) {
    return el(`<div class="hl-card${down ? ' down' : ''}"><div class="hl-card-in">${faceHtml(card)}<div class="pcard back"></div></div></div>`);
  }

  function showBack() {
    slot.innerHTML = '';
    slot.appendChild(cardNode(null, true));
    current = null;
  }

  // Draw a new card off the deck and flip it face up on top of the old one.
  async function drawCard(card) {
    const old = [...slot.children];
    const node = cardNode(card, true);
    slot.appendChild(node);
    current = card;
    sound.card();
    if (animate()) {
      node.animate([{ transform: 'translate(10px, -12px) rotate(3deg)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.3,.7,.3,1)' });
      for (const o of old) o.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateX(-46px) rotate(-6deg)', opacity: 0 }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
      await sleep(90);
      node.classList.remove('down');
      await sleep(400);
    } else node.classList.remove('down');
    old.forEach((o) => o.remove());
    return node;
  }

  function setCard(card) {
    slot.innerHTML = '';
    slot.appendChild(cardNode(card, false));
    current = card;
  }

  // ---- history row -------------------------------------------------------------

  function histItem(card, info) {
    const label = info.kind === 'start' ? 'Start Card' : info.kind === 'lose' ? '0.00×' : fmt.multiplier(info.m);
    const guessIcon = card.guess ? `<div class="hl-hg ${info.kind}">${icon(card.guess, 13, 3)}</div>` : '';
    return el(`<div class="hl-hitem ${info.kind}">${guessIcon}<div class="hl-hcard">${playingCard(card)}</div><div class="hl-hmult">${label}</div></div>`);
  }

  function renderHistory(cards) {
    track.innerHTML = '';
    const infos = runningMultipliers(cards);
    cards.forEach((c, i) => track.appendChild(histItem(c, infos[i])));
    scrollHistory(false);
  }

  function pushHistory(cards) {
    const infos = runningMultipliers(cards);
    const i = cards.length - 1;
    const item = histItem(cards[i], infos[i]);
    if (animate()) item.classList.add('enter');
    track.appendChild(item);
    scrollHistory(true);
  }

  function scrollHistory(smooth) {
    historyEl.scrollTo({ left: historyEl.scrollWidth, behavior: smooth && animate() ? 'smooth' : 'auto' });
  }

  // ---- controls ------------------------------------------------------------------

  const live = () => !!game && !game.state.done;

  function setStatus(text, kind = '') {
    status.textContent = text;
    status.className = `hl-status ${kind}${text ? ' show' : ''}`;
  }

  function refresh() {
    const isLive = live();
    const view = isLive ? game.state : null;
    const code = isLive ? game.currency : ctx.currency();
    const amount = isLive ? game.amount : panel.values().amount;
    const slots = slotsFor(isLive ? current : null);

    guessEls.forEach((b, i) => {
      const g = slots[i];
      const odds = view?.odds?.[g];
      b.dataset.guess = g;
      b.querySelector('.hl-gl').textContent = GUESS[g].label;
      b.querySelector('.hl-gi').innerHTML = icon(g, 18, 2.6);
      b.querySelector('.hl-gp').textContent = odds ? fmt.percent(odds.chance) : '';
      b.disabled = busy || !isLive || !game.actions.includes(g);
    });
    if (skipBtn) skipBtn.disabled = busy || !isLive || !game.actions.includes('skip');

    const profit = (m) => fmt.amount(roundDown(code, Math.max(0, amount * m - amount)), code);
    const fields = [
      ['profitUp', slots[0]],
      ['profitDown', slots[1]],
    ];
    for (const [key, g] of fields) {
      const m = view?.odds?.[g]?.multiplier;
      panel.setLabel(key, `Profit ${GUESS[g].short}${m ? ` (${fmt.multiplier(m)})` : ''}`);
      panel.set(key, profit(m || 1));
    }
    const total = isLive ? view.multiplier : 1;
    panel.setLabel('profitTotal', `Total Profit (${fmt.multiplier(total)})`);
    panel.set('profitTotal', profit(total));
    for (const key of ['profitUp', 'profitDown', 'profitTotal']) {
      const sfx = panel.field(key)?.querySelector('.suffix');
      if (sfx && sfx.dataset.code !== code) {
        sfx.innerHTML = coin(code);
        sfx.dataset.code = code;
      }
    }

    panel.lock(busy || isLive);
    if (isLive) panel.setButton('Cashout', { disabled: busy || !game.actions.includes('cashout') });
    else {
      panel.resetButton();
      panel.button.disabled = busy;
    }
  }

  function setBusy(b) {
    busy = b;
    refresh();
  }

  async function finish(res) {
    ctx.settle(res);
    const bet = res.bet;
    if (bet && bet.payout > bet.amount) ctx.resultPop(ctx.stage, { multiplier: bet.multiplier, payout: bet.payout, currency: bet.currency });
  }

  // ---- server calls -------------------------------------------------------------------

  async function start() {
    if (busy || live()) return;
    if (!ctx.requireAuth()) return;
    const { amount } = panel.values();
    if (!panel.checkBalance(amount)) return;
    setBusy(true);
    try {
      const res = await api.post(`/api/games/${SLUG}/bet`, { amount, currency: ctx.currency(), params: {} });
      ctx.debitView(res);
      sound.bet();
      game = res.game;
      stage.classList.remove('lost', 'cashed');
      setStatus('');
      track.innerHTML = '';
      const cards = res.game.state.cards;
      await drawCard(cards[0]);
      pushHistory(cards.slice(0, 1));
    } catch (err) {
      if (err.code === 'game_active' && err.data?.game) resume(err.data.game);
      else ctx.toastError(err);
    } finally {
      setBusy(false);
    }
  }

  async function guess(action) {
    if (busy || !live() || !action || !game.actions.includes(action)) return;
    setBusy(true);
    try {
      const res = await api.post(`/api/games/${SLUG}/action`, { action, data: {} });
      ctx.debitView(res);
      game = res.game;
      const view = res.game.state;
      const cards = view.cards;
      const node = await drawCard(cards[cards.length - 1]);
      pushHistory(cards);
      if (action === 'skip') {
        sound.tick();
      } else if (view.lost) {
        node.classList.add('lose');
        stage.classList.add('lost');
        setStatus('Wrong guess', 'lose');
        sound.lose();
      } else {
        node.classList.add('win');
        sound.reveal();
      }
      if (res.bet) await finish(res);
    } catch (err) {
      ctx.toastError(err);
      if (err.code === 'no_game') {
        game = null;
        await loadActive(true);
      }
    } finally {
      setBusy(false);
    }
  }

  async function cashout() {
    if (busy || !live() || !game.actions.includes('cashout')) return;
    setBusy(true);
    try {
      const res = await api.post(`/api/games/${SLUG}/action`, { action: 'cashout', data: {} });
      ctx.debitView(res);
      game = res.game;
      sound.cashout();
      stage.classList.add('cashed');
      slot.lastElementChild?.classList.add('win');
      setStatus(`Cashed out at ${fmt.multiplier(res.game.state.multiplier)}`, 'win');
      if (res.bet) await finish(res);
    } catch (err) {
      ctx.toastError(err);
    } finally {
      setBusy(false);
    }
  }

  function resume(g) {
    game = g;
    stage.classList.remove('lost', 'cashed');
    setStatus('');
    const cards = g.state.cards;
    setCard(cards[cards.length - 1]);
    renderHistory(cards);
    refresh();
  }

  async function loadActive(force = false) {
    if (!ctx.isAuthed() || (busy && !force)) return;
    try {
      const { game: g } = await api.get(`/api/games/${SLUG}/active`);
      if (destroyed || (busy && !force)) return;
      if (g) resume(g);
    } catch {
      /* not signed in or offline */
    }
  }

  ctx.on('user', (u) => {
    const id = u?.id ?? null;
    if (id === seenUser) return;
    seenUser = id;
    if (!id) {
      game = null;
      showBack();
      track.innerHTML = '';
      setStatus('');
      refresh();
    } else loadActive();
  });
  ctx.on('currency', () => refresh());
  panel.onChange((key) => {
    if (key === 'amount' && !live()) refresh();
  });

  showBack();
  refresh();
  loadActive();

  return {
    destroy() {
      destroyed = true;
    },
  };
}

