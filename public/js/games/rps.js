import { el, on } from '../dom.js';
import { icon } from '../icons.js';
import { amountField } from '../ui/controls.js';
import { createRound, ladderStrip, timers, chanceLabel } from '../ui/stepgame.js';
import { HANDS, MAX_WINS, multiplierFor } from '../shared/games/rps.js';

const NAME = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };

export const HAND_SVG = {
  rock: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 44l6-19 15-12 18 3 11 15-3 17-15 8H20z" fill="#7d8996"/>
    <path d="M14 25l15-12 18 3-9 13z" fill="#b8c2cc"/><path d="M38 29l9-13 11 15z" fill="#9aa6b2"/>
    <path d="M8 44l6-19 24 4-6 18z" fill="#8c98a5"/><path d="M32 47l6-18 20 2-3 17z" fill="#6c7884"/><path d="M20 56l12-9 23 1-15 8z" fill="#5b6672"/></svg>`,
  paper: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16 6h24l10 10v42H16z" fill="#f1f3f5"/><path d="M40 6v10h10z" fill="#ced4da"/>
    <path d="M22 26h20M22 33h22M22 40h18M22 47h14" stroke="#adb5bd" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  scissors: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M30 34L52 8M34 34L12 8" stroke="#ced4da" stroke-width="6" stroke-linecap="round"/>
    <path d="M30 34L52 8" stroke="#f8f9fa" stroke-width="2" stroke-linecap="round"/><circle cx="32" cy="34" r="3" fill="#495057"/>
    <circle cx="20" cy="48" r="9" fill="none" stroke="#ff6b6b" stroke-width="6"/><circle cx="44" cy="48" r="9" fill="none" stroke="#ff6b6b" stroke-width="6"/></svg>`,
};

const AUTO_CYCLE = [null, 'rock', 'paper', 'scissors', 'random'];
const randomHand = () => HANDS[Math.floor(Math.random() * 3)];

