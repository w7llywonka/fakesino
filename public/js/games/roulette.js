import { el, esc, on } from '../dom.js';
import { coin } from '../icons.js';
import { chipRack, chipColor } from '../ui/chips.js';
import { CURRENCIES, roundDown } from '../shared/currencies.js';
import { BETS, WHEEL_ORDER, colorOf, payoutFor } from '../shared/games/roulette.js';
import { createRoundClient, phaseProgress, roundPlayers } from '../ui/roundkit.js';

const STEP = 360 / WHEEL_ORDER.length;
const R = { rim: 98, track: 84, numOuter: 77, numText: 70.5, numInner: 63, pocket: 58.5, cone: 53 };
const rad = (deg) => (deg * Math.PI) / 180;
const pt = (r, deg) => [r * Math.sin(rad(deg)), -r * Math.cos(rad(deg))];
const f = (n) => n.toFixed(2);

function wedge(r1, r2, a0, a1) {
  const [x0, y0] = pt(r2, a0);
  const [x1, y1] = pt(r2, a1);
  const [x2, y2] = pt(r1, a1);
  const [x3, y3] = pt(r1, a0);
  return `M${f(x0)} ${f(y0)}A${r2} ${r2} 0 0 1 ${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}A${r1} ${r1} 0 0 0 ${f(x3)} ${f(y3)}Z`;
}

const POCKET_FILL = { red: '#d42a3f', black: '#18232d', green: '#13914b' };
const POCKET_DEEP = { red: '#9e1c2e', black: '#0e161d', green: '#0c6a36' };

function wheelSvg() {
  let pockets = '';
  let deep = '';
  let frets = '';
  let labels = '';
  WHEEL_ORDER.forEach((n, i) => {
    const a = i * STEP;
    const c = colorOf(n);
    pockets += `<path d="${wedge(R.numInner, R.numOuter, a - STEP / 2, a + STEP / 2)}" fill="${POCKET_FILL[c]}"/>`;
    deep += `<path d="${wedge(R.cone, R.numInner, a - STEP / 2, a + STEP / 2)}" fill="${POCKET_DEEP[c]}"/>`;
    const [fx0, fy0] = pt(R.cone, a + STEP / 2);
    const [fx1, fy1] = pt(R.numOuter, a + STEP / 2);
    frets += `M${f(fx0)} ${f(fy0)}L${f(fx1)} ${f(fy1)}`;
    const [tx, ty] = pt(R.numText, a);
    labels += `<text x="${f(tx)}" y="${f(ty)}" transform="rotate(${f(a)} ${f(tx)} ${f(ty)})">${n}</text>`;
  });
  const studs = Array.from({ length: 8 }, (_, i) => {
    const [x, y] = pt(R.rim - 5, i * 45 + 22.5);
    return `<circle cx="${f(x)}" cy="${f(y)}" r="1.6" fill="#e3c27f"/>`;
  }).join('');
  return `<svg class="rl-wheel" viewBox="-100 -100 200 200" aria-hidden="true">
    <defs>
      <radialGradient id="rlRim" r="50%"><stop offset=".86" stop-color="#2a3d4e"/><stop offset=".93" stop-color="#3a5164"/><stop offset="1" stop-color="#172431"/></radialGradient>
      <radialGradient id="rlCone" r="50%"><stop offset="0" stop-color="#40576b"/><stop offset=".65" stop-color="#26394a"/><stop offset="1" stop-color="#1a2834"/></radialGradient>
      <radialGradient id="rlBall" cx="35%" cy="35%" r="65%"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#e3e9ef"/><stop offset="1" stop-color="#9aa8b6"/></radialGradient>
    </defs>
    <circle r="${R.rim}" fill="url(#rlRim)"/>
    <circle r="${R.track + 5}" fill="#0c141b"/>
    <circle r="${R.track + 5}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="1"/>
    ${studs}
    <g class="rl-rotor">
      ${pockets}${deep}
      <path d="${frets}" stroke="#d9b56c" stroke-width=".8" opacity=".9"/>
      <circle r="${R.numOuter}" fill="none" stroke="#d9b56c" stroke-width="1.2"/>
      <circle r="${R.numInner}" fill="none" stroke="#d9b56c" stroke-width=".7" opacity=".7"/>
      <g class="rl-labels">${labels}</g>
      <circle r="${R.cone}" fill="url(#rlCone)"/>
      <circle r="${R.cone}" fill="none" stroke="#d9b56c" stroke-width="1.2"/>
      <g class="rl-turret" stroke="#d9b56c" stroke-width="2.6" stroke-linecap="round">
        <path d="M0 -40V40M-40 0H40"/><circle cx="0" cy="-40" r="3.4" fill="#e3c27f" stroke="none"/><circle cx="0" cy="40" r="3.4" fill="#e3c27f" stroke="none"/><circle cx="-40" cy="0" r="3.4" fill="#e3c27f" stroke="none"/><circle cx="40" cy="0" r="3.4" fill="#e3c27f" stroke="none"/>
      </g>
      <circle r="27" fill="#16222d" stroke="#d9b56c" stroke-width="1.4"/>
    </g>
    <circle class="rl-ball" r="4.3" cx="0" cy="${-R.track}" fill="url(#rlBall)" opacity="0"/>
  </svg>`;
}

