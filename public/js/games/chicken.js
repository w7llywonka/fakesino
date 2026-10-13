import { el, on } from '../dom.js';
import { amountField } from '../ui/controls.js';
import { createRound, timers } from '../ui/stepgame.js';
import { DIFFICULTIES, maxSteps, multiplierFor } from '../shared/games/chicken.js';

const DIFF_OPTIONS = DIFFICULTIES.map((d) => [d, d[0].toUpperCase() + d.slice(1)]);

const CHICKEN = `<svg class="ck-bird" viewBox="0 0 64 72" aria-hidden="true">
  <ellipse cx="32" cy="68" rx="18" ry="4" fill="#000" opacity=".25"/>
  <path d="M24 58v8M40 58v8M20 66h8M36 66h8" stroke="#f59f00" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M32 18c-13 0-22 11-22 24 0 11 9 18 22 18s22-7 22-18c0-13-9-24-22-24z" fill="#fff"/>
  <path d="M12 42c3 7 10 11 20 11s17-4 20-11c-3 13-10 18-20 18S15 55 12 42z" fill="#dfe3e8"/>
  <path d="M17 38c-5 2-7 7-5 11 5-1 9-5 10-9z" fill="#e9ecef"/><path d="M47 38c5 2 7 7 5 11-5-1-9-5-10-9z" fill="#e9ecef"/>
  <path d="M25 10c1-6 5-8 7-5 1-5 6-5 7 0 3-2 6 0 4 5-4 1-12 3-18 0z" fill="#ff4d5e"/>
  <circle cx="26" cy="27" r="3" fill="#1c1c28"/><circle cx="38" cy="27" r="3" fill="#1c1c28"/><circle cx="27" cy="26" r="1" fill="#fff"/><circle cx="39" cy="26" r="1" fill="#fff"/>
  <path d="M28 31h8l-4 6z" fill="#ffa94d"/><path d="M30 37c0 3 4 3 4 0z" fill="#ff4d5e"/>
</svg>`;

const CAR = (color) => `<svg class="ck-car" viewBox="0 0 48 84" aria-hidden="true">
  <rect x="4" y="2" width="40" height="80" rx="12" fill="${color}"/>
  <rect x="9" y="14" width="30" height="16" rx="4" fill="#bfe3ff" opacity=".9"/>
  <rect x="9" y="56" width="30" height="12" rx="4" fill="#bfe3ff" opacity=".7"/>
  <rect x="10" y="32" width="28" height="22" rx="4" fill="#000" opacity=".12"/>
  <rect x="7" y="76" width="9" height="4" rx="2" fill="#ffe066"/><rect x="32" y="76" width="9" height="4" rx="2" fill="#ffe066"/>
  <rect x="7" y="3" width="9" height="3" rx="1.5" fill="#ff6b6b"/><rect x="32" y="3" width="9" height="3" rx="1.5" fill="#ff6b6b"/>
</svg>`;
const CAR_COLORS = ['#4c6ef5', '#fab005', '#e64980', '#12b886', '#fd7e14', '#7950f2'];

export function renderPreview(result) {
  const n = maxSteps(result.difficulty || 'easy');
  const dangers = new Set(result.dangers || []);
  const lanes = Array.from({ length: n }, (_, i) => {
    const k = i + 1;
    const bg = k <= result.progress ? (result.lost && k === result.progress ? 'var(--red)' : 'var(--accent)') : dangers.has(k) ? 'rgba(255,77,94,.35)' : 'var(--surface-3)';
    return `<span style="flex:1;height:26px;border-radius:4px;background:${bg};display:grid;place-items:center;font-size:10px;font-weight:800">${dangers.has(k) ? '🚗' : ''}</span>`;
  });
  return `<div style="width:100%"><div style="display:flex;gap:3px">${lanes.join('')}</div><div class="muted" style="text-align:center;margin-top:6px">${result.lost ? `Hit on lane ${result.progress}` : `Crossed ${result.progress} lane${result.progress === 1 ? '' : 's'}`} · ${result.difficulty}</div></div>`;
}

