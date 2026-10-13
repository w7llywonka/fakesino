import { el } from '../dom.js';
import { amountField, stepFor } from '../ui/controls.js';
import { helpTip } from '../ui/helptip.js';
import { winChance, MIN_TARGET, MAX_TARGET } from '../shared/games/limbo.js';

const MIN_CHANCE = winChance(MAX_TARGET);
const MAX_CHANCE = winChance(MIN_TARGET);
const floor2 = (n) => Math.floor(n * 100 + 1e-9) / 100;
const clampTarget = (t) => Math.min(MAX_TARGET, Math.max(MIN_TARGET, Math.round(t * 100) / 100));
const fmtChance = (c) => (c >= 0.01 ? c.toFixed(4) : c.toFixed(8));
const parse = (v) => Number(String(v).replace(/,/g, '').trim());

export default function mountLimbo(ctx) {
  const { api, fmt, sound } = ctx;
  let target = 2;
  let busy = false;
  let alive = true;
  let raf = 0;

  const panel = ctx.createBetPanel({
    fields: [amountField(), { key: 'profit', type: 'profit', label: 'Profit on Win' }],
    onBet: () => play(false),
    auto: { run: () => play(true) },
    hotkeys: { w: () => nudge(-1), e: () => nudge(1) },
    // Advanced autobet: win-chance actions map to the target multiplier.
    chance: {
      get: () => winChance(target),
      set: (c) => {
        target = clampTarget(winChance(1) / c);
        render();
      },
      min: MIN_CHANCE,
      max: MAX_CHANCE,
    },
  });

  const stage = el(`<div class="limbo-stage">
    <div class="stage-center limbo-center">
      <div class="limbo-glow"></div>
      <div class="limbo-mult" aria-live="polite">1.00×</div>
    </div>
    <div class="stage-bottom"><div class="stat-tiles limbo-tiles">
      <div class="bp-field"><div class="bp-label"><span>Target Multiplier</span>${helpTip('Target Multiplier')}</div><div class="input-suffix"><input class="input" data-k="target" inputmode="decimal" autocomplete="off" aria-label="Target multiplier"><span class="suffix">×</span></div></div>
      <div class="bp-field"><div class="bp-label"><span>Win Chance</span>${helpTip('Win Chance')}</div><div class="input-suffix"><input class="input" data-k="chance" inputmode="decimal" autocomplete="off" aria-label="Win chance"><span class="suffix">%</span></div></div>
    </div></div>
  </div>`);
  ctx.stage.appendChild(stage);
  const history = ctx.historyStrip(stage, { max: 6 });
  stage.prepend(history.el);

  const center = stage.querySelector('.limbo-center');
  const multEl = stage.querySelector('.limbo-mult');
  const targetIn = stage.querySelector('[data-k=target]');
  const chanceIn = stage.querySelector('[data-k=chance]');

  function render(keep) {
    if (keep !== 'target') targetIn.value = target.toFixed(2);
    if (keep !== 'chance') chanceIn.value = fmtChance(winChance(target));
    panel.setProfit(target);
  }

  targetIn.addEventListener('input', () => {
    const t = parse(targetIn.value);
    if (!(t >= MIN_TARGET && t <= MAX_TARGET)) return;
    target = clampTarget(t);
    render('target');
  });
  chanceIn.addEventListener('input', () => {
    const c = parse(chanceIn.value);
    if (!(c >= MIN_CHANCE && c <= MAX_CHANCE)) return;
    target = clampTarget(winChance(1) / c);
    render('chance');
  });
  targetIn.addEventListener('blur', () => {
    const t = parse(targetIn.value);
    if (Number.isFinite(t) && t > 0) target = clampTarget(t);
    render();
  });
  chanceIn.addEventListener('blur', () => {
    const c = parse(chanceIn.value);
    if (Number.isFinite(c) && c > 0) target = clampTarget(winChance(1) / Math.min(MAX_CHANCE, Math.max(MIN_CHANCE, c)));
    render();
  });
  for (const input of [targetIn, chanceIn]) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
    });
  }

  function nudge(dir) {
    if (busy || panel.autoRunning) return;
    target = clampTarget(target + dir * stepFor(target, dir));
    render();
  }

  function setTilesDisabled(d) {
    targetIn.disabled = d;
    chanceIn.disabled = d;
  }
  panel.onChange((key) => {
    if (key === 'autoStopped') setTilesDisabled(false);
  });

  // Size the number for its final width so it doesn't jump while counting.
  function show(value, final) {
    multEl.textContent = fmt.multiplier(floor2(value));
    if (final != null) multEl.style.setProperty('--chars', Math.max(6, fmt.multiplier(final).length));
  }

  function countUp(result, ms) {
    cancelAnimationFrame(raf);
    show(1, result);
    if (!ms || !alive) {
      show(result);
      return Promise.resolve();
    }
    const lnR = Math.log(result);
    const start = performance.now();
    return new Promise((resolve) => {
      const tick = (now) => {
        if (!alive) return resolve();
        const t = Math.min(1, (now - start) / ms);
        const e = 1 - Math.pow(1 - t, 3);
        show(t >= 1 ? result : Math.exp(lnR * e));
        if (t < 1) raf = requestAnimationFrame(tick);
        else resolve();
      };
      raf = requestAnimationFrame(tick);
    });
  }

  async function play(isAuto) {
    if (busy) return null;
    if (!ctx.requireAuth()) return null;
    busy = true;
    if (!isAuto) panel.setBusy(true);
    else setTilesDisabled(true);
    try {
      const v = panel.values();
      const res = await api.post('/api/games/limbo/bet', { amount: v.amount, currency: ctx.currency(), params: { target } });
      ctx.debitView(res);
      sound.bet();
      const { result, win } = res.bet.result;
      center.classList.remove('win', 'lose', 'done');
      center.classList.add('running');
      await countUp(result, ctx.animations() ? (isAuto ? 320 : 520) : 0);
      center.classList.remove('running');
      // Restart the landing pop.
      void multEl.offsetWidth;
      center.classList.add('done', win ? 'win' : 'lose');
      win ? sound.win() : sound.lose();
      history.push({ label: fmt.multiplier(result), win, betId: res.bet.id });
      ctx.settle(res);
      return { win: res.bet.payout > res.bet.amount, profit: res.bet.payout - res.bet.amount };
    } finally {
      busy = false;
      if (!isAuto) panel.setBusy(false);
    }
  }

  render();
  show(1, 1);
  function destroy() {
    alive = false;
    cancelAnimationFrame(raf);
  }
  ctx.onDestroy(destroy);
  return { destroy };
}
