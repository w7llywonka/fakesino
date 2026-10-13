import { el } from '../dom.js';
import { amountField } from '../ui/controls.js';
import { timers } from '../ui/stepgame.js';
import { TABLES, DIFFICULTIES, bands } from '../shared/games/darts.js';

const R = 150; // board radius in SVG units (viewBox 400×400, centre 200,200)
const RING = { 1: '#22303d', 2: '#e8e2d2', 3: '#1f9d55', 4: '#e8e2d2', 5: '#d9283c', 6: '#ffcc33' };
const INK = { 1: '#e8e2d2', 2: '#22303d', 3: '#fff', 4: '#22303d', 5: '#fff', 6: '#3a2a00' };
const DIFF_OPTIONS = DIFFICULTIES.map((d) => [d, d[0].toUpperCase() + d.slice(1)]);

const point = (angle, radius) => {
  const a = (angle * Math.PI) / 180;
  return { x: 200 + Math.sin(a) * radius * R, y: 200 - Math.cos(a) * radius * R };
};

function boardSvg(difficulty) {
  const rings = bands(difficulty)
    .slice()
    .reverse()
    .map((b) => `<circle cx="200" cy="200" r="${(Math.sqrt(b.outer) * R).toFixed(2)}" fill="${RING[b.tier]}" data-tier="${b.tier}"/>`)
    .join('');
  const wedges = Array.from({ length: 20 }, (_, i) => {
    const p = point(i * 18 + 9, 1);
    return `<line x1="200" y1="200" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}"/>`;
  }).join('');
  return `<svg class="dt-board" viewBox="0 0 400 400" aria-hidden="true">
    <defs><radialGradient id="dtShade" cx="45%" cy="40%" r="70%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient></defs>
    <circle cx="200" cy="200" r="${R + 30}" fill="#111a22"/>
    <circle cx="200" cy="200" r="${R + 30}" fill="none" stroke="#2c3d4c" stroke-width="3"/>
    <circle cx="200" cy="200" r="${R + 6}" fill="#c9cfd6"/>
    <g class="dt-rings">${rings}</g>
    <g class="dt-wedges" stroke="#9aa5b1" stroke-opacity=".35" stroke-width="1">${wedges}</g>
    <g class="dt-wires" fill="none" stroke="#c9cfd6" stroke-width="1.4">${bands(difficulty)
      .map((b) => `<circle cx="200" cy="200" r="${(Math.sqrt(b.outer) * R).toFixed(2)}"/>`)
      .join('')}</g>
    <circle cx="200" cy="200" r="${R}" fill="url(#dtShade)"/>
    <g class="dt-darts"></g>
  </svg>`;
}

// A dart seen from the front-left, tip at (0,0).
const DART = `<g class="dt-dart"><g transform="scale(1.35)"><path d="M0 0l9-3 34-34" stroke="#c9cfd6" stroke-width="3" stroke-linecap="round"/><path d="M38 -32l10 -10" stroke="#ffcc33" stroke-width="6" stroke-linecap="round"/>
  <path d="M46 -40l14 -22 4 16z" fill="#ff4d5e"/><path d="M46 -40l22 -12-16 -4z" fill="#ff7a88"/><circle r="2.6" fill="#fff"/></g></g>`;

export function renderPreview(result, params) {
  const p = point(result.angle, result.radius);
  return `<div style="display:grid;justify-items:center;gap:6px"><div style="width:160px">${boardSvg(params.difficulty || 'medium').replace('<g class="dt-darts"></g>', `<g transform="translate(${p.x} ${p.y})">${DART}</g>`)}</div><div class="muted">Ring ${result.tier} of 6</div></div>`;
}