export function renderPreview(result) {
  const color = { win: 'var(--accent)', loss: 'var(--red)', draw: 'var(--surface-4)' };
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;max-width:420px">${(result.throws || [])
    .map((t) => `<span style="display:inline-flex;gap:2px;align-items:center;padding:4px;border-radius:8px;background:${color[t.result]}"><span style="width:24px;display:inline-block">${HAND_SVG[t.hand]}</span><span style="font-size:10px;font-weight:800">vs</span><span style="width:24px;display:inline-block">${HAND_SVG[t.house]}</span></span>`)
    .join('')}</div>`;
}

export default function mountRps(ctx) {
  const { fmt, sound } = ctx;
  const round = createRound(ctx, 'rps');
  const t = timers();
  let destroyed = false;
  const autoHands = Array(MAX_WINS).fill(null);
  autoHands[0] = 'rock';

  const pickEl = el(`<div class="rp-pick">
    <div class="rp-hands">${HANDS.map((h) => `<button type="button" class="rp-hand-btn" data-hand="${h}" aria-label="${NAME[h]}">${HAND_SVG[h]}<span>${NAME[h]}</span></button>`).join('')}</div>
    <button type="button" class="btn btn-secondary btn-block" data-hand="random">${icon('refresh', 16)}<span>Random Pick</span></button>
  </div>`);
  const autoEl = el(`<div class="rp-auto-grid">${autoHands.map((_, i) => `<button type="button" class="rp-auto-tile" data-i="${i}"></button>`).join('')}</div>`);

  const panel = ctx.createBetPanel({
    fields: [
      amountField(),
      { key: 'profit', type: 'profit', label: 'Total Profit (1.00×)' },
      { key: 'pick', type: 'custom', label: 'Throw', mode: 'manual', render: (box) => box.appendChild(pickEl), keepEnabled: true },
      { key: 'hands', type: 'custom', label: 'Throws per round', mode: 'auto', render: (box) => box.appendChild(autoEl), keepEnabled: true },
    ],
    onBet: () => (round.live ? cashout() : startRound()),
    auto: { run: () => autoRound(), canRun: () => autoList().length > 0 },
    hotkeys: { r: () => play('rock'), p: () => play('paper'), q: () => play('scissors') },
  });

  const stage = el(`<div class="rp-stage">
    <div class="stage-center"><div class="rp-arena">
      <div class="rp-side you"><div class="rp-who">You</div><div class="rp-big" data-side="you">${HAND_SVG.rock}</div></div>
      <div class="rp-vs">VS</div>
      <div class="rp-side house"><div class="rp-who">House</div><div class="rp-big" data-side="house">${HAND_SVG.rock}</div></div>
    </div></div>
    <div class="stage-caption rp-caption" aria-live="polite"><div class="main">Rock, paper, scissors</div><div class="sub">Win to double up — a draw replays, a loss ends the round</div></div>
    <div class="rp-throws" aria-label="Throws this round"></div>
    <div class="stage-bottom rp-bottom"></div>
  </div>`);
  ctx.stage.appendChild(stage);
  const history = ctx.historyStrip(stage, { max: 8 });
  stage.prepend(history.el);
  const arena = stage.querySelector('.rp-arena');
  const youEl = stage.querySelector('[data-side=you]');
  const houseEl = stage.querySelector('[data-side=house]');
  const caption = stage.querySelector('.rp-caption');
  const throwsEl = stage.querySelector('.rp-throws');
  const steps = ladderStrip(
    fmt,
    Array.from({ length: MAX_WINS }, (_, i) => ({ m: multiplierFor(i + 1), sub: chanceLabel((1 / 2) ** (i + 1)) })),
  );
  stage.querySelector('.rp-bottom').appendChild(steps.el);

  function setCaption(main, sub, cls = '') {
    caption.className = `stage-caption rp-caption ${cls}`;
    caption.querySelector('.main').textContent = main;
    caption.querySelector('.sub').innerHTML = sub;
  }

  function showThrow(th) {
    youEl.innerHTML = HAND_SVG[th.hand];
    houseEl.innerHTML = HAND_SVG[th.house];
    arena.dataset.result = th.result;
  }

  function renderThrows(list) {
    throwsEl.innerHTML = list.map((th) => `<span class="rp-chip ${th.result}" data-tip="${NAME[th.hand]} vs ${NAME[th.house]} · ${th.result}">${HAND_SVG[th.hand]}</span>`).join('');
  }

  async function shake(fast) {
    if (!ctx.animations()) return;
    arena.dataset.result = '';
    youEl.innerHTML = HAND_SVG.rock;
    houseEl.innerHTML = HAND_SVG.rock;
    arena.classList.remove('shaking');
    void arena.offsetWidth;
    arena.classList.add('shaking');
    await t.wait(fast ? 260 : 620);
    arena.classList.remove('shaking');
  }

  const autoList = () => autoHands.filter(Boolean);

  function renderAutoGrid() {
    autoEl.querySelectorAll('.rp-auto-tile').forEach((b, i) => {
      const v = autoHands[i];
      b.className = `rp-auto-tile ${v ? 'set' : ''}`;
      b.innerHTML = v === 'random' ? icon('refresh', 16) : v ? HAND_SVG[v] : `<span class="n">${i + 1}</span>`;
      b.dataset.tip = v ? `Win ${i + 1}: ${v === 'random' ? 'Random' : NAME[v]}` : `Win ${i + 1}: off`;
    });
    panel.setLabel('hands', `Wins per round · ${autoList().length} → ${fmt.multiplier(multiplierFor(autoList().length))}`);
    sync();
  }

  function sync() {
    const live = round.live;
    const v = live ? round.game.state : null;
    pickEl.querySelectorAll('button').forEach((b) => (b.disabled = !live || round.busy));
    panel.lock(live);
    const m = live ? v.multiplier : multiplierFor(panel.mode === 'auto' ? autoList().length : 1);
    panel.setLabel('profit', `${live ? 'Total Profit' : 'Profit on Win'} (${fmt.multiplier(m)})`);
    panel.setProfit(m);
    if (live) panel.setButton(v.wins ? `Cashout ${fmt.multiplier(v.multiplier)}` : 'Cashout', { disabled: round.busy || !v.wins });
    else if (!panel.autoRunning) panel.resetButton();
    if (live) steps.update(v.wins, { live: true });
  }

  function finish(res, { fast = false } = {}) {
    const bet = res.bet;
    const v = res.game.state;
    const won = bet.payout > 0;
    steps.update(v.wins, { lost: v.lost });
    if (won) {
      sound.cashout();
      setCaption(`Cashed out at ${fmt.multiplier(bet.multiplier)}`, `${v.wins} win${v.wins === 1 ? '' : 's'} in a row`, 'win');
      ctx.resultPop(arena, { multiplier: bet.multiplier, payout: bet.payout, currency: bet.currency, duration: fast ? 900 : 1600 });
    } else {
      sound.lose();
      const last = v.throws[v.throws.length - 1];
      setCaption(`${NAME[last.house]} beats ${NAME[last.hand]}`, `Round over after ${v.wins} win${v.wins === 1 ? '' : 's'}`, 'lose');
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
      const res = await round.start(v.amount, {});
      if (destroyed) return;
      if (res.restored) return restore(res.restored);
      sound.bet();
      ctx.setBalance(res.balance);
      renderThrows([]);
      arena.dataset.result = '';
      steps.update(0, { live: true });
      setCaption('Your throw', 'Pick rock, paper or scissors');
    } finally {
      panel.setBusy(false);
      sync();
    }
  }

  async function play(choice) {
    if (!round.live || round.busy) return;
    const hand = choice === 'random' ? randomHand() : choice;
    sound.click();
    const pending = round.act('play', { hand });
    sync();
    try {
      const [res] = await Promise.all([pending, shake(false)]);
      if (destroyed) return;
      const v = res.game.state;
      const last = v.throws[v.throws.length - 1];
      showThrow(last);
      renderThrows(v.throws);
      if (res.bet) return finish(res);
      if (last.result === 'draw') {
        sound.tick();
        setCaption('Draw', `${NAME[last.hand]} vs ${NAME[last.house]} — throw again`);
      } else {
        sound.win();
        setCaption(`${NAME[last.hand]} beats ${NAME[last.house]}`, `${fmt.multiplier(v.multiplier)} — next win pays ${fmt.multiplier(v.nextMultiplier)}`, 'win');
      }
    } finally {
      sync();
    }
  }

  async function cashout() {
    if (!round.live || round.busy || !round.game.state.wins) return;
    const pending = round.act('cashout');
    sync();
    try {
      const res = await pending;
      if (!destroyed) finish(res);
    } finally {
      sync();
    }
  }

  async function autoRound() {
    const hands = autoList().map((h) => (h === 'random' ? randomHand() : h));
    const v = panel.values();
    const res = await round.start(v.amount, { autoHands: hands });
    if (destroyed) return null;
    if (res.restored) {
      restore(res.restored);
      return null;
    }
    ctx.debitView(res);
    sound.bet();
    const list = res.game.state.throws;
    renderThrows([]);
    let wins = 0;
    for (let i = 0; i < list.length && !destroyed; i++) {
      await shake(true);
      showThrow(list[i]);
      renderThrows(list.slice(0, i + 1));
      if (list[i].result === 'win') steps.update(++wins, { live: true, smooth: false });
    }
    if (destroyed) return null;
    finish(res, { fast: true });
    if (ctx.animations()) await t.wait(res.bet.payout ? 650 : 420);
    return { win: res.bet.payout > res.bet.amount, profit: res.bet.payout - res.bet.amount };
  }

  function restore(game) {
    if (game.currency === ctx.currency()) panel.set('amount', game.amount);
    const v = game.state;
    renderThrows(v.throws);
    const last = v.throws[v.throws.length - 1];
    if (last) showThrow(last);
    setCaption('Round in progress', `${v.wins} win${v.wins === 1 ? '' : 's'} · ${fmt.multiplier(v.multiplier)}`);
    sync();
  }

  on(pickEl, 'click', 'button[data-hand]', (e, b) => !b.disabled && play(b.dataset.hand));
  on(autoEl, 'click', '.rp-auto-tile', (e, b) => {
    if (panel.autoRunning) return;
    const i = Number(b.dataset.i);
    autoHands[i] = AUTO_CYCLE[(AUTO_CYCLE.indexOf(autoHands[i]) + 1) % AUTO_CYCLE.length];
    renderAutoGrid();
  });
  panel.onChange((key) => {
    if (key === 'mode') renderAutoGrid();
    if (key === 'amount' || key === 'autoStopped') sync();
  });

  async function resume() {
    const game = await round.resume();
    if (game && !destroyed) restore(game);
  }

  renderAutoGrid();
  steps.update(0, { smooth: false });
  resume();
  ctx.on('user', resume);

  return {
    destroy() {
      destroyed = true;
      t.clear();
    },
  };
}
