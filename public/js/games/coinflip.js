import { el, esc, on } from '../dom.js';
import { icon, coin } from '../icons.js';
import { amountField } from '../ui/controls.js';
import { MULTIPLIER } from '../shared/games/coinflip.js';

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

export default function mountCoinflip(ctx) {
  const { api, fmt, sound } = ctx;
  let side = 'heads';
  let busy = false;
  let destroyed = false;
  let angle = 0; // resting rotation: 0 shows heads, 180 shows tails
  let streak = 0;
  let shuffling = false;
  const anims = new Set();
  const timers = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };

  // ---- sidebar ----
  const sidesEl = el(`<div class="cf-sides" role="radiogroup" aria-label="Side">${SIDES.map(
    (s) => `<button type="button" class="cf-side" role="radio" data-side="${s}">${miniCoin(s, 28)}<span>${NAME[s]}</span></button>`,
  ).join('')}</div>`);

  const panel = ctx.createBetPanel({
    fields: [
      amountField(),
      { key: 'profit', type: 'profit', label: 'Profit on Win' },
      { key: 'side', type: 'custom', label: 'Pick a Side', render: (box) => box.appendChild(sidesEl) },
    ],
    onBet: () => play(false),
    auto: { run: () => play(true) },
  });
  panel.setProfit(MULTIPLIER);

  const randomBtn = el(`<button type="button" class="btn btn-secondary btn-block cf-random">${icon('refresh', 16)}<span>Random Pick</span></button>`);
  panel.extra.appendChild(randomBtn);

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
      <div class="cf-caption" aria-live="polite"><div class="cf-caption-main">Heads or Tails?</div><div class="cf-caption-sub">Pick a side and flip the coin</div></div>
    </div>
    <div class="stage-bottom"><div class="stat-tiles cf-tiles">
      <div class="bp-field"><div class="bp-label">Multiplier</div><div class="input-suffix"><input class="input" readonly tabindex="-1" value="${MULTIPLIER.toFixed(2)}"><span class="suffix">×</span></div></div>
      <div class="bp-field"><div class="bp-label">Win Chance</div><div class="input-suffix"><input class="input" readonly tabindex="-1" value="50.00"><span class="suffix">%</span></div></div>
      <div class="bp-field"><div class="bp-label">Win Streak</div><div class="input-suffix"><input class="input" readonly tabindex="-1" data-k="streak" value="0"><span class="suffix">${icon('fire', 14)}</span></div></div>
    </div></div>
  </div>`);
  ctx.stage.appendChild(stage);
  const history = ctx.historyStrip(stage, { max: 12 });
  history.el.classList.add('cf-history');
  stage.prepend(history.el);

  const scene = stage.querySelector('.cf-scene');
  const toss = stage.querySelector('.cf-toss');
  const coinEl = stage.querySelector('.cf-coin');
  const shadow = stage.querySelector('.cf-shadow');
  const capMain = stage.querySelector('.cf-caption-main');
  const capSub = stage.querySelector('.cf-caption-sub');
  const caption = stage.querySelector('.cf-caption');
  const streakInput = stage.querySelector('[data-k=streak]');
  if (!ctx.animations()) scene.classList.add('still');

  function pick(s, { silent = false } = {}) {
    side = s;
    sidesEl.querySelectorAll('.cf-side').forEach((b) => {
      const active = b.dataset.side === s;
      b.classList.toggle('active', active);
      b.setAttribute('aria-checked', String(active));
    });
    if (!silent) sound.click();
  }

  function syncRandom() {
    randomBtn.disabled = busy || panel.autoRunning || shuffling;
  }

  on(sidesEl, 'click', '.cf-side', (e, b) => {
    if (b.disabled || shuffling) return;
    pick(b.dataset.side);
  });

  // Random pick: flicker between the sides for a moment, then settle.
  randomBtn.addEventListener('click', () => {
    if (busy || panel.autoRunning || shuffling) return;
    const target = Math.random() < 0.5 ? 'heads' : 'tails';
    if (!ctx.animations()) return pick(target);
    shuffling = true;
    syncRandom();
    let flips = target === side ? 6 : 5;
    const step = () => {
      pick(side === 'heads' ? 'tails' : 'heads', { silent: true });
      sound.tick();
      if (--flips > 0) later(step, 65);
      else {
        shuffling = false;
        syncRandom();
      }
    };
    step();
  });

  panel.onChange((key) => {
    if (key === 'autoStopped' || key === 'mode') syncRandom();
  });

  function setCaption(main, sub, cls = '') {
    capMain.textContent = main;
    capSub.innerHTML = sub;
    caption.className = `cf-caption ${cls}`;
  }

  function setAngle(a) {
    angle = a;
    coinEl.style.transform = `rotateX(${a}deg)`;
  }

  async function flip(result, isAuto) {
    const base = result === 'tails' ? 180 : 0;
    if (!ctx.animations()) {
      setAngle(base);
      return;
    }
    const spins = isAuto ? 3 : 5;
    const duration = isAuto ? 820 : 1250;
    const from = angle % 360;
    const to = spins * 360 + base;
    scene.classList.remove('win', 'lose');
    scene.classList.add('flipping');
    const run = [
      coinEl.animate([{ transform: `rotateX(${from}deg)` }, { transform: `rotateX(${to}deg)` }], {
        duration: duration * 0.88,
        easing: 'cubic-bezier(.18,.62,.32,1)',
        fill: 'forwards',
      }),
      toss.animate(
        [
          { transform: 'translateY(0) scale(1) rotate(0deg)', easing: 'cubic-bezier(.22,.7,.4,1)' },
          { transform: 'translateY(-48%) scale(1.14) rotate(-7deg)', offset: 0.44, easing: 'cubic-bezier(.6,0,.8,.45)' },
          { transform: 'translateY(0) scale(1) rotate(0deg)', offset: 0.84, easing: 'ease-out' },
          { transform: 'translateY(-5%) scale(1.01) rotate(1deg)', offset: 0.92, easing: 'ease-in' },
          { transform: 'translateY(0) scale(1) rotate(0deg)' },
        ],
        { duration },
      ),
      shadow.animate(
        [
          { transform: 'translateX(-50%) scale(1)', opacity: 1, easing: 'cubic-bezier(.22,.7,.4,1)' },
          { transform: 'translateX(-50%) scale(.5)', opacity: 0.35, offset: 0.44, easing: 'cubic-bezier(.6,0,.8,.45)' },
          { transform: 'translateX(-50%) scale(1)', opacity: 1, offset: 0.84 },
          { transform: 'translateX(-50%) scale(.94)', opacity: 0.9, offset: 0.92 },
          { transform: 'translateX(-50%) scale(1)', opacity: 1 },
        ],
        { duration },
      ),
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

  function decorateChip(result, win) {
    const chip = history.el.lastElementChild;
    if (!chip) return;
    chip.classList.add('cf-chip');
    chip.innerHTML = miniCoin(result, 26);
    chip.setAttribute('aria-label', `${NAME[result]}, ${win ? 'win' : 'loss'}`);
    chip.dataset.tip = `${NAME[result]} · ${win ? 'Win' : 'Loss'}`;
  }

  async function play(isAuto) {
    if (busy) return null;
    if (!ctx.requireAuth()) return null;
    busy = true;
    syncRandom();
    if (!isAuto) panel.setBusy(true);
    try {
      const v = panel.values();
      const res = await api.post('/api/games/coinflip/bet', { amount: v.amount, currency: ctx.currency(), params: { side } });
      ctx.debitView(res);
      sound.bet();
      const { side: landed, win } = res.bet.result;
      const code = res.bet.currency || ctx.currency();
      if (ctx.animations()) setCaption('Flipping…', '&nbsp;', 'flipping');
      await flip(landed, isAuto);
      if (!destroyed) {
        win ? sound.win() : sound.lose();
        streak = win ? streak + 1 : 0;
        streakInput.value = String(streak);
        const profit = res.bet.payout - res.bet.amount;
        setCaption(
          NAME[landed],
          win
            ? `You won <b>${esc(fmt.money(res.bet.payout, code))}</b> ${coin(code, 14)}`
            : `You lost <b>${esc(fmt.money(Math.abs(profit), code))}</b> ${coin(code, 14)}`,
          win ? 'win' : 'lose',
        );
        if (ctx.animations()) {
          scene.classList.remove('win', 'lose');
          void scene.offsetWidth;
        }
        scene.classList.add(win ? 'win' : 'lose');
        history.push({ label: NAME[landed], win, betId: res.bet.id });
        decorateChip(landed, win);
      }
      ctx.settle(res);
      // The win card sits over the caption (still inside ctx.stage) so the landed face stays visible.
      if (win && !destroyed) ctx.resultPop(caption, { multiplier: MULTIPLIER, payout: res.bet.payout, currency: code, duration: isAuto ? 900 : 1600 });
      return { win, profit: res.bet.payout - res.bet.amount };
    } finally {
      busy = false;
      if (!isAuto) panel.setBusy(false);
      syncRandom();
    }
  }

  pick('heads', { silent: true });
  setAngle(0);

  return {
    destroy() {
      destroyed = true;
      anims.forEach((a) => a.cancel());
      anims.clear();
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
    },
  };
}