export default function mountDarts(ctx) {
  const { api, fmt, sound } = ctx;
  let busy = false;
  let destroyed = false;
  let difficulty = 'medium';
  const t = timers();

  const panel = ctx.createBetPanel({
    fields: [amountField(), { key: 'difficulty', type: 'select', label: 'Difficulty', options: DIFF_OPTIONS, value: difficulty }, { key: 'profit', type: 'profit', label: 'Max Profit' }],
    onBet: () => play(false),
    auto: { run: () => play(true) },
  });

  const stage = el(`<div class="dt-stage">
    <div class="stage-center"><div class="dt-wrap"></div></div>
    <div class="stage-bottom"><div class="dt-tiers"></div></div>
  </div>`);
  ctx.stage.appendChild(stage);
  const history = ctx.historyStrip(stage, { max: 8 });
  stage.prepend(history.el);
  const wrap = stage.querySelector('.dt-wrap');
  const tiersEl = stage.querySelector('.dt-tiers');

  function build() {
    wrap.innerHTML = boardSvg(difficulty);
    const { mult, prob } = TABLES[difficulty];
    tiersEl.innerHTML = mult
      .map((m, i) => `<div class="dt-tier" data-tier="${i + 1}" style="--ring:${RING[i + 1]};--ink:${INK[i + 1]}" data-tip="${prob[i]}% chance"><div class="m">${fmt.multiplier(m)}</div><div class="c">${+prob[i].toFixed(2)}%</div></div>`)
      .join('');
    const max = Math.max(...mult);
    panel.setProfit(max);
    panel.setLabel('profit', `Max Profit (${fmt.multiplier(max)})`);
  }

  function highlight(tier) {
    tiersEl.querySelectorAll('.dt-tier').forEach((x) => x.classList.toggle('hit', Number(x.dataset.tier) === tier));
    wrap.querySelectorAll('.dt-rings circle').forEach((c) => c.classList.toggle('hit', Number(c.dataset.tier) === tier));
  }

  async function throwDart(result, fast) {
    const layer = wrap.querySelector('.dt-darts');
    // Earlier darts fade; keep the last few on the board.
    layer.querySelectorAll('.dt-thrown').forEach((d, i, all) => (i < all.length - 4 ? d.remove() : d.classList.add('old')));
    highlight(null);
    const p = point(result.angle, result.radius);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'dt-thrown');
    g.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
    g.innerHTML = DART;
    layer.appendChild(g);
    if (ctx.animations()) {
      const dart = g.firstElementChild;
      const ms = fast ? 220 : 380;
      const a = dart.animate(
        [
          { transform: 'translate(160px, 190px) scale(2.2)', opacity: 0 },
          { transform: 'translate(60px, 60px) scale(1.5)', opacity: 1, offset: 0.4 },
          { transform: 'translate(0, 0) scale(1)' },
        ],
        { duration: ms, easing: 'cubic-bezier(.3,.6,.4,1)' },
      );
      try {
        await a.finished;
      } catch {
        /* cancelled */
      }
      if (destroyed) return;
      wrap.classList.remove('thud');
      void wrap.offsetWidth;
      wrap.classList.add('thud');
    }
    sound.click();
    highlight(result.tier);
  }

  async function play(isAuto) {
    if (busy || !ctx.requireAuth()) return null;
    busy = true;
    if (!isAuto) panel.setBusy(true);
    try {
      const v = panel.values();
      const res = await api.post('/api/games/darts/bet', { amount: v.amount, currency: ctx.currency(), params: { difficulty } });
      if (destroyed) return null;
      ctx.debitView(res);
      sound.bet();
      await throwDart(res.bet.result, isAuto);
      if (destroyed) return null;
      const bet = res.bet;
      const win = bet.payout > bet.amount;
      if (win) bet.multiplier >= 8 ? sound.bigWin() : sound.win();
      else sound.lose();
      history.push({ label: fmt.multiplier(bet.multiplier), win, betId: bet.id });
      ctx.settle(res);
      if (!isAuto && ctx.animations()) await t.wait(120);
      return { win, profit: bet.payout - bet.amount };
    } finally {
      busy = false;
      if (!isAuto) panel.setBusy(false);
    }
  }

  panel.onChange((key, value) => {
    if (key === 'difficulty' && value !== difficulty) {
      difficulty = value;
      build();
    }
  });

  build();
  return {
    destroy() {
      destroyed = true;
      t.clear();
    },
  };
}