const DIAMOND = (c) => `<svg class="rl-diamond" viewBox="0 0 28 16" aria-hidden="true"><path d="M14 1l13 7-13 7L1 8z" fill="${c}" stroke="rgba(255,255,255,.35)" stroke-width="1"/></svg>`;

// ---- table geometry (hit layer = zero column + 12 number columns × 3 rows) ----
const HC = 13;
const E = 0.3; // vertical band width (fraction of a column)
const H = 0.3; // horizontal band height (fraction of a row)
const cw = 100 / HC;
const rh = 100 / 3;
const box = (x, y, w, h) => `left:${f(x)}%;top:${f(y)}%;width:${f(w)}%;height:${f(h)}%`;

function hitAreas() {
  const out = [];
  const add = (key, style) => out.push(`<span class="rl-hit" data-bet="${key}" style="${style}"></span>`);
  // splits between zero and the first column
  [3, 2, 1].forEach((n, r) => add(`split:0-${n}`, box(cw - (E * cw) / 2, r * rh + (H * rh) / 2, E * cw, rh - H * rh)));
  add('trio:0-2-3', box(cw - (E * cw) / 2, rh - (H * rh) / 2, E * cw, H * rh));
  add('trio:0-1-2', box(cw - (E * cw) / 2, 2 * rh - (H * rh) / 2, E * cw, H * rh));
  add('basket', box(cw - (E * cw) / 2, 100 - (H * rh) / 2, E * cw, H * rh));
  for (let c = 0; c < 12; c++) {
    const left = (c + 1) * cw;
    for (let r = 0; r < 3; r++) {
      const n = 3 * c + 3 - r;
      if (c < 11) add(`split:${n}-${n + 3}`, box(left + cw - (E * cw) / 2, r * rh + (H * rh) / 2, E * cw, rh - H * rh));
      if (r < 2) add(`split:${n - 1}-${n}`, box(left + (E * cw) / 2, (r + 1) * rh - (H * rh) / 2, cw - E * cw, H * rh));
      if (r < 2 && c < 11) add(`corner:${n - 1}`, box(left + cw - (E * cw) / 2, (r + 1) * rh - (H * rh) / 2, E * cw, H * rh));
    }
    add(`street:${c + 1}`, box(left + (E * cw) / 2, 100 - (H * rh) / 2, cw - E * cw, H * rh));
    if (c < 11) add(`line:${c + 1}`, box(left + cw - (E * cw) / 2, 100 - (H * rh) / 2, E * cw, H * rh));
  }
  return out.join('');
}

