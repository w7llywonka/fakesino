import { el } from '../dom.js';
import { amountField } from '../ui/controls.js';
import { createRound, ladderStrip, timers } from '../ui/stepgame.js';
import { DIFFICULTIES, maxSteps, multiplierFor, ladder } from '../shared/games/pump.js';

const DIFF_OPTIONS = DIFFICULTIES.map((d) => [d, d[0].toUpperCase() + d.slice(1)]);
const HUE = { easy: ['#69db7c', '#2b8a3e'], medium: ['#74c0fc', '#1864ab'], hard: ['#ffa94d', '#d9480f'], expert: ['#ff8fab', '#c2255c'] };

function balloonSvg(d) {
  const [hi, lo] = HUE[d];
  return `<svg class="pm-balloon" viewBox="0 0 200 250" aria-hidden="true">
    <defs><radialGradient id="pmFill-${d}" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".18" stop-color="${hi}"/><stop offset="1" stop-color="${lo}"/></radialGradient></defs>
    <path d="M100 8C52 8 18 46 18 96c0 52 40 98 76 108h12c36-10 76-56 76-108C182 46 148 8 100 8z" fill="url(#pmFill-${d})"/>
    <ellipse cx="66" cy="62" rx="16" ry="28" transform="rotate(28 66 62)" fill="#fff" opacity=".35"/>
    <path d="M92 204h16l-4 10h-8z" fill="${lo}"/>
  </svg>`;
}

const PUMP = `<svg class="pm-pump" viewBox="0 0 120 140" aria-hidden="true">
  <rect x="34" y="118" width="52" height="14" rx="5" fill="#495057"/>
  <rect x="44" y="50" width="32" height="72" rx="6" fill="#adb5bd"/><rect x="44" y="50" width="10" height="72" rx="4" fill="#dee2e6" opacity=".6"/>
  <g class="pm-handle"><rect x="57" y="8" width="6" height="48" fill="#868e96"/><rect x="26" y="2" width="68" height="12" rx="6" fill="#343a40"/></g>
  <path d="M76 110c18 0 22-16 24-40" stroke="#343a40" stroke-width="5" fill="none" stroke-linecap="round"/>
</svg>`;

export function renderPreview(result) {
  const n = maxSteps(result.difficulty || 'easy');
  const pops = new Set(result.dangers || []);
  const steps = Array.from({ length: n }, (_, i) => {
    const k = i + 1;
    const bg = k <= result.progress ? (result.lost && k === result.progress ? 'var(--red)' : 'var(--accent)') : pops.has(k) ? 'rgba(255,77,94,.35)' : 'var(--surface-3)';
    return `<span style="flex:1;height:22px;border-radius:4px;background:${bg}"></span>`;
  });
  return `<div style="width:100%"><div style="display:flex;gap:3px">${steps.join('')}</div><div class="muted" style="text-align:center;margin-top:6px">${result.lost ? `Popped on pump ${result.progress}` : `${result.progress} pump${result.progress === 1 ? '' : 's'}`} · ${result.difficulty}</div></div>`;
}

