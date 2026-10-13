import { el, esc, sleep } from '../dom.js';
import { playingCard, coin } from '../icons.js';
import { chipRack, chipColor } from '../ui/chips.js';
import { CURRENCIES, roundDown } from '../shared/currencies.js';
import { handTotal } from '../shared/games/baccarat.js';

const SPOTS = [
  { key: 'player', label: 'Player', pays: '1:1' },
  { key: 'tie', label: 'Tie', pays: '8:1' },
  { key: 'banker', label: 'Banker', pays: '0.95:1' },
];
const WINNER_TEXT = { player: 'Player wins', banker: 'Banker wins', tie: 'Tie' };
const ROAD_MAX = 24;

const svg = (d) =>
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

// Short chip label in dollar terms, matching the chip rack ("25", "1.5K", ".5").
function compact(usd) {
  const v = Math.round(usd * 100) / 100;
  if (v >= 1e6) return `${+(v / 1e6).toFixed(1)}M`;
  if (v >= 1000) return `${+(v / 1000).toFixed(v >= 1e4 ? 0 : 1)}K`;
  if (v >= 1) return String(+v.toFixed(v >= 100 ? 0 : 1));
  return v > 0 ? `.${v.toFixed(2).slice(2).replace(/0$/, '')}` : '0';
}