function tableHtml() {
  let cells = `<button type="button" class="rl-cell rl-num green rl-zero" data-bet="straight:0" data-n="0" style="grid-column:1;grid-row:1/4"><span>0</span></button>`;
  for (let c = 0; c < 12; c++) {
    for (let r = 0; r < 3; r++) {
      const n = 3 * c + 3 - r;
      cells += `<button type="button" class="rl-cell rl-num ${colorOf(n)}" data-bet="straight:${n}" data-n="${n}" style="grid-column:${c + 2};grid-row:${r + 1}"><span>${n}</span></button>`;
    }
  }
  for (let r = 0; r < 3; r++) cells += `<button type="button" class="rl-cell rl-out rl-col" data-bet="column:${3 - r}" style="grid-column:14;grid-row:${r + 1}"><span>2:1</span></button>`;
  const dozens = ['1 to 12', '13 to 24', '25 to 36'];
  dozens.forEach((label, i) => {
    cells += `<button type="button" class="rl-cell rl-out rl-dozen" data-bet="dozen:${i + 1}" style="grid-column:${2 + i * 4}/${6 + i * 4};grid-row:4"><span>${label}</span></button>`;
  });
  const outside = [
    ['low', '1 to 18'],
    ['even', 'Even'],
    ['red', DIAMOND('#e5384d')],
    ['black', DIAMOND('#1b2731')],
    ['odd', 'Odd'],
    ['high', '19 to 36'],
  ];
  outside.forEach(([key, label], i) => {
    cells += `<button type="button" class="rl-cell rl-out rl-even-money rl-${key}" data-bet="${key}" style="grid-column:${2 + i * 2}/${4 + i * 2};grid-row:5" aria-label="${BETS[key].label}"><span>${label}</span></button>`;
  });
  return `${cells}<div class="rl-hits" style="grid-column:1/14;grid-row:1/4">${hitAreas()}</div>`;
}

const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeOutQuart = (t) => 1 - (1 - t) ** 4;
const easeInCubic = (t) => t * t * t;

