import { el, on, sleep } from '../dom.js';
import { amountField } from '../ui/controls.js';
import { helpTip } from '../ui/helptip.js';
import { chanceFor, multiplierFor, winRanges, MIN_CHANCE, MAX_CHANCE } from '../shared/games/dice.js';

const MODES = [
  ['classic', 'Over/Under'],
  ['between', 'Between'],
  ['outside', 'Outside'],
  ['between2', 'Two Ranges'],
];
const BOUND_KEYS = { between: ['low', 'high'], outside: ['low', 'high'], between2: ['low', 'high', 'low2', 'high2'] };
const BOUND_LABEL = { low: 'Low', high: 'High', low2: 'Low 2', high2: 'High 2' };
const r2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export default function mountDice(ctx) {
  const { api, fmt, sound } = ctx;
  let mode = 'classic';
  let condition = 'over';
  let target = 50.5;
  let bounds = { low: 25, high: 75, low2: 80, high2: 90 };

  const panel = ctx.createBetPanel({
    fields: [amountField(), { key: 'profit', type: 'profit', label: 'Profit on Win' }],
    onBet: () => play(false),
    auto: { run: () => play(true) },
    hotkeys: { q: () => flip(), w: () => nudge(-1), e: () => nudge(1) },
    // Advanced autobet: win-chance actions and over/under switching.
    chance: {
      get: () => chance(),
      set: (c) => {
        fitChance(c);
        render();
      },
      min: MIN_CHANCE,
      max: MAX_CHANCE,
      switchOverUnder: () => {
        if (mode === 'classic') {
          condition = condition === 'over' ? 'under' : 'over';
          target = r2(100 - target);
        } else if (mode === 'between' || mode === 'outside') {
          const next = mode === 'between' ? 'outside' : 'between';
          const prev = mode;
          mode = next;
          if (!validChance(chance())) mode = prev;
          else {
            modesEl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
            buildHandles();
          }
        }
        render();
      },
    },
  });

  const stage = el(`<div class="dice-stage">
    <div class="dice-board">
      <div class="dice-track-wrap">
        <div class="dice-labels">${[0, 25, 50, 75, 100].map((n) => `<span style="left:${n}%">${n}</span>`).join('')}</div>
        <div class="dice-track">
          <div class="dice-range"></div>
          <div class="dice-handles"></div>
          <div class="dice-rail"><div class="dice-result" hidden><div class="dice-cube"><span></span></div></div></div>
        </div>
      </div>
    </div>
    <div class="stage-bottom">
      <div class="dice-modes segmented" role="tablist" aria-label="Dice mode">${MODES.map(([k, l]) => `<button data-mode="${k}" class="${k === mode ? 'active' : ''}">${l}</button>`).join('')}</div>
      <div class="dice-bounds" hidden></div>
      <div class="stat-tiles dice-tiles">
        <div class="bp-field"><div class="bp-label"><span>Multiplier</span>${helpTip('Multiplier')}</div><div class="input-suffix"><input class="input" data-k="mult" inputmode="decimal"><span class="suffix">×</span></div></div>
        <div class="bp-field"><div class="bp-label"><span data-k="cond-label">Roll Over</span>${helpTip('Roll Over')}</div><button class="input dice-flip" data-k="flip"><span></span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg></button></div>
        <div class="bp-field"><div class="bp-label"><span>Win Chance</span>${helpTip('Win Chance')}</div><div class="input-suffix"><input class="input" data-k="chance" inputmode="decimal"><span class="suffix">%</span></div></div>
      </div>
    </div>
  </div>`);
  ctx.stage.appendChild(stage);
  const history = ctx.historyStrip(stage, { max: 6 });
  stage.prepend(history.el);

  const rangeEl = stage.querySelector('.dice-range');
  const handlesEl = stage.querySelector('.dice-handles');
  const boundsEl = stage.querySelector('.dice-bounds');
  const modesEl = stage.querySelector('.dice-modes');
  const multInput = stage.querySelector('[data-k=mult]');
  const chanceInput = stage.querySelector('[data-k=chance]');
  const flipBtn = stage.querySelector('[data-k=flip]');
  const condLabel = stage.querySelector('[data-k=cond-label]');
  const result = stage.querySelector('.dice-result');
  const resultText = result.querySelector('span');

  const params = () => (mode === 'classic' ? { target, condition } : { condition: mode, ...Object.fromEntries(BOUND_KEYS[mode].map((k) => [k, bounds[k]])) });
  const chance = () => chanceFor(params());
  const validChance = (c) => c >= MIN_CHANCE && c <= MAX_CHANCE;

  // ---- handles ----
  function buildHandles() {
    const keys = mode === 'classic' ? ['target'] : BOUND_KEYS[mode];
    handlesEl.innerHTML = keys
      .map((k) => `<input type="range" class="dice-slider" data-k="${k}" min="${k === 'target' ? 2 : 0}" max="${k === 'target' ? 98 : 100}" step="0.01" aria-label="${k === 'target' ? 'Target' : BOUND_LABEL[k]}">`)
      .join('');
    handlesEl.classList.toggle('multi', keys.length > 1);
    boundsEl.hidden = mode === 'classic';
    boundsEl.innerHTML =
      mode === 'classic'
        ? ''
        : BOUND_KEYS[mode].map((k) => `<div class="bp-field"><div class="bp-label">${BOUND_LABEL[k]}</div><input class="input" data-b="${k}" inputmode="decimal" autocomplete="off"></div>`).join('');
    boundsEl.dataset.n = mode === 'classic' ? 0 : BOUND_KEYS[mode].length;
  }

  // Keep bounds ordered (low < high ≤ low2 < high2) and the chance in range.
  function setBound(key, value) {
    const keys = BOUND_KEYS[mode];
    const i = keys.indexOf(key);
    const prev = { ...bounds };
    let v = r2(clamp(value, 0, 100));
    // Neighbours: a range's own pair needs a 0.01 gap; adjacent ranges may touch.
    const lo = i === 0 ? 0 : bounds[keys[i - 1]] + (i % 2 ? 0.01 : 0);
    const hi = i === keys.length - 1 ? 100 : bounds[keys[i + 1]] - (i % 2 ? 0 : 0.01);
    v = r2(clamp(v, lo, hi));
    bounds[key] = v;
    if (!validChance(chance())) bounds = prev;
  }

  // Resize the ranges around their centres to hit a win chance.
  function fitChance(c) {
    c = clamp(c, MIN_CHANCE, MAX_CHANCE);
    if (mode === 'classic') {
      target = clampTarget(condition === 'over' ? 100 - c : c);
      return;
    }
    const scale = (a, b, w) => {
      const m = (a + b) / 2;
      let lo = m - w / 2;
      let hi = m + w / 2;
      if (lo < 0) [lo, hi] = [0, w];
      if (hi > 100) [lo, hi] = [100 - w, 100];
      return [r2(lo), r2(lo + r2(w))];
    };
    const prev = { ...bounds };
    if (mode === 'between') [bounds.low, bounds.high] = scale(bounds.low, bounds.high, c);
    else if (mode === 'outside') [bounds.low, bounds.high] = scale(bounds.low, bounds.high, 100 - c);
    else {
      const w1 = bounds.high - bounds.low;
      const w2 = bounds.high2 - bounds.low2;
      const k = c / (w1 + w2);
      const a = scale(bounds.low, bounds.high, Math.max(0.01, r2(w1 * k)));
      const b = scale(bounds.low2, bounds.high2, Math.max(0.01, r2(c - Math.max(0.01, r2(w1 * k)))));
      // Push apart if they now overlap.
      if (a[1] > b[0]) {
        const shift = a[1] - b[0];
        if (b[1] + shift <= 100) b.splice(0, 2, r2(b[0] + shift), r2(b[1] + shift));
        else a.splice(0, 2, r2(a[0] - shift), r2(a[1] - shift));
      }
      [bounds.low, bounds.high, bounds.low2, bounds.high2] = [...a, ...b];
    }
    if (!(bounds.low >= 0 && bounds.low < bounds.high) || !validChance(chance())) bounds = prev;
  }

  const clampTarget = (t) => {
    const c = chanceFor({ target: t, condition });
    if (c > MAX_CHANCE) t = condition === 'over' ? 100 - MAX_CHANCE : MAX_CHANCE;
    if (c < MIN_CHANCE) t = condition === 'over' ? 100 - MIN_CHANCE : MIN_CHANCE;
    return r2(t);
  };

  function render({ keep } = {}) {
    const p = params();
    const c = chanceFor(p);
    const m = multiplierFor(p);
    rangeEl.innerHTML = winRanges(p)
      .map(([a, b]) => `<div class="dice-win" style="left:${a}%;width:${b - a}%"></div>`)
      .join('');
    handlesEl.querySelectorAll('input').forEach((h) => {
      const k = h.dataset.k;
      h.value = k === 'target' ? target : bounds[k];
    });
    boundsEl.querySelectorAll('[data-b]').forEach((i) => {
      if (keep !== i.dataset.b) i.value = bounds[i.dataset.b].toFixed(2);
    });
    if (keep !== 'mult') multInput.value = m.toFixed(4);
    if (keep !== 'chance') chanceInput.value = c.toFixed(4);
    if (mode === 'classic') {
      condLabel.textContent = condition === 'over' ? 'Roll Over' : 'Roll Under';
      flipBtn.querySelector('span').textContent = target.toFixed(2);
    } else {
      condLabel.textContent = { between: 'Roll Between', outside: 'Roll Outside', between2: 'Roll In Either' }[mode];
      flipBtn.querySelector('span').textContent =
        mode === 'between2' ? `${bounds.low.toFixed(2)}–${bounds.high.toFixed(2)} · ${bounds.low2.toFixed(2)}–${bounds.high2.toFixed(2)}` : `${bounds.low.toFixed(2)} – ${bounds.high.toFixed(2)}`;
    }
    flipBtn.classList.toggle('static', mode === 'between2');
    panel.setProfit(m);
  }

  function setMode(next) {
    if (busy || panel.autoRunning || next === mode) return;
    mode = next;
    modesEl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    if (mode === 'between2' && !(bounds.high <= bounds.low2)) bounds = { ...bounds, low2: Math.min(99, bounds.high + 5), high2: 100 };
    if (mode !== 'classic' && !validChance(chance())) bounds = mode === 'between2' ? { low: 10, high: 30, low2: 70, high2: 90 } : { ...bounds, low: 25, high: 75 };
    buildHandles();
    render();
  }

  // Q: over ⇄ under, between ⇄ outside.
  function flip() {
    if (busy || panel.autoRunning) return;
    if (mode === 'classic') {
      condition = condition === 'over' ? 'under' : 'over';
      target = r2(100 - target);
    } else if (mode === 'between' || mode === 'outside') {
      const next = mode === 'between' ? 'outside' : 'between';
      const prev = mode;
      mode = next;
      if (!validChance(chance())) mode = prev;
      else {
        modesEl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
        buildHandles();
      }
    }
    render();
  }

  // W / E: move the target, or slide the whole range, by one.
  function nudge(d) {
    if (busy || panel.autoRunning) return;
    if (mode === 'classic') target = clampTarget(target + d);
    else {
      const keys = BOUND_KEYS[mode];
      const vals = keys.map((k) => bounds[k] + d);
      if (vals[0] >= 0 && vals[vals.length - 1] <= 100) keys.forEach((k, i) => (bounds[k] = r2(vals[i])));
    }
    render();
  }

  on(handlesEl, 'input', 'input', (e, h) => {
    const v = Number(h.value);
    if (h.dataset.k === 'target') target = clampTarget(v);
    else setBound(h.dataset.k, v);
    render();
    sound.tick();
  });
  on(boundsEl, 'input', '[data-b]', (e, i) => {
    const v = Number(i.value);
    if (!Number.isFinite(v)) return;
    setBound(i.dataset.b, v);
    render({ keep: i.dataset.b });
  });
  on(boundsEl, 'focusout', '[data-b]', () => render());
  on(modesEl, 'click', 'button[data-mode]', (e, b) => setMode(b.dataset.mode));
  flipBtn.addEventListener('click', flip);
  multInput.addEventListener('input', () => {
    const m = Number(multInput.value);
    if (!(m >= 1.0102)) return;
    fitChance(99 / m);
    render({ keep: 'mult' });
  });
  chanceInput.addEventListener('input', () => {
    const c = Number(chanceInput.value);
    if (!validChance(c)) return;
    fitChance(c);
    render({ keep: 'chance' });
  });
  for (const input of [multInput, chanceInput]) input.addEventListener('blur', () => render());

  function setControlsDisabled(d) {
    stage.querySelectorAll('.dice-handles input, .dice-bounds input, .dice-modes button, .dice-flip').forEach((x) => (x.disabled = d));
  }
  panel.onChange((key) => {
    if (key === 'autoStopped') setControlsDisabled(false);
  });

  let busy = false;
  async function play(isAuto) {
    if (busy) return null;
    if (!ctx.requireAuth()) return null;
    busy = true;
    if (!isAuto) panel.setBusy(true);
    else setControlsDisabled(true);
    try {
      const v = panel.values();
      const res = await api.post('/api/games/dice/bet', { amount: v.amount, currency: ctx.currency(), params: params() });
      ctx.debitView(res);
      sound.bet();
      const { roll, win: won } = res.bet.result;
      result.hidden = false;
      result.classList.toggle('win', won);
      result.classList.toggle('lose', !won);
      result.style.transition = ctx.animations() ? 'left .3s cubic-bezier(.2,.8,.3,1)' : 'none';
      result.style.left = `${roll}%`;
      resultText.textContent = roll.toFixed(2);
      if (ctx.animations()) await sleep(isAuto ? 220 : 320);
      won ? sound.win() : sound.lose();
      history.push({ label: roll.toFixed(2), win: won, betId: res.bet.id });
      ctx.settle(res);
      return { win: won, profit: res.bet.payout - res.bet.amount };
    } finally {
      busy = false;
      if (!isAuto) panel.setBusy(false);
    }
  }

  buildHandles();
  render();
  return { destroy() {} };
}
