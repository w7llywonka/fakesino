import { el, esc, on } from '../dom.js';
import { icon, coin } from '../icons.js';
import { amountField } from '../ui/controls.js';
import { LADDER, MAX_FLIPS, multiplierFor } from '../shared/games/coinflip.js';

const SIDES = ['heads', 'tails'];
const NAME = { heads: 'Heads', tails: 'Tails' };
const EDGE_LAYERS = 12;

// Compass-rose star for the tails face: long rays on the axes, short on the diagonals.
function compass(cx, cy) {
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const r = i % 2 ? 13 : i % 4 === 0 ? 54 : 32;
    const a = (Math.PI * i) / 8 - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

// Emblem shapes on a 200×200 face (inner ring radius 62).
const EMBLEM = {
  heads:
    '<path d="M64 124 L57 83 L81 102 L100 71 L119 102 L143 83 L136 124 Z"/><rect x="64" y="129" width="72" height="12" rx="3"/>' +
    '<circle cx="57" cy="78" r="6"/><circle cx="100" cy="64" r="7"/><circle cx="143" cy="78" r="6"/>',
  tails: `<polygon points="${compass(100, 100)}"/>`,
};
// Lighter inlays drawn on top of the emblem.
const DETAIL = {
  heads: '<circle cx="82" cy="135" r="2.6"/><circle cx="100" cy="135" r="2.6"/><circle cx="118" cy="135" r="2.6"/><path d="M100 84 L106 104 L100 116 L94 104 Z" opacity=".55"/>',
  tails: '<circle cx="100" cy="100" r="7.5"/>',
};

function faceSvg(side) {
  const id = (k) => `cf-${side}-${k}`;
  const word = side === 'heads' ? 'HEADS' : 'TAILS';
  return `<svg viewBox="0 0 200 200" aria-hidden="true" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">
    <defs>
      <radialGradient id="${id('face')}" cx="36%" cy="28%" r="80%">
        <stop offset="0" stop-color="#fff5c8"/><stop offset=".28" stop-color="#ffd45e"/>
        <stop offset=".68" stop-color="#e6a326"/><stop offset="1" stop-color="#b9760f"/>
      </radialGradient>
      <linearGradient id="${id('rim')}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff1a6"/><stop offset=".42" stop-color="#e4a52b"/><stop offset="1" stop-color="#8a5306"/>
      </linearGradient>
      <linearGradient id="${id('emb')}" x1="0" y1="0" x2=".6" y2="1">
        <stop offset="0" stop-color="#ffe089"/><stop offset=".55" stop-color="#d79a24"/><stop offset="1" stop-color="#a5680c"/>
      </linearGradient>
      <path id="${id('top')}" d="M30 100a70 70 0 1 1 140 0a70 70 0 1 1-140 0"/>
      <path id="${id('bot')}" d="M21 100a79 79 0 0 0 158 0"/>
    </defs>
    <circle cx="100" cy="100" r="100" fill="url(#${id('rim')})"/>
    <circle cx="100" cy="100" r="94.5" fill="none" stroke="#8d5a08" stroke-width="5" stroke-dasharray="1.4 2.4" opacity=".5"/>
    <circle cx="100" cy="100" r="88" fill="url(#${id('face')})"/>
    <circle cx="100" cy="100" r="88" fill="none" stroke="#9c6209" stroke-width="2" opacity=".55"/>
    <circle cx="100" cy="100" r="63.5" fill="none" stroke="#fff4c4" stroke-width="1.2" opacity=".55"/>
    <circle cx="100" cy="100" r="62" fill="none" stroke="#a96d10" stroke-width="2.2" opacity=".6"/>
    <text font-size="13" font-weight="900" letter-spacing="3.5" fill="#94600a" opacity=".9"><textPath href="#${id('top')}" startOffset="25%" text-anchor="middle">${word}</textPath></text>
    <text font-size="9.5" font-weight="800" letter-spacing="3" fill="#94600a" opacity=".75"><textPath href="#${id('bot')}" startOffset="50%" text-anchor="middle">FAKESINO</textPath></text>
    <g fill="#94600a" opacity=".7"><circle cx="26" cy="100" r="2.6"/><circle cx="174" cy="100" r="2.6"/></g>
    <g fill="#5a3600" opacity=".35" transform="translate(1.6 2.4)">${EMBLEM[side]}</g>
    <g fill="url(#${id('emb')})" stroke="#9a6209" stroke-width="1.2" stroke-linejoin="round">${EMBLEM[side]}</g>
    <g fill="#fff6d2" opacity=".9">${DETAIL[side]}</g>
    <ellipse cx="74" cy="58" rx="50" ry="20" fill="#fff" opacity=".16" transform="rotate(-32 74 58)"/>
  </svg>`;
}

// Flat, gradient-free coin for small sizes (picker buttons, history chips).
function miniCoin(side, size = 22) {
  return `<svg class="cf-mini" width="${size}" height="${size}" viewBox="0 0 200 200" aria-hidden="true">
    <circle cx="100" cy="100" r="100" fill="#b97a12"/><circle cx="100" cy="100" r="86" fill="#f6c34d"/>
    <circle cx="100" cy="100" r="68" fill="none" stroke="#c98b17" stroke-width="7"/>
    <g fill="#9a6209">${EMBLEM[side]}</g></svg>`;
}

const AUTO_CYCLE = [null, 'heads', 'tails', 'random'];

export function renderPreview(result) {
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center">${(result.calls || [])
    .map((c) => `<span style="border-radius:50%;box-shadow:0 0 0 3px ${c.result === c.side ? 'var(--accent)' : 'var(--red)'}">${miniCoin(c.result, 30)}</span>`)
    .join('')}</div>`;
}

export default function mountCoinflip(ctx) {
  const { api, fmt, sound } = ctx;
  let game = null; // active round view (from the server)
  let busy = false;
  let destroyed = false;
  let angle = 0; // resting rotation: 0 shows heads, 180 shows tails
  const autoSides = Array(MAX_FLIPS).fill(null);
  autoSides[0] = 'heads';
  const anims = new Set();

  // ---- sidebar ----
  const callEl = el(`<div class="cf-call">
    <div class="cf-sides" role="group" aria-label="Call">${SIDES.map((s) => `<button type="button" class="cf-side" data-side="${s}">${miniCoin(s, 28)}<span>${NAME[s]}</span></button>`).join('')}</div>
    <button type="button" class="btn btn-secondary btn-block cf-random" data-side="random">${icon('refresh', 16)}<span>Random Pick</span></button>
  </div>`);
  const autoEl = el(`<div class="cf-auto-grid" aria-label="Flips per round">${autoSides.map((_, i) => `<button type="button" class="cf-auto-tile" data-i="${i}"></button>`).join('')}</div>`);

  const panel = ctx.createBetPanel({
    fields: [
      amountField(),
      { key: 'profit', type: 'profit', label: 'Total Profit (1.00×)' },
      { key: 'call', type: 'custom', label: 'Call the next flip', mode: 'manual', render: (box) => box.appendChild(callEl), keepEnabled: true },
      { key: 'flips', type: 'custom', label: 'Flips per round', mode: 'auto', render: (box) => box.appendChild(autoEl), keepEnabled: true },
    ],
    onBet: () => (game ? cashout() : startRound()),
    auto: { run: () => autoRound(), canRun: () => autoCalls().length > 0 },
    hotkeys: { q: () => call('heads'), w: () => call('tails'), e: () => call('random') },
  });

  // ---- stage ----
  const layers = Array.from({ length: EDGE_LAYERS }, (_, i) => `<div class="cf-edge" style="--k:${(i / (EDGE_LAYERS - 1) - 0.5).toFixed(3)}"></div>`).join('');
  const stage = el(`<div class="cf-stage">
    <div class="cf-board">
      <div class="cf-scene">
        <div class="cf-glow"></div>
        <div class="cf-shadow"></div>
        <div class="cf-float"><div class="cf-toss"><div class="cf-coin">
          ${layers}
          <div class="cf-face cf-front">${faceSvg('heads')}</div>
          <div class="cf-face cf-back">${faceSvg('tails')}</div>
        </div></div></div>
      </div>
      <div class="cf-caption" aria-live="polite"><div class="cf-caption-main">Heads or Tails?</div><div class="cf-caption-sub">Press Bet, then call up to 20 flips in a row</div></div>
      <div class="cf-landed" aria-label="Flips this round"></div>
    </div>
    <div class="stage-bottom"><div class="cf-ladder">${LADDER.map(
      (l) => `<div class="cf-step" data-w="${l.wins}"><div class="m">${fmt.multiplier(l.multiplier)}</div><div class="c">${l.chance >= 0.01 ? `${+l.chance.toFixed(2)}%` : `${l.chance.toExponential(1)}%`}</div></div>`,
    ).join('')}</div></div>
  </div>`);
  ctx.stage.appendChild(stage);
  const history = ctx.historyStrip(stage, { max: 10 });
  history.el.classList.add('cf-history');
  stage.prepend(history.el);

  const scene = stage.querySelector('.cf-scene');
  const toss = stage.querySelector('.cf-toss');
  const coinEl = stage.querySelector('.cf-coin');
  const shadow = stage.querySelector('.cf-shadow');
  const caption = stage.querySelector('.cf-caption');
  const capMain = stage.querySelector('.cf-caption-main');
  const capSub = stage.querySelector('.cf-caption-sub');
  const landedEl = stage.querySelector('.cf-landed');
  const ladder = stage.querySelector('.cf-ladder');
  if (!ctx.animations()) scene.classList.add('still');

  function setCaption(main, sub, cls = '') {
    capMain.textContent = main;
    capSub.innerHTML = sub;
    caption.className = `cf-caption ${cls}`;
  }

  function setAngle(a) {
    angle = a;
    coinEl.style.transform = `rotateX(${a}deg)`;
  }

  function renderLanded(calls = [], { reveal = null } = {}) {
    landedEl.innerHTML = calls
      .map((c) => `<span class="cf-landed-coin ${c.result === c.side ? 'hit' : 'miss'}" data-tip="Called ${NAME[c.side]} · landed ${NAME[c.result]}">${miniCoin(c.result, 26)}</span>`)
      .join('');
    if (reveal) landedEl.insertAdjacentHTML('beforeend', reveal);
  }

  function renderLadder(wins = 0, live = false) {
    ladder.querySelectorAll('.cf-step').forEach((step) => {
      const w = Number(step.dataset.w);
      step.classList.toggle('done', w <= wins && wins > 0);
      step.classList.toggle('next', live && w === wins + 1);
    });
    const cur = ladder.querySelector(live ? `.cf-step[data-w="${wins + 1}"]` : `.cf-step[data-w="${Math.max(1, wins)}"]`);
    if (cur) ladder.scrollTo({ left: cur.offsetLeft - ladder.clientWidth / 2 + cur.clientWidth / 2, behavior: ctx.animations() ? 'smooth' : 'auto' });
  }

  function renderAutoGrid() {
    autoEl.querySelectorAll('.cf-auto-tile').forEach((b, i) => {
      const v = autoSides[i];
      b.className = `cf-auto-tile ${v ? 'set' : ''}`;
      b.innerHTML = v === 'random' ? icon('refresh', 16) : v ? miniCoin(v, 22) : `<span class="n">${i + 1}</span>`;
      b.dataset.tip = v ? `Flip ${i + 1}: ${v === 'random' ? 'Random' : NAME[v]}` : `Flip ${i + 1}: off`;
    });
    const n = autoCalls().length;
    panel.setLabel('flips', `Flips per round · ${n} → ${fmt.multiplier(multiplierFor(n))}`);
    sync();
  }

  const autoCalls = () => autoSides.filter(Boolean);

  // Reflect the round in the sidebar: buttons, profit and the main button.
  function sync() {
    const live = !!game && !game.done;
    callEl.querySelectorAll('button').forEach((b) => (b.disabled = !live || busy));
    panel.lock(live);
    // Live: profit so far. Idle: profit if the next round wins (first call, or all auto calls).
    const m = live ? game.multiplier : multiplierFor(panel.mode === 'auto' ? autoCalls().length : 1);
    panel.setLabel('profit', `${live ? 'Total Profit' : 'Profit on Win'} (${fmt.multiplier(m)})`);
    panel.setProfit(m);
    if (live) panel.setButton(game.wins ? `Cashout ${fmt.multiplier(game.multiplier)}` : 'Cashout', { disabled: busy || !game.wins });
    else if (!panel.autoRunning) panel.resetButton();
    renderLadder(live ? game.wins : 0, live);
  }

  async function flipCoin(result, fast) {
    const base = result === 'tails' ? 180 : 0;
    if (!ctx.animations()) return setAngle(base);
    const spins = fast ? 2 : 4;
    const duration = fast ? 520 : 1000;
    const to = spins * 360 + base;
    scene.classList.remove('win', 'lose');
    scene.classList.add('flipping');
    const run = [
      coinEl.animate([{ transform: `rotateX(${angle % 360}deg)` }, { transform: `rotateX(${to}deg)` }], { duration: duration * 0.88, easing: 'cubic-bezier(.18,.62,.32,1)', fill: 'forwards' }),
      toss.animate(
        [
          { transform: 'translateY(0) scale(1)', easing: 'cubic-bezier(.22,.7,.4,1)' },
          { transform: 'translateY(-42%) scale(1.12)', offset: 0.45, easing: 'cubic-bezier(.6,0,.8,.45)' },
          { transform: 'translateY(0) scale(1)' },
        ],
        { duration },
      ),
      shadow.animate([{ transform: 'translateX(-50%) scale(1)', opacity: 1 }, { transform: 'translateX(-50%) scale(.55)', opacity: 0.4, offset: 0.45 }, { transform: 'translateX(-50%) scale(1)', opacity: 1 }], { duration }),
    ];
    run.forEach((a) => anims.add(a));
    try {
      await Promise.all(run.map((a) => a.finished));
    } catch {
      /* cancelled on destroy */
    }
    run.forEach((a) => anims.delete(a));
    if (destroyed) return;
    setAngle(base);
    run[0].cancel();
    scene.classList.remove('flipping');
  }

  // A finished round: show the result, report the bet, record history.
  function finish(res, { fast = false } = {}) {
    const bet = res.bet;
    const v = res.game.state;
    const code = bet.currency;
    const won = bet.payout > 0;
    game = null;
    if (won) {
      sound.cashout();
      setCaption(`Cashed out at ${fmt.multiplier(bet.multiplier)}`, `You won <b>${esc(fmt.money(bet.payout, code))}</b> ${coin(code, 14)}`, 'win');
      if (!destroyed) ctx.resultPop(caption, { multiplier: bet.multiplier, payout: bet.payout, currency: code, duration: fast ? 900 : 1800 });
    } else {
      sound.lose();
      const miss = v.calls[v.calls.length - 1];
      setCaption(`${NAME[miss.result]} — round over`, `You called ${NAME[miss.side]} after ${v.wins} correct call${v.wins === 1 ? '' : 's'}`, 'lose');
    }
    scene.classList.add(won ? 'win' : 'lose');
    history.push({ label: fmt.multiplier(bet.multiplier), win: won, betId: bet.id });
    ctx.setBalance(res.balance);
    ctx.reportBet(bet);
    sync();
  }

  async function startRound() {
    if (busy || !ctx.requireAuth()) return;
    busy = true;
    sync();
    try {
      const v = panel.values();
      const res = await api.post('/api/games/coinflip/bet', { amount: v.amount, currency: ctx.currency(), params: {} });
      sound.bet();
      game = res.game.state;
      ctx.setBalance(res.balance);
      renderLanded([]);
      scene.classList.remove('win', 'lose');
      setCaption('Call it!', 'Heads or tails? One miss ends the round.', '');
    } catch (err) {
      if (err.code === 'game_active' && err.data.game) {
        game = err.data.game.state;
        renderLanded(game.calls);
      } else throw err;
    } finally {
      busy = false;
      sync();
    }
  }

  async function call(choice) {
    if (!game || game.done || busy) return;
    const side = choice === 'random' ? SIDES[Math.random() < 0.5 ? 0 : 1] : choice;
    busy = true;
    sync();
    sound.click();
    try {
      const res = await api.post('/api/games/coinflip/action', { action: 'flip', data: { side } });
      const v = res.game.state;
      const last = v.calls[v.calls.length - 1];
      if (ctx.animations()) setCaption('Flipping…', `You called <b>${NAME[side]}</b>`, 'flipping');
      await flipCoin(last.result, false);
      if (destroyed) return;
      renderLanded(v.calls);
      if (res.bet) return finish(res);
      game = v;
      sound.win();
      scene.classList.add('win');
      setCaption(`${NAME[last.result]}!`, `${fmt.multiplier(v.multiplier)} — next correct call pays ${fmt.multiplier(v.nextMultiplier)}`, 'win');
    } finally {
      busy = false;
      sync();
    }
  }

  async function cashout() {
    if (!game || !game.wins || busy) return;
    busy = true;
    sync();
    try {
      const res = await api.post('/api/games/coinflip/action', { action: 'cashout' });
      finish(res);
    } finally {
      busy = false;
      sync();
    }
  }

  // Auto: the whole round resolves in one request; replay the flips quickly.
  async function autoRound() {
    const sides = autoCalls().map((s) => (s === 'random' ? SIDES[Math.random() < 0.5 ? 0 : 1] : s));
    const v = panel.values();
    const res = await api.post('/api/games/coinflip/bet', { amount: v.amount, currency: ctx.currency(), params: { autoSides: sides } });
    ctx.debitView(res);
    sound.bet();
    const calls = res.game.state.calls;
    renderLanded([]);
    for (let i = 0; i < calls.length && !destroyed; i++) {
      if (ctx.animations()) await flipCoin(calls[i].result, true);
      else setAngle(calls[i].result === 'tails' ? 180 : 0);
      renderLanded(calls.slice(0, i + 1));
    }
    if (!destroyed) finish(res, { fast: true });
    return { win: res.bet.payout > res.bet.amount, profit: res.bet.payout - res.bet.amount };
  }

  on(callEl, 'click', 'button[data-side]', (e, b) => !b.disabled && call(b.dataset.side));
  on(autoEl, 'click', '.cf-auto-tile', (e, b) => {
    if (panel.autoRunning) return;
    const i = Number(b.dataset.i);
    autoSides[i] = AUTO_CYCLE[(AUTO_CYCLE.indexOf(autoSides[i]) + 1) % AUTO_CYCLE.length];
    renderAutoGrid();
  });
  panel.onChange((key) => {
    if (key === 'mode') renderAutoGrid();
    if (key === 'amount') sync();
  });

  async function resume() {
    if (!ctx.isAuthed()) return;
    try {
      const { game: active } = await api.get('/api/games/coinflip/active');
      if (destroyed || !active) return;
      game = active.state;
      panel.set('amount', active.amount);
      renderLanded(game.calls);
      const last = game.calls[game.calls.length - 1];
      if (last) setAngle(last.result === 'tails' ? 180 : 0);
      setCaption('Round in progress', `${game.wins} correct call${game.wins === 1 ? '' : 's'} · ${fmt.multiplier(game.multiplier)}`, '');
      sync();
    } catch {
      /* no active round */
    }
  }

  setAngle(0);
  renderAutoGrid();
  resume();
  ctx.on('user', resume);

  return {
    destroy() {
      destroyed = true;
      anims.forEach((a) => a.cancel());
      anims.clear();
    },
  };
}