export default function mountPump(ctx) {
  const { fmt, sound } = ctx;
  const round = createRound(ctx, 'pump');
  const t = timers();
  let destroyed = false;
  let difficulty = 'easy';

  const panel = ctx.createBetPanel({
    fields: [
      amountField(),
      { key: 'difficulty', type: 'select', label: 'Difficulty', options: DIFF_OPTIONS, value: difficulty },
      { key: 'pumps', type: 'number', label: 'Pumps per round', value: 3, min: 1, max: maxSteps(difficulty), mode: 'auto' },
      { key: 'profit', type: 'profit', label: 'Total Profit (1.00×)' },
    ],
    onBet: () => (round.live ? cashout() : startRound()),
    auto: { run: () => autoRound() },
    hotkeys: { p: () => pump() },
  });
  const pumpBtn = el('<button class="btn btn-secondary btn-block pm-go" hidden>Pump</button>');
  panel.extra.append(pumpBtn);

  const stage = el(`<div class="pm-stage">
    <div class="stage-center"><div class="pm-scene">
      <div class="pm-bubble"><div class="pm-scale">${balloonSvg(difficulty)}<div class="pm-mult">1.00×</div></div><div class="pm-burst"></div></div>
      <div class="pm-string"></div>
      ${PUMP}
    </div></div>
    <div class="stage-caption pm-caption" aria-live="polite"><div class="main">Pump it up</div><div class="sub">Press Bet, then Pump — cash out before it pops</div></div>
    <div class="stage-bottom pm-bottom"></div>
  </div>`);
  ctx.stage.appendChild(stage);
  const history = ctx.historyStrip(stage, { max: 8 });
  stage.prepend(history.el);
  const scene = stage.querySelector('.pm-scene');
  const bubble = stage.querySelector('.pm-bubble');
  const scale = stage.querySelector('.pm-scale');
  const multEl = stage.querySelector('.pm-mult');
  const burst = stage.querySelector('.pm-burst');
  const caption = stage.querySelector('.pm-caption');
  const steps = ladderStrip(fmt, []);
  stage.querySelector('.pm-bottom').appendChild(steps.el);

  function setCaption(main, sub, cls = '') {
    caption.className = `stage-caption pm-caption ${cls}`;
    caption.querySelector('.main').textContent = main;
    caption.querySelector('.sub').innerHTML = sub;
  }

  function build() {
    scale.querySelector('.pm-balloon').outerHTML = balloonSvg(difficulty);
    steps.build(ladder(difficulty).map((m) => ({ m })));
    steps.update(0, { smooth: false });
  }

  function inflate(k, lost = false) {
    const n = maxSteps(difficulty);
    scale.style.setProperty('--s', (0.42 + 0.58 * Math.min(1, k / n)).toFixed(3));
    multEl.textContent = fmt.multiplier(k ? multiplierFor(difficulty, k) : 1);
    bubble.classList.toggle('popped', lost);
    if (!lost) burst.innerHTML = '';
  }

  function pop() {
    const [hi] = HUE[difficulty];
    burst.innerHTML = Array.from({ length: 12 }, (_, i) => `<i style="--a:${i * 30}deg;--c:${hi}"></i>`).join('');
    bubble.classList.add('popped');
    sound.bomb();
    scene.classList.remove('shake');
    void scene.offsetWidth;
    scene.classList.add('shake');
  }

  function paint(v) {
    inflate(v.lost ? Math.max(0, v.progress - 1) : v.progress, false);
    steps.update(v.lost ? v.progress - 1 : v.progress, { live: !v.done, lost: v.lost });
    if (v.lost) pop();
  }

  const pumpsTarget = () => Math.min(maxSteps(difficulty), Math.max(1, Math.round(Number(panel.get('pumps')) || 1)));

  function sync() {
    const live = round.live;
    const v = live ? round.game.state : null;
    panel.lock(live);
    pumpBtn.hidden = !live;
    pumpBtn.disabled = round.busy;
    const m = live ? v.multiplier : multiplierFor(difficulty, panel.mode === 'auto' ? pumpsTarget() : 1);
    panel.setLabel('profit', `${live ? 'Total Profit' : 'Profit on Win'} (${fmt.multiplier(m)})`);
    panel.setProfit(m);
    if (live) panel.setButton(v.progress ? `Cashout ${fmt.multiplier(v.multiplier)}` : 'Cashout', { disabled: round.busy || !v.progress });
    else if (!panel.autoRunning) panel.resetButton();
    scene.classList.toggle('live', live);
  }

  function finish(res, { fast = false } = {}) {
    const bet = res.bet;
    const v = res.game.state;
    const won = bet.payout > 0;
    if (won) {
      sound.cashout();
      setCaption(`Cashed out at ${fmt.multiplier(bet.multiplier)}`, `${v.progress} pump${v.progress === 1 ? '' : 's'} without a pop`, 'win');
      ctx.resultPop(scene, { multiplier: bet.multiplier, payout: bet.payout, currency: bet.currency, duration: fast ? 900 : 1600 });
    } else setCaption('Pop!', `The balloon burst on pump ${v.progress}`, 'lose');
    history.push({ label: fmt.multiplier(bet.multiplier), win: won, betId: bet.id });
    ctx.settle(res);
  }

  function animatePump() {
    if (!ctx.animations()) return;
    scene.classList.remove('pumping');
    void scene.offsetWidth;
    scene.classList.add('pumping');
  }

  async function startRound() {
    if (round.busy || !ctx.requireAuth()) return;
    const v = panel.values();
    if (!panel.checkBalance(v.amount)) return;
    panel.setBusy(true);
    try {
      const res = await round.start(v.amount, { difficulty });
      if (destroyed) return;
      if (res.restored) return restore(res.restored);
      sound.bet();
      ctx.setBalance(res.balance);
      paint(res.game.state);
      setCaption('Ready', `First pump pays ${fmt.multiplier(res.game.state.nextMultiplier)}`);
    } finally {
      panel.setBusy(false);
      sync();
    }
  }

  async function pump() {
    if (!round.live || round.busy) return;
    sound.click();
    animatePump();
    const pending = round.act('pump');
    sync();
    try {
      const res = await pending;
      if (destroyed) return;
      const v = res.game.state;
      if (ctx.animations()) await t.wait(160);
      if (destroyed) return;
      paint(v);
      if (v.lost) return finish(res);
      sound.reveal();
      if (res.bet) return finish(res);
      setCaption(fmt.multiplier(v.multiplier), `Next pump pays ${fmt.multiplier(v.nextMultiplier)}`, 'win');
    } finally {
      sync();
    }
  }

  async function cashout() {
    if (!round.live || round.busy || !round.game.state.progress) return;
    const pending = round.act('cashout');
    sync();
    try {
      const res = await pending;
      if (destroyed) return;
      steps.update(res.game.state.progress, {});
      finish(res);
    } finally {
      sync();
    }
  }

  async function autoRound() {
    const v = panel.values();
    const res = await round.start(v.amount, { difficulty, autoTarget: pumpsTarget() });
    if (destroyed) return null;
    if (res.restored) {
      restore(res.restored);
      return null;
    }
    ctx.debitView(res);
    sound.bet();
    const s = res.game.state;
    const anim = ctx.animations();
    inflate(0);
    for (let k = 1; k <= s.progress && !destroyed; k++) {
      animatePump();
      if (anim) await t.wait(110);
      if (s.lost && k === s.progress) break;
      inflate(k);
      steps.update(k, { live: true, smooth: false });
      sound.tick();
    }
    if (destroyed) return null;
    paint(s);
    finish(res, { fast: true });
    if (anim) await t.wait(s.lost ? 450 : 650);
    return { win: res.bet.payout > res.bet.amount, profit: res.bet.payout - res.bet.amount };
  }

  function restore(game) {
    if (game.params?.difficulty && game.params.difficulty !== difficulty) {
      difficulty = game.params.difficulty;
      panel.set('difficulty', difficulty);
      build();
    }
    if (game.currency === ctx.currency()) panel.set('amount', game.amount);
    paint(game.state);
    setCaption('Round in progress', `${fmt.multiplier(game.state.multiplier)} · next pump pays ${fmt.multiplier(game.state.nextMultiplier)}`);
    sync();
  }

  pumpBtn.addEventListener('click', pump);
  bubble.addEventListener('click', () => round.live && pump());
  panel.onChange((key, value) => {
    if (key === 'difficulty' && value !== difficulty) {
      difficulty = value;
      build();
      inflate(0);
      setCaption('Pump it up', 'Press Bet, then Pump — cash out before it pops');
    }
    if (key === 'mode' || key === 'pumps' || key === 'amount' || key === 'autoStopped') sync();
  });

  async function resume() {
    const game = await round.resume();
    if (game && !destroyed) restore(game);
  }

  build();
  inflate(0);
  sync();
  resume();
  ctx.on('user', resume);

  return {
    destroy() {
      destroyed = true;
      t.clear();
    },
  };
}
