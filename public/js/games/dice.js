import { el, sleep } from '../dom.js';
import { amountField } from '../ui/controls.js';
import { chanceFor, multiplierFor, MIN_CHANCE, MAX_CHANCE } from '../shared/games/dice.js';

export default function mountDice(ctx) {
  const { api, fmt, sound } = ctx;
  let condition = 'over';
  let target = 50.5;

  const panel = ctx.createBetPanel({
    fields: [amountField(), { key: 'profit', type: 'profit', label: 'Profit on Win' }],
    onBet: () => play(false),
    auto: { run: () => play(true) },
  });

  const stage = el(`<div class="dice-stage">
    <div class="dice-board">
      <div class="dice-track-wrap">
        <div class="dice-labels">${[0, 25, 50, 75, 100].map((n) => `<span style="left:${n}%">${n}</span>`).join('')}</div>
        <div class="dice-track">
          <div class="dice-range"><div class="dice-lose"></div><div class="dice-win"></div></div>
          <input type="range" class="dice-slider" min="2" max="98" step="0.01" value="${target}" aria-label="Target">
          <div class="dice-rail"><div class="dice-result" hidden><div class="dice-cube"><span></span></div></div></div>
        </div>
      </div>
    </div>
    <div class="stage-bottom"><div class="stat-tiles dice-tiles">
      <div class="bp-field"><div class="bp-label">Multiplier</div><div class="input-suffix"><input class="input" data-k="mult" inputmode="decimal"><span class="suffix">×</span></div></div>
      <div class="bp-field"><div class="bp-label" data-k="cond-label">Roll Over</div><button class="input dice-flip" data-k="flip"><span></span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg></button></div>
      <div class="bp-field"><div class="bp-label">Win Chance</div><div class="input-suffix"><input class="input" data-k="chance" inputmode="decimal"><span class="suffix">%</span></div></div>
    </div></div>
  </div>`);
  ctx.stage.appendChild(stage);
  const history = ctx.historyStrip(stage, { max: 6 });
  stage.prepend(history.el);

  const slider = stage.querySelector('.dice-slider');
  const lose = stage.querySelector('.dice-lose');
  const win = stage.querySelector('.dice-win');
  const multInput = stage.querySelector('[data-k=mult]');
  const chanceInput = stage.querySelector('[data-k=chance]');
  const flipBtn = stage.querySelector('[data-k=flip]');
  const condLabel = stage.querySelector('[data-k=cond-label]');
  const result = stage.querySelector('.dice-result');
  const resultText = result.querySelector('span');

  const clampTarget = (t) => {
    const chance = chanceFor({ target: t, condition });
    if (chance > MAX_CHANCE) t = condition === 'over' ? 100 - MAX_CHANCE : MAX_CHANCE;
    if (chance < MIN_CHANCE) t = condition === 'over' ? 100 - MIN_CHANCE : MIN_CHANCE;
    return Math.round(t * 100) / 100;
  };

  function render({ keep } = {}) {
    const chance = chanceFor({ target, condition });
    const mult = multiplierFor({ target, condition });
    slider.value = target;
    const pct = target;
    if (condition === 'over') {
      lose.style.cssText = `left:0;width:${pct}%`;
      win.style.cssText = `left:${pct}%;width:${100 - pct}%`;
    } else {
      win.style.cssText = `left:0;width:${pct}%`;
      lose.style.cssText = `left:${pct}%;width:${100 - pct}%`;
    }
    if (keep !== 'mult') multInput.value = mult.toFixed(4);
    if (keep !== 'chance') chanceInput.value = chance.toFixed(4);
    condLabel.textContent = condition === 'over' ? 'Roll Over' : 'Roll Under';
    flipBtn.querySelector('span').textContent = target.toFixed(2);
    panel.setProfit(mult);
  }

  slider.addEventListener('input', () => {
    target = clampTarget(Number(slider.value));
    render();
    sound.tick();
  });
  flipBtn.addEventListener('click', () => {
    condition = condition === 'over' ? 'under' : 'over';
    target = Math.round((100 - target) * 100) / 100;
    render();
  });
  multInput.addEventListener('input', () => {
    const m = Number(multInput.value);
    if (!(m >= 1.0102)) return;
    const chance = Math.min(MAX_CHANCE, Math.max(MIN_CHANCE, 99 / m));
    target = clampTarget(condition === 'over' ? 100 - chance : chance);
    render({ keep: 'mult' });
  });
  chanceInput.addEventListener('input', () => {
    const c = Number(chanceInput.value);
    if (!(c >= MIN_CHANCE && c <= MAX_CHANCE)) return;
    target = clampTarget(condition === 'over' ? 100 - c : c);
    render({ keep: 'chance' });
  });
  for (const input of [multInput, chanceInput]) input.addEventListener('blur', () => render());

  let busy = false;
  async function play(isAuto) {
    if (busy) return null;
    if (!ctx.requireAuth()) return null;
    busy = true;
    if (!isAuto) panel.setBusy(true);
    try {
      const v = panel.values();
      const res = await api.post('/api/games/dice/bet', { amount: v.amount, currency: ctx.currency(), params: { target, condition } });
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

  render();
  return { destroy() {} };
}