export default function mountChicken(ctx) {
  const { fmt, sound } = ctx;
  const round = createRound(ctx, 'chicken');
  const t = timers();
  let destroyed = false;
  let difficulty = 'easy';
  let view = null; // last state shown on the road

  const panel = ctx.createBetPanel({
    fields: [
      amountField(),
      { key: 'difficulty', type: 'select', label: 'Difficulty', options: DIFF_OPTIONS, value: difficulty },
      { key: 'lanes', type: 'number', label: 'Lanes to cross', value: 3, min: 1, max: maxSteps(difficulty), mode: 'auto' },
      { key: 'profit', type: 'profit', label: 'Total Profit (1.00×)' },
    ],
    onBet: () => (round.live ? cashout() : startRound()),
    auto: { run: () => autoRound() },
    hotkeys: { g: () => go() },
  });
  const goBtn = el('<button class="btn btn-secondary btn-block ck-go" hidden>Go</button>');
  panel.extra.append(goBtn);

  const stage = el(`<div class="ck-stage">
    <div class="ck-road-wrap"><div class="ck-road"></div></div>
    <div class="stage-caption ck-caption" aria-live="polite"><div class="main">Why did the chicken cross the road?</div><div class="sub">Press Bet, then Go one lane at a time</div></div>
  </div>`);
  ctx.stage.appendChild(stage);
  const history = ctx.historyStrip(stage, { max: 8 });
  stage.prepend(history.el);
  const roadWrap = stage.querySelector('.ck-road-wrap');
  const road = stage.querySelector('.ck-road');
  const caption = stage.querySelector('.ck-caption');
  let lanes = [];
  let bird;

  function setCaption(main, sub, cls = '') {
    caption.className = `stage-caption ck-caption ${cls}`;
    caption.querySelector('.main').textContent = main;
    caption.querySelector('.sub').innerHTML = sub;
  }

  function build() {
    const n = maxSteps(difficulty);
    road.innerHTML = `<div class="ck-curb start"><div class="ck-spot" data-k="0"></div></div>${Array.from(
      { length: n },
      (_, i) => `<div class="ck-lane" data-k="${i + 1}"><div class="ck-cover"><span>${fmt.multiplier(multiplierFor(difficulty, i + 1))}</span></div><div class="ck-spot"></div></div>`,
    ).join('')}<div class="ck-curb end"><div class="ck-flag">🏁</div></div>`;
    lanes = [road.querySelector('.ck-curb.start'), ...road.querySelectorAll('.ck-lane')];
    bird = el(`<div class="ck-chicken">${CHICKEN}</div>`);
    road.appendChild(bird);
    placeBird(0, false);
  }

  function placeBird(k, smooth = true) {
    const target = lanes[k];
    if (!target || !bird) return;
    bird.classList.toggle('instant', !smooth || !ctx.animations());
    bird.style.left = `${target.offsetLeft + target.offsetWidth / 2}px`;
    // Keep the chicken in view.
    const x = target.offsetLeft + target.offsetWidth / 2 - roadWrap.clientWidth / 2;
    roadWrap.scrollTo({ left: Math.max(0, x), behavior: smooth && ctx.animations() ? 'smooth' : 'auto' });
  }

  function paint(v, { animate = false } = {}) {
    view = v;
    const dangers = new Set(v.dangers || []);
    lanes.forEach((lane, k) => {
      if (!k) return;
      lane.classList.toggle('crossed', k <= v.progress && !(v.lost && k === v.progress));
      lane.classList.toggle('next', !v.done && k === v.progress + 1);
      lane.classList.toggle('hit', v.lost && k === v.progress);
      const danger = v.done && dangers.has(k);
      lane.classList.toggle('danger', danger);
      lane.querySelector('.ck-car')?.remove();
      if (v.lost && k === v.progress) lane.insertAdjacentHTML('beforeend', CAR(CAR_COLORS[k % CAR_COLORS.length]).replace('ck-car', 'ck-car stopped'));
      else if (danger) lane.insertAdjacentHTML('beforeend', CAR(CAR_COLORS[k % CAR_COLORS.length]).replace('ck-car', 'ck-car parked'));
    });
    bird.classList.toggle('dead', !!v.lost);
    placeBird(v.progress, animate);
  }

  async function crash(k) {
    const lane = lanes[k];
    lane.insertAdjacentHTML('beforeend', CAR(CAR_COLORS[k % CAR_COLORS.length]).replace('ck-car', 'ck-car crash'));
    sound.bomb();
    if (ctx.animations()) await t.wait(360);
    if (destroyed) return;
    bird.classList.add('dead');
    roadWrap.classList.remove('shake');
    void roadWrap.offsetWidth;
    roadWrap.classList.add('shake');
  }

  function sync() {
    const live = round.live;
    const v = live ? round.game.state : null;
    panel.lock(live);
    goBtn.hidden = !live;
    goBtn.disabled = round.busy;
    const m = live ? v.multiplier : multiplierFor(difficulty, panel.mode === 'auto' ? lanesTarget() : 1);
    panel.setLabel('profit', `${live ? 'Total Profit' : 'Profit on Win'} (${fmt.multiplier(m)})`);
    panel.setProfit(m);
    if (live) panel.setButton(v.progress ? `Cashout ${fmt.multiplier(v.multiplier)}` : 'Cashout', { disabled: round.busy || !v.progress });
    else if (!panel.autoRunning) panel.resetButton();
    roadWrap.classList.toggle('live', live);
  }

  const lanesTarget = () => Math.min(maxSteps(difficulty), Math.max(1, Math.round(Number(panel.get('lanes')) || 1)));

  function finish(res, { fast = false } = {}) {
    const bet = res.bet;
    const v = res.game.state;
    const won = bet.payout > 0;
    if (won) {
      sound.cashout();
      setCaption(`Cashed out at ${fmt.multiplier(bet.multiplier)}`, `Crossed ${v.progress} lane${v.progress === 1 ? '' : 's'}`, 'win');
      ctx.resultPop(stage, { multiplier: bet.multiplier, payout: bet.payout, currency: bet.currency, duration: fast ? 900 : 1600 });
    } else {
      setCaption('Splat!', `A car got the chicken on lane ${v.progress}`, 'lose');
    }
    history.push({ label: fmt.multiplier(bet.multiplier), win: won, betId: bet.id });
    ctx.settle(res);
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
      setCaption('Ready', 'Press Go — or tap the next lane — to cross');
    } finally {
      panel.setBusy(false);
      sync();
    }
  }

  async function go() {
    if (!round.live || round.busy) return;
    const k = round.game.state.progress + 1;
    sound.click();
    const pending = round.act('go');
    sync();
    try {
      const res = await pending;
      if (destroyed) return;
      const v = res.game.state;
      if (v.lost) {
        placeBird(k);
        if (ctx.animations()) await t.wait(240);
        await crash(k);
        if (destroyed) return;
        paint(v);
        return finish(res);
      }
      sound.reveal();
      paint(v, { animate: true });
      if (res.bet) {
        if (ctx.animations()) await t.wait(300);
        return finish(res);
      }
      setCaption(fmt.multiplier(v.multiplier), `Next lane pays ${fmt.multiplier(v.nextMultiplier)}`, 'win');
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
      paint(res.game.state);
      finish(res);
    } finally {
      sync();
    }
  }

  async function autoRound() {
    const v = panel.values();
    const res = await round.start(v.amount, { difficulty, autoTarget: lanesTarget() });
    if (destroyed) return null;
    if (res.restored) {
      restore(res.restored);
      return null;
    }
    ctx.debitView(res);
    sound.bet();
    const s = res.game.state;
    paint({ ...s, progress: 0, done: false, lost: false, dangers: null });
    const anim = ctx.animations();
    for (let k = 1; k <= s.progress && !destroyed; k++) {
      if (s.lost && k === s.progress) {
        placeBird(k);
        if (anim) await t.wait(160);
        await crash(k);
        break;
      }
      paint({ ...s, progress: k, done: false, lost: false, dangers: null }, { animate: true });
      sound.tick();
      if (anim) await t.wait(140);
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
    setCaption('Round in progress', `${fmt.multiplier(game.state.multiplier)} · next lane pays ${fmt.multiplier(game.state.nextMultiplier)}`);
    sync();
  }

  on(road, 'click', '.ck-lane', (e, lane) => {
    if (round.live && Number(lane.dataset.k) === round.game.state.progress + 1) go();
  });
  goBtn.addEventListener('click', go);
  panel.onChange((key, value) => {
    if (key === 'difficulty' && value !== difficulty) {
      difficulty = value;
      build();
      setCaption('Why did the chicken cross the road?', 'Press Bet, then Go one lane at a time');
    }
    if (key === 'mode' || key === 'lanes' || key === 'amount' || key === 'autoStopped') sync();
  });

  async function resume() {
    const game = await round.resume();
    if (game && !destroyed) restore(game);
  }

  build();
  sync();
  resume();
  ctx.on('user', resume);
  // Re-centre on resize (lane widths change).
  const onResize = () => view && placeBird(view.progress, false);
  window.addEventListener('resize', onResize);

  return {
    destroy() {
      destroyed = true;
      t.clear();
      window.removeEventListener('resize', onResize);
    },
  };
}
