import { el, sleep } from '../dom.js';
import { amountField } from '../ui/controls.js';
import { playingCard } from '../icons.js';
import { handValue } from '../shared/games/blackjack.js';

const SLUG = 'blackjack';

const svg = (d) =>
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const MOVES = [
  { key: 'hit', label: 'Hit', hotkey: 'Q', icon: svg('<rect x="3" y="4" width="11" height="16" rx="2"/><path d="M19 9v8M15 13h8"/>') },
  { key: 'stand', label: 'Stand', hotkey: 'W', icon: svg('<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V5.5a1.5 1.5 0 0 1 3 0V12M17 12V8.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.8-2.4L4.6 15.2a1.6 1.6 0 0 1 2.5-2L8 14.3"/>') },
  { key: 'split', label: 'Split', hotkey: 'E', icon: svg('<path d="M12 21v-7M12 14L6 6M12 14l6-8M6 6v5M6 6h5M18 6v5M18 6h-5"/>') },
  { key: 'double', label: 'Double', hotkey: 'R', icon: '<span class="bj-x2" aria-hidden="true">2×</span>' },
];

const RESULT_TAG = { win: 'Win', blackjack: 'Blackjack', push: 'Push', lose: 'Lose' };

const FELT = `<svg viewBox="0 0 640 150" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <defs>
    <path id="bjArcA" d="M 52 20 Q 320 128 588 20"/>
    <path id="bjArcB" d="M 112 58 Q 320 158 528 58"/>
  </defs>
  <text class="bj-felt-a"><textPath href="#bjArcA" startOffset="50%" text-anchor="middle">BLACKJACK PAYS 3 TO 2</textPath></text>
  <path class="bj-felt-line" d="M 82 44 Q 320 146 558 44"/>
  <text class="bj-felt-b"><textPath href="#bjArcB" startOffset="50%" text-anchor="middle">INSURANCE PAYS 2 TO 1</textPath></text>
  <path class="bj-felt-line" d="M 150 88 Q 320 176 490 88"/>
</svg>`;