export default function mountBaccarat(ctx) {
  const { api, sound, fmt } = ctx;
  const animate = () => ctx.animations();

  let placed = []; // [{ spot, value }] in placement order (for undo)
  let chips = { player: 0, tie: 0, banker: 0 };
  let busy = false;
  let rack = null;
  let chipCode = ctx.currency(); // currency the placed chips are denominated in

  const panel = ctx.createBetPanel({
    fields: [
      {
        key: 'chip',
        type: 'custom',
        label: 'Chip Value',
        render(box) {
          rack = chipRack(box, { code: ctx.currency(), onSelect: () => updateChipAux() });
          rack.el.classList.add('bc-rack');
        },
      },
      { key: 'total', type: 'readonly', label: 'Total Bet', suffix: coin(ctx.currency()), value: fmt.amount(0, ctx.currency()) },
    ],
    onBet: () => play(false),
    auto: { run: (v) => play(true, v) },
  });
  panel.extra.innerHTML = `<div class="bp-two">
    <button type="button" class="btn btn-secondary" data-act="undo">${svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>')} Undo</button>
    <button type="button" class="btn btn-secondary" data-act="clear">${svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>')} Clear</button>
  </div>`;
  const undoBtn = panel.extra.querySelector('[data-act=undo]');
  const clearBtn = panel.extra.querySelector('[data-act=clear]');

  const handHtml = (side) => `<div class="bc-hand ${side}" data-side="${side}">
      <div class="bc-hand-head"><span class="bc-hand-name">${side === 'player' ? 'Player' : 'Banker'}</span><span class="bc-total">0</span></div>
      <div class="bc-cards">${[0, 1, 2].map((i) => `<div class="bc-slot${i === 2 ? ' third' : ''}" data-i="${i}"></div>`).join('')}</div>
    </div>`;

  const stage = el(`<div class="bc-stage">
    <div class="bc-top"><div class="bc-road" aria-label="Recent results"></div></div>
    <div class="bc-shoe" aria-hidden="true">${Array.from({ length: 6 }, (_, i) => `<span style="--i:${i}"></span>`).join('')}<div class="bc-shoe-box"></div></div>
    <div class="bc-hands">${handHtml('player')}${handHtml('banker')}</div>
    <div class="bc-banner"></div>
    <div class="bc-spots">${SPOTS.map(
      (s) => `<div class="bc-spot ${s.key}" data-spot="${s.key}" role="button" tabindex="0" aria-label="Bet on ${s.label}">
        <span class="bc-spot-name">${s.label}</span><span class="bc-spot-pays">Pays ${s.pays}</span>
        <div class="bc-stack"></div><div class="bc-amt"></div>
      </div>`,
    ).join('')}</div>
    <div class="bc-tip">Click a spot to place the selected chip · right-click or shift-click to remove</div>
  </div>`);
  ctx.stage.appendChild(stage);

  const road = stage.querySelector('.bc-road');
  const banner = stage.querySelector('.bc-banner');
  const shoeTop = stage.querySelector('.bc-shoe span:last-of-type');
  const hands = Object.fromEntries(
    [...stage.querySelectorAll('.bc-hand')].map((h) => [h.dataset.side, { el: h, total: h.querySelector('.bc-total'), slots: [...h.querySelectorAll('.bc-slot')], cards: [] }]),
  );
  const spotEls = Object.fromEntries([...stage.querySelectorAll('.bc-spot')].map((s) => [s.dataset.spot, s]));

  // ---- chips ---------------------------------------------------------------------------

  const locked = () => busy || panel.autoRunning;
  const sumOf = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

  function recalc() {
    const d = 10 ** CURRENCIES[chipCode].decimals;
    const minor = { player: 0, tie: 0, banker: 0 };
    for (const p of placed) minor[p.spot] += Math.round(p.value * d);
    chips = { player: minor.player / d, tie: minor.tie / d, banker: minor.banker / d };
  }

  function renderSpot(spot, amounts = chips) {
    const node = spotEls[spot];
    const amount = amounts[spot];
    const stack = node.querySelector('.bc-stack');
    const amt = node.querySelector('.bc-amt');
    node.classList.toggle('has', amount > 0);
    if (!amount) {
      stack.innerHTML = '';
      amt.textContent = '';
      return;
    }
    const code = chipCode;
    const mine = placed.filter((p) => p.spot === spot).slice(-5);
    const under = mine.slice(0, -1);
    stack.innerHTML =
      under.map((p, i) => `<span class="bc-disc" style="--chip:${chipColor(code, p.value)};--i:${i}"></span>`).join('') +
      `<span class="placed-chip bc-top-chip" style="--chip:${chipColor(code, amount)};--i:${under.length}">${esc(compact(fmt.usdOf(amount, code)))}</span>`;
    amt.textContent = fmt.money(amount, code);
  }

  function renderSpots(amounts = chips) {
    for (const s of SPOTS) renderSpot(s.key, amounts);
  }

  function syncTotal() {
    const total = roundDown(chipCode, sumOf(chips));
    panel.set('total', fmt.amount(total, chipCode));
    panel.set('amount', total);
    refreshControls();
  }

  function updateChipAux() {
    if (rack?.chip) panel.setAux('chip', fmt.money(rack.chip.value, ctx.currency()));
  }

  function refreshControls() {
    const lock = locked();
    undoBtn.disabled = lock || !placed.length;
    clearBtn.disabled = lock || !placed.length;
    stage.classList.toggle('locked', lock);
  }

  function addChip(spot) {
    if (locked() || !rack) return;
    const { value } = rack.chip;
    const next = sumOf(chips) + value;
    if (ctx.isAuthed() && next > ctx.balance() + 1e-12) {
      ctx.toast({ type: 'error', title: 'Insufficient balance', message: 'Deposit play money from the wallet to add more chips.', action: { label: 'Deposit', href: '?modal=wallet&tab=deposit' } });
      return;
    }
    placed.push({ spot, value });
    recalc();
    sound.click();
    renderSpot(spot);
    syncTotal();
  }

  function removeChip(spot) {
    if (locked()) return;
    for (let i = placed.length - 1; i >= 0; i--) {
      if (placed[i].spot === spot) {
        placed.splice(i, 1);
        recalc();
        sound.tick();
        renderSpot(spot);
        syncTotal();
        return;
      }
    }
  }

  function undo() {
    if (locked() || !placed.length) return;
    const last = placed.pop();
    recalc();
    sound.tick();
    renderSpot(last.spot);
    syncTotal();
  }

  function clearChips() {
    placed = [];
    recalc();
    renderSpots();
    syncTotal();
  }

  for (const [spot, node] of Object.entries(spotEls)) {
    node.addEventListener('click', (e) => (e.shiftKey ? removeChip(spot) : addChip(spot)));
    node.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      removeChip(spot);
    });
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        addChip(spot);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        removeChip(spot);
      }
    });
  }
  undoBtn.addEventListener('click', undo);
  clearBtn.addEventListener('click', () => {
    if (!locked()) clearChips();
  });

  // ---- cards ---------------------------------------------------------------------------

  const cardHtml = (card) =>
    `<div class="bc-card down"><div class="bc-card-in">${playingCard(card, 'bc-face')}<div class="pcard back"></div></div></div>`;

  function resetHands() {
    for (const h of Object.values(hands)) {
      h.cards = [];
      h.slots.forEach((s) => {
        s.innerHTML = '';
        s.classList.remove('filled');
      });
      h.total.textContent = '0';
      h.total.classList.remove('show');
      h.el.classList.remove('win', 'tie', 'lose');
    }
    for (const s of Object.values(spotEls)) s.classList.remove('win', 'lose', 'push');
    setBanner('');
  }

  async function clearTable() {
    const old = stage.querySelectorAll('.bc-card');
    if (old.length && animate()) {
      stage.classList.add('clearing');
      await sleep(180);
      stage.classList.remove('clearing');
    }
    resetHands();
  }

  async function dealCard(side, index, card, gap) {
    const h = hands[side];
    const slot = h.slots[index];
    slot.innerHTML = cardHtml(card);
    slot.classList.add('filled');
    const node = slot.firstElementChild;
    h.cards.push(card);
    sound.card();
    if (animate() && shoeTop) {
      const from = shoeTop.getBoundingClientRect();
      const to = slot.getBoundingClientRect();
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2);
      slot.animate([{ transform: `translate(${dx}px, ${dy}px) rotate(-18deg) scale(.7)`, opacity: 0.6 }, { transform: 'none', opacity: 1 }], {
        duration: Math.max(240, gap + 60),
        easing: 'cubic-bezier(.2,.75,.25,1)',
      });
      await sleep(gap * 0.55);
      node.classList.remove('down');
      await sleep(gap * 0.45 + 120);
    } else node.classList.remove('down');
    h.total.textContent = String(handTotal(h.cards));
    h.total.classList.add('show');
  }

  function setBanner(text, kind = '') {
    banner.innerHTML = text;
    banner.className = `bc-banner ${kind}${text ? ' show' : ''}`;
  }

  async function dealRound(r, fast) {
    await clearTable();
    const gap = fast ? 220 : 380;
    const seq = [
      ['player', 0, r.player[0]],
      ['banker', 0, r.banker[0]],
      ['player', 1, r.player[1]],
      ['banker', 1, r.banker[1]],
    ];
    for (const [side, i, card] of seq) await dealCard(side, i, card, gap);
    if (r.player[2] || r.banker[2]) {
      if (animate()) await sleep(fast ? 120 : 260);
      if (r.player[2]) await dealCard('player', 2, r.player[2], gap);
      if (r.banker[2]) await dealCard('banker', 2, r.banker[2], gap);
    }
    if (animate()) await sleep(fast ? 80 : 200);
  }

  function showWinner(r, betChips) {
    const w = r.winner;
    for (const [side, h] of Object.entries(hands)) {
      h.el.classList.toggle('win', w === side);
      h.el.classList.toggle('tie', w === 'tie');
      h.el.classList.toggle('lose', w !== 'tie' && w !== side);
    }
    for (const [spot, node] of Object.entries(spotEls)) {
      const staked = betChips[spot] > 0;
      node.classList.toggle('win', spot === w);
      node.classList.toggle('push', w === 'tie' && spot !== 'tie' && staked);
      node.classList.toggle('lose', staked && spot !== w && !(w === 'tie' && spot !== 'tie'));
    }
    const natural = [handTotal(r.player.slice(0, 2)), handTotal(r.banker.slice(0, 2))].some((t) => t >= 8);
    const score = `<span class="bc-score">${r.playerTotal} – ${r.bankerTotal}</span>`;
    setBanner(`${WINNER_TEXT[w]}${natural ? ' <em>Natural</em>' : ''} ${score}`, w);
  }

  function pushRoad(winner, betId) {
    const bead = el(`<button type="button" class="bc-bead ${winner}" title="${WINNER_TEXT[winner]}">${winner[0].toUpperCase()}</button>`);
    if (betId) bead.addEventListener('click', () => ctx.showBet(betId));
    road.appendChild(bead);
    while (road.children.length > ROAD_MAX) road.firstElementChild.remove();
  }

  // ---- betting --------------------------------------------------------------------------

  async function play(isAuto, v) {
    if (busy) return null;
    if (!ctx.requireAuth()) return null;
    if (chipCode !== ctx.currency()) {
      chipCode = ctx.currency();
      clearChips();
    }
    const code = chipCode;
    let bet = { ...chips };
    const base = sumOf(bet);
    if (!base) {
      ctx.toast({ type: 'error', title: 'No chips placed', message: 'Pick a chip and click Player, Tie or Banker.' });
      return null;
    }
    // Auto "increase on win/loss" scales the whole layout for that round.
    let scaled = false;
    if (isAuto && v && v.amount > 0 && Math.abs(v.amount - base) > 10 ** -CURRENCIES[code].decimals) {
      const factor = v.amount / base;
      bet = Object.fromEntries(Object.entries(bet).map(([k, a]) => [k, roundDown(code, a * factor)]));
      scaled = true;
    }
    const params = Object.fromEntries(Object.entries(bet).filter(([, a]) => a > 0));
    if (!isAuto && !panel.checkBalance(sumOf(params))) return null;

    busy = true;
    if (!isAuto) panel.setBusy(true);
    refreshControls();
    try {
      const res = await api.post('/api/games/baccarat/bet', { currency: code, params: { chips: params } });
      ctx.debitView(res);
      sound.bet();
      renderSpots(scaled ? bet : chips);
      const r = res.bet.result;
      await dealRound(r, isAuto);
      showWinner(r, bet);
      ctx.settle(res);
      pushRoad(r.winner, res.bet.id);
      const { payout, amount } = res.bet;
      if (payout > amount) {
        sound.win();
        ctx.resultPop(ctx.stage, { multiplier: res.bet.multiplier, payout, currency: res.bet.currency, duration: isAuto ? 900 : 1600 });
      } else if (payout < amount) sound.lose();
      else sound.reveal();
      return { win: payout > amount, profit: payout - amount };
    } finally {
      busy = false;
      if (!isAuto) panel.setBusy(false);
      if (scaled && !panel.autoRunning) renderSpots();
      refreshControls();
    }
  }

  panel.onChange((key) => {
    if (key === 'autoStopped') {
      renderSpots();
      syncTotal();
    } else if (key === 'mode') syncTotal();
  });

  ctx.on('currency', (code) => {
    rack?.setCurrency(code);
    const sfx = panel.field('total')?.querySelector('.suffix');
    if (sfx) sfx.innerHTML = coin(code);
    if (!busy) {
      chipCode = code;
      clearChips();
    }
    updateChipAux();
    refreshControls();
  });

  resetHands();
  updateChipAux();
  syncTotal();

  return { destroy() {} };
}