// `opts.live` = slug of a shared-round table (Live Roulette): same table and
// wheel, but everyone bets on one scheduled spin.
export default function mountRoulette(ctx, opts = {}) {
  const LIVE = opts.live || null;
  const { api, fmt, sound } = ctx;
  let code = ctx.currency();
  let chips = {}; // betKey → amount
  let log = []; // placement history for undo
  let busy = false;
  let destroyed = false;
  let raf = 0;
  let rack = null;
  let lastResult = null;
  let autoScale = 1;
  const timers = new Set();
  const wait = (ms) =>
    new Promise((resolve) => {
      const t = setTimeout(() => {
        timers.delete(t);
        resolve();
      }, ms);
      timers.add(t);
    });

  const panel = ctx.createBetPanel({
    fields: [
      {
        key: 'chip',
        type: 'custom',
        label: 'Chip Value',
        render: (host) => {
          rack = chipRack(host, { code, selected: 1, onSelect: () => updateChipAux() });
        },
      },
      { key: 'total', type: 'readonly', label: 'Total Bet', value: fmt.amount(0, code), suffix: coin(code) },
    ],
    onBet: () => play(false),
    auto: {
      run: (v) => play(true, v),
      canRun: () => {
        if (total() > 0) return true;
        ctx.toast({ type: 'error', title: 'No chips on the table', message: 'Place your chips, then start the autobet to repeat them.' });
        return false;
      },
      delay: 260,
    },
  });

  const tools = el(`<div class="bp-two rl-tools">
    <button class="btn btn-secondary" data-act="undo">↶ Undo</button>
    <button class="btn btn-secondary" data-act="clear">Clear</button></div>`);
  panel.extra.appendChild(tools);

  const touch = window.matchMedia?.('(hover: none)').matches;
  const stage = el(`<div class="roulette-stage">
    <div class="rl-top">
      <div class="history-strip rl-history"></div>
      <div class="rl-wheel-wrap">${wheelSvg()}<div class="rl-badge idle"><span>–</span></div></div>
    </div>
    ${LIVE ? '<div class="rl-live"><span class="rl-live-dot"></span><span class="rl-live-text">Connecting…</span><div class="rl-live-bar"><div></div></div></div>' : ''}
    <div class="rl-table-wrap"><div class="rl-board">${tableHtml()}</div></div>
    <div class="rl-info"><span class="dim">${touch ? 'Tap the table to place chips · swipe it for more bets' : 'Hover the table to see a bet · right-click a bet to remove it'}</span></div>
  </div>`);
  ctx.stage.appendChild(stage);
  const top = stage.querySelector('.rl-top');
  const historyEl = stage.querySelector('.rl-history');
  const rotor = stage.querySelector('.rl-rotor');
  const ball = stage.querySelector('.rl-ball');
  const badge = stage.querySelector('.rl-badge');
  const board = stage.querySelector('.rl-board');
  const info = stage.querySelector('.rl-info');
  const infoIdle = info.innerHTML;
  const betEls = new Map();
  board.querySelectorAll('[data-bet]').forEach((n) => betEls.set(n.dataset.bet, n));
  const numEls = new Map();
  board.querySelectorAll('[data-n]').forEach((n) => numEls.set(Number(n.dataset.n), n));

  // ---- money helpers ----
  const dec = () => 10 ** CURRENCIES[code].decimals;
  const addAmt = (a, b) => Math.round((a + b) * dec()) / dec();
  const total = () => Object.values(chips).reduce((a, b) => addAmt(a, b), 0);
  function chipText(amount) {
    // Same denominations as the chip rack: USD-equivalent, compact.
    const usd = amount * CURRENCIES[code].usd;
    if (usd >= 1000) return fmt.compact(usd);
    if (usd >= 10) return String(Math.floor(usd));
    if (usd >= 1) return String(Math.floor(usd * 10) / 10).replace(/\.0$/, '');
    return `.${String(Math.round(usd * 100)).padStart(2, '0')}`.replace(/0$/, '');
  }

  function updateChipAux() {
    if (rack) panel.setAux('chip', fmt.money(rack.chip.value, code));
  }

  function updateTotal(amount = total()) {
    panel.set('total', fmt.amount(amount, code));
    const suffix = panel.field('total')?.querySelector('.suffix');
    if (suffix) suffix.innerHTML = coin(code);
    // The panel's amount mirrors the table so auto "increase on win/loss" scales the layout.
    if (!panel.autoRunning) panel.set('amount', total());
    tools.querySelector('[data-act=undo]').disabled = busy || panel.autoRunning || !log.length;
    tools.querySelector('[data-act=clear]').disabled = busy || panel.autoRunning || !log.length;
  }

  // ---- chips on the table ----
  function renderChip(key) {
    const host = betEls.get(key);
    if (!host) return;
    let chip = host.querySelector(':scope > .rl-chip');
    const amount = chips[key];
    if (!amount) {
      chip?.remove();
      return;
    }
    if (!chip) {
      chip = el('<span class="placed-chip rl-chip"></span>');
      host.appendChild(chip);
    } else {
      chip.style.animation = 'none';
      void chip.offsetWidth;
      chip.style.animation = '';
    }
    chip.style.setProperty('--chip', chipColor(code, amount));
    chip.textContent = chipText(amount);
    chip.classList.toggle('multi', log.filter((l) => l.key === key).length > 1);
  }

  function renderAllChips() {
    board.querySelectorAll('.rl-chip').forEach((c) => c.remove());
    Object.keys(chips).forEach(renderChip);
  }

  function clearResult() {
    board.classList.remove('settled');
    board.querySelectorAll('.win-num, .win, .won, .lost').forEach((n) => n.classList.remove('win-num', 'win', 'won', 'lost'));
  }

  function place(key) {
    if (busy || panel.autoRunning || !rack) return;
    clearResult();
    const amount = rack.chip.value;
    chips[key] = addAmt(chips[key] || 0, amount);
    log.push({ key, amount });
    renderChip(key);
    updateTotal();
    if (hovered === key) renderInfo(key);
    sound.click();
  }

  function remove(key) {
    if (busy || panel.autoRunning || !chips[key]) return;
    clearResult();
    delete chips[key];
    log = log.filter((l) => l.key !== key);
    renderChip(key);
    updateTotal();
    if (hovered === key) renderInfo(key);
  }

  function undo() {
    if (busy || panel.autoRunning) return;
    const last = log.pop();
    if (!last) return;
    clearResult();
    const next = addAmt(chips[last.key] || 0, -last.amount);
    if (next > 0) chips[last.key] = next;
    else delete chips[last.key];
    renderChip(last.key);
    updateTotal();
    sound.tick();
  }

  function clearAll() {
    if (busy || panel.autoRunning) return;
    chips = {};
    log = [];
    clearResult();
    renderAllChips();
    updateTotal();
  }

  // ---- hover highlight ----
  let hovered = null;
  function highlight(key) {
    if (key === hovered) return;
    hovered = key;
    board.querySelectorAll('.hl').forEach((n) => n.classList.remove('hl'));
    if (!key || !BETS[key]) {
      info.innerHTML = infoIdle;
      return;
    }
    for (const n of BETS[key].numbers) numEls.get(n)?.classList.add('hl');
    betEls.get(key)?.classList.add('hl');
    renderInfo(key);
  }

  function renderInfo(key) {
    const label = key.startsWith('straight:') ? `Straight ${BETS[key].label}` : BETS[key].label;
    const placed = chips[key] ? ` · <b>${esc(fmt.money(chips[key], code))}</b> on it` : '';
    info.innerHTML = `<b>${esc(label)}</b> <span class="dim">·</span> pays <b>${payoutFor(key) - 1}:1</b>${placed}`;
  }

  // ---- wheel animation ----
  let wheelAngle = 0;
  let ballRel = 0; // ball angle relative to the rotor
  let ballR = R.pocket;
  function draw() {
    rotor.setAttribute('transform', `rotate(${f(wheelAngle % 360)})`);
    const [x, y] = pt(ballR, wheelAngle + ballRel);
    ball.setAttribute('cx', f(x));
    ball.setAttribute('cy', f(y));
  }

  function settleBall(number) {
    cancelAnimationFrame(raf);
    ballRel = WHEEL_ORDER.indexOf(number) * STEP;
    ballR = R.pocket;
    ball.setAttribute('opacity', '1');
    draw();
  }

  function spinTo(number, duration) {
    cancelAnimationFrame(raf);
    if (!duration) {
      settleBall(number);
      return Promise.resolve();
    }
    ball.setAttribute('opacity', '1');
    const target = WHEEL_ORDER.indexOf(number) * STEP;
    const w0 = wheelAngle % 360;
    const wTravel = (duration > 2500 ? 300 : 160) + Math.random() * 120;
    const turns = duration > 2500 ? 4 : 2.2;
    const r0 = ballRel % 360;
    const rEnd = target - 360 * Math.ceil((r0 - target) / 360 + turns);
    const land = 0.84;
    let lastPocket = null;
    let lastTick = 0;
    return new Promise((resolve) => {
      const start = performance.now();
      const step = (now) => {
        if (destroyed) return resolve();
        const t = Math.min(1, (now - start) / duration);
        wheelAngle = w0 + wTravel * easeOutCubic(t);
        const tb = Math.min(1, t / land);
        ballRel = r0 + (rEnd - r0) * easeOutQuart(tb);
        const p = Math.min(1, Math.max(0, (t - 0.42) / (land - 0.42)));
        const bounce = p > 0.55 && p < 1 ? Math.abs(Math.sin(p * Math.PI * 4)) * 3.2 * (1 - p) : 0;
        ballR = R.track - (R.track - R.pocket) * easeInCubic(p) + bounce;
        if (p > 0.5 && t < land) {
          const pocket = Math.floor((((ballRel % 360) + 360) % 360) / STEP);
          if (pocket !== lastPocket && now - lastTick > 45) {
            if (lastPocket !== null) sound.tick();
            lastTick = now;
          }
          lastPocket = pocket;
        }
        draw();
        if (t < 1) raf = requestAnimationFrame(step);
        else resolve();
      };
      raf = requestAnimationFrame(step);
    });
  }

  function showBadge(number) {
    badge.className = `rl-badge ${colorOf(number)}`;
    badge.innerHTML = `<span>${number}</span>`;
    if (ctx.animations()) {
      badge.classList.add('pop');
    }
  }

  function pushHistory(number, betId, prepend = false) {
    const chip = el(`<button class="chip rl-hchip ${colorOf(number)}" ${betId ? `data-id="${betId}"` : ''}>${number}</button>`);
    if (prepend) historyEl.prepend(chip);
    else historyEl.appendChild(chip);
    while (historyEl.children.length > 10) historyEl.firstElementChild.remove();
  }

  // ---- play ----
  async function play(isAuto, v) {
    if (busy) return null;
    if (!ctx.requireAuth()) return null;
    const base = total();
    if (!base) {
      ctx.toast({ type: 'error', title: 'No chips on the table', message: 'Pick a chip value and click the table to place a bet.' });
      return null;
    }
    // Auto mode may scale the layout (increase on win/loss).
    let sendChips = chips;
    let stake = base;
    if (isAuto && v && v.amount > 0 && Math.abs(v.amount - base) > 1e-12) {
      autoScale = v.amount / base;
      sendChips = {};
      for (const [k, a] of Object.entries(chips)) {
        const s = roundDown(code, a * autoScale);
        if (s > 0) sendChips[k] = s;
      }
      stake = Object.values(sendChips).reduce((a, b) => addAmt(a, b), 0);
      if (!stake) throw new Error('Bet is too small');
    }
    if (!isAuto && !panel.checkBalance(stake)) return null;
    if (LIVE) return livePlace(isAuto, sendChips);
    busy = true;
    if (!isAuto) panel.setBusy(true);
    board.classList.add('locked');
    clearResult();
    updateTotal(stake);
    try {
      const res = await api.post('/api/games/roulette/bet', { amount: stake, currency: ctx.currency(), params: { chips: sendChips } });
      if (destroyed) return null;
      ctx.debitView(res);
      sound.spin();
      const { number, winning } = res.bet.result;
      badge.className = 'rl-badge spinning';
      badge.innerHTML = '<span></span>';
      const anim = ctx.animations();
      await spinTo(number, anim ? (isAuto ? 1700 : 4000) : 0);
      if (destroyed) return null;
      lastResult = number;
      showBadge(number);
      // Result highlighting on the table.
      board.classList.add('settled');
      numEls.get(number)?.classList.add('win-num');
      const winSet = new Set(winning);
      for (const key of Object.keys(chips)) {
        const host = betEls.get(key);
        host?.classList.toggle('win', winSet.has(key));
        host?.querySelector(':scope > .rl-chip')?.classList.add(winSet.has(key) ? 'won' : 'lost');
      }
      pushHistory(number, res.bet.id);
      const bet = res.bet;
      const won = bet.payout > bet.amount;
      if (bet.payout >= bet.amount * 10) sound.bigWin();
      else if (won) sound.win();
      else if (bet.payout > 0) sound.click();
      else sound.lose();
      ctx.settle(res);
      if (won) ctx.resultPop(top, { multiplier: bet.multiplier, payout: bet.payout, currency: bet.currency, duration: isAuto ? 1000 : 1800 });
      if (isAuto && anim) await wait(won ? 650 : 380);
      return { win: won, profit: bet.payout - bet.amount };
    } catch (err) {
      if (!isAuto) ctx.toastError(err);
      else throw err;
      return null;
    } finally {
      busy = false;
      board.classList.remove('locked');
      if (!isAuto) panel.setBusy(false);
      if (!panel.autoRunning) updateTotal();
      else updateTotal(stake);
    }
  }

  // ---- events ----
  on(board, 'click', '[data-bet]', (e, t) => place(t.dataset.bet));
  on(board, 'contextmenu', '[data-bet]', (e, t) => {
    if (!chips[t.dataset.bet]) return;
    e.preventDefault();
    remove(t.dataset.bet);
  });
  on(board, 'pointerover', '[data-bet]', (e, t) => highlight(t.dataset.bet));
  board.addEventListener('pointerleave', () => highlight(null));
  on(tools, 'click', '[data-act]', (e, b) => (b.dataset.act === 'undo' ? undo() : clearAll()));
  on(historyEl, 'click', '[data-id]', (e, b) => ctx.showBet(b.dataset.id));

  panel.onChange((key) => {
    if (key === 'autoStopped') {
      autoScale = 1;
      updateTotal();
    }
  });

  ctx.on('currency', (next) => {
    code = next;
    rack?.setCurrency(next);
    chips = {};
    log = [];
    clearResult();
    renderAllChips();
    updateTotal();
    updateChipAux();
  });

  async function loadHistory() {
    if (LIVE || !ctx.isAuthed()) return;
    try {
      const { bets } = await api.get('/api/bets/mine?game=roulette&limit=10');
      if (destroyed || !bets?.length || historyEl.children.length) return;
      bets.forEach((b) => pushHistory(b.result.number, b.id, true));
      const last = bets[0].result.number;
      lastResult = last;
      settleBall(last);
      showBadge(last);
      badge.classList.remove('pop');
    } catch {
      /* ignore */
    }
  }
  ctx.on('user', (user) => user && !historyEl.children.length && loadHistory());

  // ---- live table ----
  let rc = null;
  let players = null;
  let spunRound = null;
  let paidRound = null;
  let liveTimer = 0;
  async function livePlace(isAuto, sendChips) {
    try {
      const res = await rc.place({ chips: sendChips });
      sound.bet();
      if (!isAuto) ctx.toast({ type: 'success', title: res.queued ? 'Bet placed for the next spin' : 'Bet placed', message: `${fmt.money(res.bet.amount, res.bet.currency)} ${res.bet.currency} on the table` });
      if (!isAuto) return res;
      const settled = await rc.settled(res.bet.id);
      if (!settled) return null;
      return { win: settled.payout > settled.amount, profit: settled.payout - settled.amount };
    } catch (err) {
      if (!isAuto) ctx.toastError(err);
      else throw err;
      return null;
    }
  }
  function renderLive() {
    const r = rc.s.round;
    if (!r) return;
    const bar = stage.querySelector('.rl-live-bar > div');
    const text = stage.querySelector('.rl-live-text');
    const { left, p } = phaseProgress(rc);
    stage.querySelector('.rl-live').dataset.phase = r.phase;
    if (r.phase === 'betting') text.textContent = `Place your bets · ${Math.ceil(left / 1000)}s`;
    else if (r.phase === 'playing') text.textContent = 'No more bets';
    else text.textContent = r.result ? `${r.result.number} ${r.result.color === 'green' ? 'green' : r.result.color}` : 'Result';
    bar.style.width = `${(r.phase === 'betting' ? 1 - p : p) * 100}%`;
    board.classList.toggle('locked', r.phase === 'playing');
  }
  function onRoundState(s) {
    const r = s.round;
    if (!r) return;
    if (!historyEl.children.length && s.history.length) s.history.slice(0, 10).reverse().forEach((h) => pushHistory(h.result.number, null));
    if (r.phase === 'betting' && spunRound && spunRound !== r.id) {
      clearResult();
      badge.className = 'rl-badge idle';
    }
    if ((r.phase === 'playing' || r.phase === 'result') && r.result && spunRound !== r.id) {
      spunRound = r.id;
      const number = r.result.number;
      const anim = ctx.animations() && r.phase === 'playing';
      badge.className = 'rl-badge spinning';
      badge.innerHTML = '<span></span>';
      if (anim) sound.spin();
      spinTo(number, anim ? Math.max(1200, r.endsAt - rc.serverNow() - 300) : 0).then(() => {
        if (destroyed || spunRound !== r.id) return;
        lastResult = number;
        showBadge(number);
        board.classList.add('settled');
        numEls.get(number)?.classList.add('win-num');
        const mine = rc.myBets();
        const keys = new Set(mine.flatMap((b) => Object.keys(b.params.chips).filter((k) => BETS[k].numbers.includes(number))));
        for (const key of Object.keys(chips)) {
          const host = betEls.get(key);
          if (!mine.length) continue;
          host?.classList.toggle('win', keys.has(key));
          host?.querySelector(':scope > .rl-chip')?.classList.add(keys.has(key) ? 'won' : 'lost');
        }
        pushHistory(number, null);
      });
    }
    if (r.phase === 'result' && paidRound !== r.id) {
      paidRound = r.id;
      const mine = rc.myBets().filter((b) => b.payout != null);
      const stake = mine.reduce((a, b) => a + b.amount, 0);
      const paid = mine.reduce((a, b) => a + b.payout, 0);
      if (mine.length) {
        if (paid > stake) {
          sound.win();
          ctx.resultPop(top, { multiplier: Math.round((paid / stake) * 100) / 100, payout: paid, currency: mine[0].currency, duration: 1800 });
        } else if (paid > 0) sound.click();
        else sound.lose();
      }
    }
    players?.render(s.bets, { phase: r.phase, isMine: rc.isMine, onCancel: (id) => rc.cancel(id).catch((err) => ctx.toastError(err)) });
    renderLive();
  }
  if (LIVE) {
    players = roundPlayers(ctx, { columns: ['Player', 'Spots', 'Amount'], cells: (b) => [`${Object.keys(b.params.chips).length}`] });
    rc = createRoundClient(ctx, LIVE, {
      onState: onRoundState,
      onBet: () => onRoundState(rc.s),
      onCancel: () => onRoundState(rc.s),
    });
    rc.fetchState();
    liveTimer = setInterval(() => rc.s.round && renderLive(), 250);
  }

  draw();
  updateChipAux();
  updateTotal();
  loadHistory();

  return {
    destroy() {
      destroyed = true;
      clearInterval(liveTimer);
      rc?.destroy();
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      timers.clear();
    },
  };
}