export default function mountBlackjack(ctx) {
  const { api, sound } = ctx;
  const animate = () => ctx.animations();

  let game = null; // last game object from the server
  let busy = false;
  let destroyed = false;
  let seenUser = ctx.state.user?.id ?? null;
  const buttons = {};
  let movesEl = null;
  let insureEl = null;

  const panel = ctx.createBetPanel({
    fields: [
      amountField(),
      {
        key: 'moves',
        type: 'custom',
        keepEnabled: true,
        render(box) {
          box.innerHTML = `<div class="bj-moves">${MOVES.map(
            (m) => `<button type="button" class="btn btn-secondary bj-move" data-act="${m.key}" aria-keyshortcuts="${m.hotkey}" disabled><span>${m.label}</span>${m.icon}</button>`,
          ).join('')}</div>
            <div class="bj-insure bj-hide">
              <button type="button" class="btn btn-secondary bj-move" data-act="insurance"><span>Accept Insurance</span>${svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>')}</button>
              <button type="button" class="btn btn-secondary bj-move" data-act="noInsurance"><span>No Insurance</span>${svg('<path d="M6 6l12 12M18 6L6 18"/>')}</button>
            </div>`;
          box.querySelectorAll('[data-act]').forEach((b) => {
            buttons[b.dataset.act] = b;
            b.addEventListener('click', () => act(b.dataset.act));
          });
          movesEl = box.querySelector('.bj-moves');
          insureEl = box.querySelector('.bj-insure');
        },
      },
    ],
    onBet: () => start(),
    hotkeys: {
      q: () => act('hit'),
      w: () => act('stand'),
      e: () => act('split'),
      r: () => act('double'),
    },
  });

  const stage = el(`<div class="bj-stage">
    <div class="bj-shoe" aria-hidden="true"><div class="bj-shoe-stack">${Array.from({ length: 6 }, (_, i) => `<span style="--i:${i}"></span>`).join('')}</div><div class="bj-shoe-box"></div></div>
    <div class="bj-row bj-dealer"></div>
    <div class="bj-felt">${FELT}</div>
    <div class="bj-prompt" aria-live="polite"></div>
    <div class="bj-row bj-player"></div>
  </div>`);
  ctx.stage.appendChild(stage);
  const dealerRow = stage.querySelector('.bj-dealer');
  const playerRow = stage.querySelector('.bj-player');
  const prompt = stage.querySelector('.bj-prompt');
  const shoeTop = stage.querySelector('.bj-shoe-stack span:last-child');

  // ---- table model ------------------------------------------------------------

  let dealer = null;
  let hands = [];

  function newHand(row, isDealer = false) {
    const node = el(`<div class="bj-hand${isDealer ? ' dealer' : ''}"><div class="bj-value"></div><div class="bj-tag"></div></div>`);
    row.appendChild(node);
    return { node, value: node.querySelector('.bj-value'), tag: node.querySelector('.bj-tag'), cards: [], els: [], dealer: isDealer };
  }

  function clearTable() {
    dealerRow.innerHTML = '';
    playerRow.innerHTML = '';
    playerRow.classList.remove('split');
    stage.classList.remove('idle');
    dealer = newHand(dealerRow, true);
    hands = [newHand(playerRow)];
    setPrompt('');
  }

  function showIdle() {
    dealerRow.innerHTML = '<div class="bj-spot"><span>Dealer</span></div>';
    playerRow.innerHTML = '<div class="bj-spot"><span>Player</span></div>';
    playerRow.classList.remove('split');
    stage.classList.add('idle');
    dealer = null;
    hands = [];
    setPrompt('');
  }

  const faceHtml = (card) => (card && !card.hidden ? playingCard(card, 'bj-face') : '<div class="pcard bj-face bj-blank"></div>');

  function cardNode(card, down) {
    return el(`<div class="bj-card${down ? ' down' : ''}"><div class="bj-card-in">${faceHtml(card)}<div class="pcard back"></div></div></div>`);
  }

  function dims() {
    const cs = getComputedStyle(stage);
    return { cw: parseFloat(cs.getPropertyValue('--cw')) || 96, ch: parseFloat(cs.getPropertyValue('--ch')) || 138 };
  }

  function layoutHand(h) {
    const { cw, ch } = dims();
    const n = h.els.length;
    const perRow = h.dealer ? 1 : Math.max(1, hands.length);
    const rowW = (h.dealer ? dealerRow : playerRow).clientWidth || stage.clientWidth || 600;
    const avail = rowW / perRow - 70;
    let step = cw * 0.46;
    if (n > 1) step = Math.max(cw * 0.16, Math.min(step, (avail - cw) / (n - 1)));
    const lift = Math.min(6, ch * 0.05);
    h.node.style.width = `${cw + Math.max(0, n - 1) * step}px`;
    h.node.style.height = `${ch + Math.max(0, n - 1) * lift}px`;
    h.els.forEach((c, i) => {
      c.style.left = `${i * step}px`;
      c.style.top = `${(n - 1 - i) * lift}px`;
      c.style.zIndex = String(i + 1);
    });
  }

  function layoutAll() {
    if (dealer) layoutHand(dealer);
    hands.forEach(layoutHand);
  }

  function valueText(h, final) {
    const visible = h.cards.filter((c) => !c.hidden);
    if (!visible.length) return null;
    const v = handValue(visible);
    if (v.soft && v.total < 21 && !final) return { text: `${v.total - 10}, ${v.total}`, total: v.total };
    return { text: String(v.total), total: v.total };
  }

  function updateValue(h, final = false) {
    const v = valueText(h, final);
    h.value.classList.toggle('show', !!v);
    if (!v) return;
    h.value.textContent = v.text;
    h.value.classList.toggle('bust', v.total > 21);
    h.value.classList.toggle('twentyone', v.total === 21);
  }

  function markActive(index) {
    const split = hands.length > 1;
    playerRow.classList.toggle('split', split);
    hands.forEach((h, i) => h.node.classList.toggle('active', split && i === index));
  }

  function setPrompt(text) {
    prompt.innerHTML = text ? `<b>${text}</b><span>Dealer shows an Ace</span>` : '';
    prompt.classList.toggle('show', !!text);
    stage.classList.toggle('prompting', !!text);
  }

  // Deal one card from the shoe into a hand. Face-up cards flip over in flight.
  async function deal(h, card, pause = 330) {
    const c = cardNode(card, true);
    h.node.appendChild(c);
    h.els.push(c);
    h.cards.push(card);
    layoutHand(h);
    sound.card();
    if (animate() && shoeTop) {
      const from = shoeTop.getBoundingClientRect();
      const to = c.getBoundingClientRect();
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2);
      const s = to.width ? from.width / to.width : 1;
      c.animate([{ transform: `translate(${dx}px, ${dy}px) rotate(-14deg) scale(${s})` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.75,.25,1)' });
      if (!card.hidden) setTimeout(() => c.classList.remove('down'), 190);
      await sleep(pause);
    } else if (!card.hidden) c.classList.remove('down');
    updateValue(h);
  }

  // Place a card without animation (resume).
  function place(h, card) {
    const c = cardNode(card, !!card.hidden);
    h.node.appendChild(c);
    h.els.push(c);
    h.cards.push(card);
  }

  async function reveal(h, index, card) {
    const c = h.els[index];
    if (!c) return;
    c.querySelector('.bj-face').outerHTML = faceHtml(card);
    h.cards[index] = card;
    sound.card();
    c.classList.remove('down');
    if (animate()) await sleep(420);
    updateValue(h);
  }

  // Animate the second card of the first hand into a new hand.
  async function split() {
    const first = hands[0];
    const moving = first.els[first.els.length - 1];
    const all = [...playerRow.querySelectorAll('.bj-card')];
    const before = new Map(all.map((n) => [n, n.getBoundingClientRect()]));
    const second = newHand(playerRow);
    hands.push(second);
    second.node.appendChild(moving);
    second.els.push(first.els.pop());
    second.cards.push(first.cards.pop());
    playerRow.classList.add('split', 'no-anim');
    layoutAll();
    void playerRow.offsetWidth;
    playerRow.classList.remove('no-anim');
    sound.card();
    if (animate()) {
      for (const n of all) {
        const a = before.get(n);
        const b = n.getBoundingClientRect();
        const dx = a.left - b.left;
        const dy = a.top - b.top;
        if (dx || dy) n.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.3,.7,.3,1)' });
      }
      await sleep(340);
    }
    updateValue(first);
    updateValue(second);
  }

  function finalizeValues(view) {
    view.hands.forEach((vh, i) => hands[i] && updateValue(hands[i], view.done || vh.done));
    updateValue(dealer, view.done);
    markActive(view.done ? -1 : view.active);
    setPrompt(view.insurance === 'offered' ? 'Insurance?' : '');
  }

  // Bring the table in line with a new server view, animating every change in
  // the order the cards were dealt.
  async function applyView(view) {
    if (view.hands.length > hands.length && hands.length === 1) await split();
    for (let i = 0; i < view.hands.length; i++) {
      const vh = view.hands[i];
      const h = hands[i];
      if (!h) continue;
      if (h.cards.length < vh.cards.length && hands.length > 1) markActive(i);
      for (let j = h.cards.length; j < vh.cards.length; j++) await deal(h, vh.cards[j]);
      if (vh.done) updateValue(h, true);
    }
    const vd = view.dealer.cards;
    if (dealer.cards[1]?.hidden && vd[1] && !vd[1].hidden) {
      markActive(-1);
      await reveal(dealer, 1, vd[1]);
    }
    for (let j = dealer.cards.length; j < vd.length; j++) await deal(dealer, vd[j], 380);
    finalizeValues(view);
  }

  async function dealInitial(view) {
    if (stage.querySelector('.bj-card') && animate()) {
      stage.classList.add('clearing');
      await sleep(200);
      stage.classList.remove('clearing');
    }
    clearTable();
    const p = view.hands[0].cards;
    const d = view.dealer.cards;
    await deal(hands[0], p[0]);
    await deal(dealer, d[0]);
    await deal(hands[0], p[1]);
    await deal(dealer, { hidden: true });
    await applyView(view);
  }

  function renderStatic(view) {
    clearTable();
    for (let i = 1; i < view.hands.length; i++) hands.push(newHand(playerRow));
    view.hands.forEach((vh, i) => vh.cards.forEach((c) => place(hands[i], c)));
    view.dealer.cards.forEach((c) => place(dealer, c));
    layoutAll();
    hands.forEach((h) => updateValue(h));
    finalizeValues(view);
  }

  async function showOutcome(res) {
    const view = res.game.state;
    if (animate()) await sleep(260);
    let wins = 0;
    let losses = 0;
    view.hands.forEach((vh, i) => {
      const h = hands[i];
      if (!h) return;
      const r = vh.result || 'lose';
      const bust = vh.value.total > 21;
      h.node.classList.add(`res-${r}`);
      h.tag.textContent = r === 'lose' && bust ? 'Bust' : RESULT_TAG[r];
      if (r === 'win' || r === 'blackjack') wins++;
      if (r === 'lose') losses++;
    });
    dealer.node.classList.toggle('res-bust', view.dealer.value.total > 21);
    if (wins) sound.win();
    else if (losses) sound.lose();
    else sound.reveal();
    ctx.settle(res);
    const bet = res.bet;
    if (bet && bet.payout > bet.amount) ctx.resultPop(ctx.stage, { multiplier: bet.multiplier, payout: bet.payout, currency: bet.currency });
  }

  // ---- controls ------------------------------------------------------------------

  const live = () => !!game && !game.state.done;

  function affordable(action) {
    if (!live()) return false;
    const base = game.wager ? game.amount / game.wager : game.amount;
    const units = game.state.hands[game.state.active]?.units || 1;
    const cost = action === 'double' ? base * units : action === 'split' ? base : action === 'insurance' ? base / 2 : 0;
    if (cost <= 0) return true;
    const bal = ctx.state.user?.balances?.[game.currency] ?? 0;
    return cost <= bal * (1 + 1e-9) + 1e-9;
  }

  function refresh() {
    const isLive = live();
    const acts = isLive ? game.actions : [];
    const insurance = acts.includes('insurance');
    movesEl?.classList.toggle('bj-hide', insurance);
    insureEl?.classList.toggle('bj-hide', !insurance);
    for (const [a, b] of Object.entries(buttons)) b.disabled = busy || !acts.includes(a) || !affordable(a);
    panel.lock(busy || isLive);
    panel.button.disabled = busy || isLive;
  }

  function setBusy(b) {
    busy = b;
    refresh();
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
      await dealInitial(res.game.state);
      if (res.bet) await showOutcome(res);
    } catch (err) {
      if (err.code === 'game_active' && err.data?.game) resume(err.data.game);
      else ctx.toastError(err);
    } finally {
      setBusy(false);
    }
  }

  async function act(action) {
    if (busy || !live() || !game.actions.includes(action)) return;
    if (!affordable(action)) {
      ctx.toast({ type: 'error', title: 'Insufficient balance', message: 'Deposit play money from the wallet to keep playing.' });
      return;
    }
    setBusy(true);
    try {
      const res = await api.post(`/api/games/${SLUG}/action`, { action, data: {} });
      ctx.debitView(res);
      if (action === 'double' || action === 'split' || action === 'insurance') sound.bet();
      game = res.game;
      await applyView(res.game.state);
      if (res.bet) await showOutcome(res);
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

  function resume(g) {
    game = g;
    renderStatic(g.state);
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
      showIdle();
      refresh();
    } else loadActive();
  });
  ctx.on('balance', () => refresh());

  const onResize = () => layoutAll();
  window.addEventListener('resize', onResize);
  ctx.onDestroy(() => window.removeEventListener('resize', onResize));
  ctx.on('resize', onResize);

  showIdle();
  refresh();
  loadActive();

  return {
    destroy() {
      destroyed = true;
    },
  };
}
