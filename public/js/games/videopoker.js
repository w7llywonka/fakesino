import { el, sleep } from '../dom.js';
import { amountField } from '../ui/controls.js';
import { playingCard } from '../icons.js';
import { PAYTABLE } from '../shared/games/videopoker.js';

const SLUG = 'videopoker';
const NAMES = Object.fromEntries(PAYTABLE.map((p) => [p.key, p]));
const ALL = [0, 1, 2, 3, 4];

// Which of the five cards make up the paying hand (for highlighting).
function scoringCards(hand, key) {
  if (!key) return [];
  if (['royal_flush', 'straight_flush', 'flush', 'straight', 'full_house'].includes(key)) return ALL;
  const counts = {};
  for (const c of hand) counts[c.rank] = (counts[c.rank] || 0) + 1;
  const need = { four_kind: [4], three_kind: [3], two_pair: [2], jacks_better: [2] }[key] || [];
  return ALL.filter((i) => {
    const c = hand[i];
    if (!need.includes(counts[c.rank])) return false;
    return key !== 'jacks_better' || ['J', 'Q', 'K', 'A'].includes(c.rank);
  });
}

export default function mountVideoPoker(ctx) {
  const { api, sound } = ctx;
  const animate = () => ctx.animations();

  let game = null;
  let busy = false;
  let destroyed = false;
  let seenUser = ctx.state.user?.id ?? null;
  let held = [false, false, false, false, false];

  const panel = ctx.createBetPanel({
    fields: [amountField()],
    betLabel: 'Deal',
    onBet: () => (live() ? draw() : deal()),
    hotkeys: Object.fromEntries(ALL.map((i) => [String(i + 1), () => toggleHold(i)])),
  });

  const stage = el(`<div class="vp-stage">
    <div class="vp-paytable">${PAYTABLE.map(
      (p) => `<div class="vp-row" data-key="${p.key}"><span class="vp-name">${p.name}</span><span class="vp-pays">${p.pays}×</span></div>`,
    ).join('')}<div class="vp-note">9/6 Jacks or Better</div></div>
    <div class="vp-table">
      <div class="vp-result"></div>
      <div class="vp-cards">${ALL.map(
        (i) => `<div class="vp-slot" data-i="${i}" role="button" tabindex="0" aria-pressed="false" aria-label="Card ${i + 1}">
          <div class="vp-held">Held</div>
          <div class="vp-card down"><div class="vp-card-in"><div class="pcard vp-face"></div><div class="pcard back"></div></div></div>
          <div class="vp-key">${i + 1}</div>
        </div>`,
      ).join('')}</div>
      <div class="vp-hint"></div>
    </div>
  </div>`);
  ctx.stage.appendChild(stage);
  const rows = Object.fromEntries([...stage.querySelectorAll('.vp-row')].map((r) => [r.dataset.key, r]));
  const slots = [...stage.querySelectorAll('.vp-slot')];
  const cards = slots.map((s) => s.querySelector('.vp-card'));
  const resultEl = stage.querySelector('.vp-result');
  const hintEl = stage.querySelector('.vp-hint');

  // ---- rendering --------------------------------------------------------------------

  function setFace(i, card) {
    cards[i].querySelector('.vp-face').outerHTML = card ? playingCard(card, 'vp-face') : '<div class="pcard vp-face"></div>';
  }

  function renderHolds() {
    const canHold = live() && !busy;
    slots.forEach((s, i) => {
      s.classList.toggle('held', held[i]);
      s.classList.toggle('holdable', canHold);
      s.setAttribute('aria-pressed', String(held[i]));
    });
  }

  function clearMarks() {
    slots.forEach((s) => s.classList.remove('win', 'dim'));
    Object.values(rows).forEach((r) => r.classList.remove('hint', 'win'));
    setResult('');
  }

  function setResult(html, kind = '') {
    resultEl.innerHTML = html;
    resultEl.className = `vp-result ${kind}${html ? ' show' : ''}`;
  }

  function setHint(text) {
    hintEl.textContent = text;
  }

  function showHint(view) {
    Object.values(rows).forEach((r) => r.classList.toggle('hint', r.dataset.key === view.result));
    if (view.result) setResult(`${NAMES[view.result].name}`, 'hint');
    else setResult('');
  }

  async function flipDown(indexes) {
    const up = indexes.filter((i) => !cards[i].classList.contains('down'));
    if (!up.length) return;
    up.forEach((i) => cards[i].classList.add('down'));
    if (animate()) await sleep(300);
  }

  async function flipUp(hand, indexes) {
    for (const i of indexes) {
      setFace(i, hand[i]);
      cards[i].classList.remove('down');
      sound.card();
      if (animate()) await sleep(110);
    }
    if (animate()) await sleep(320);
  }

  function showFinal(res) {
    const view = res.game.state;
    const key = view.result;
    const win = scoringCards(view.hand, key);
    Object.values(rows).forEach((r) => {
      r.classList.remove('hint');
      r.classList.toggle('win', r.dataset.key === key);
    });
    slots.forEach((s, i) => {
      s.classList.toggle('win', win.includes(i));
      s.classList.toggle('dim', !win.includes(i));
    });
    if (key) {
      setResult(`${NAMES[key].name} <b>${NAMES[key].pays}×</b>`, 'win');
      sound.win();
    } else {
      setResult('No win', 'lose');
      sound.lose();
    }
    setHint('');
    ctx.settle(res);
    const bet = res.bet;
    if (bet && bet.payout > bet.amount) ctx.resultPop(ctx.stage, { multiplier: bet.multiplier, payout: bet.payout, currency: bet.currency });
  }

  // ---- controls ------------------------------------------------------------------------

  const live = () => !!game && !game.state.done;

  function refresh() {
    const isLive = live();
    panel.lock(busy || isLive);
    if (isLive) panel.setButton('Draw', { disabled: busy });
    else {
      panel.resetButton();
      panel.button.disabled = busy;
    }
    renderHolds();
  }

  function setBusy(b) {
    busy = b;
    refresh();
  }

  function toggleHold(i) {
    if (!live() || busy) return;
    held[i] = !held[i];
    sound.click();
    renderHolds();
  }

  slots.forEach((s, i) => {
    s.addEventListener('click', () => toggleHold(i));
    s.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        toggleHold(i);
      }
    });
  });

  // ---- server calls --------------------------------------------------------------------------

  async function deal() {
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
      held = [false, false, false, false, false];
      clearMarks();
      renderHolds();
      await flipDown(ALL);
      await flipUp(res.game.state.hand, ALL);
      showHint(res.game.state);
      setHint('Tap cards to hold them, then draw');
      if (res.bet) showFinal(res);
    } catch (err) {
      if (err.code === 'game_active' && err.data?.game) resume(err.data.game);
      else ctx.toastError(err);
    } finally {
      setBusy(false);
    }
  }

  async function draw() {
    if (busy || !live()) return;
    setBusy(true);
    try {
      const res = await api.post(`/api/games/${SLUG}/action`, { action: 'draw', data: { held: [...held] } });
      ctx.debitView(res);
      game = res.game;
      const replace = ALL.filter((i) => !held[i]);
      setResult('');
      await flipDown(replace);
      await flipUp(res.game.state.hand, replace);
      held = [false, false, false, false, false];
      slots.forEach((s) => s.classList.remove('held'));
      if (res.bet) showFinal(res);
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
    held = [false, false, false, false, false];
    clearMarks();
    g.state.hand.forEach((c, i) => {
      setFace(i, c);
      cards[i].classList.remove('down');
    });
    showHint(g.state);
    setHint('Tap cards to hold them, then draw');
    refresh();
  }

  async function loadActive(force = false) {
    if (!ctx.isAuthed() || (busy && !force)) return;
    try {
      const { game: g } = await api.get(`/api/games/${SLUG}/active`);
      if (destroyed || (busy && !force)) return;
      if (g) resume(g);
    } catch {
      /* offline */
    }
  }

  function reset() {
    game = null;
    held = [false, false, false, false, false];
    clearMarks();
    cards.forEach((c, i) => {
      c.classList.add('down');
      setFace(i, null);
    });
    setHint('Deal to start a hand');
    refresh();
  }

  ctx.on('user', (u) => {
    const id = u?.id ?? null;
    if (id === seenUser) return;
    seenUser = id;
    if (!id) reset();
    else loadActive();
  });

  reset();
  loadActive();

  return {
    destroy() {
      destroyed = true;
    },
  };
}

