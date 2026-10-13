import { el, on } from '../dom.js';
import { icon } from '../icons.js';
import { amountField } from '../ui/controls.js';
import { createRound, ladderStrip, timers, chanceLabel } from '../ui/stepgame.js';
import { HOLES, maxHits, multiplierFor } from '../shared/games/moles.js';

const MOLE = `<svg class="ml-mole" viewBox="0 0 80 80" aria-hidden="true">
  <path d="M10 80V44a30 30 0 0 1 60 0v36z" fill="#8d6748"/>
  <path d="M10 80V44a30 30 0 0 1 22-29C20 22 16 34 16 46v34z" fill="#a47d5a"/>
  <ellipse cx="40" cy="50" rx="17" ry="13" fill="#e2c09b"/>
  <circle cx="29" cy="34" r="4.5" fill="#1c1c28"/><circle cx="51" cy="34" r="4.5" fill="#1c1c28"/>
  <circle cx="30.5" cy="32.5" r="1.4" fill="#fff"/><circle cx="52.5" cy="32.5" r="1.4" fill="#fff"/>
  <ellipse cx="40" cy="44" rx="6" ry="4.5" fill="#ff8fab"/>
  <path d="M36 54h8v5h-8z" fill="#fff"/><path d="M40 54v5" stroke="#d0c4b4" stroke-width="1"/>
  <path class="ml-dizzy" d="M24 14l4 4M28 14l-4 4M52 14l4 4M56 14l-4 4" stroke="#ffd43b" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;

const HAMMER = `<svg class="ml-hammer" viewBox="0 0 80 80" aria-hidden="true">
  <rect x="36" y="22" width="9" height="56" rx="4" fill="#b07a46"/><rect x="36" y="22" width="3" height="56" rx="1.5" fill="#d29a5f"/>
  <rect x="12" y="4" width="58" height="24" rx="6" fill="#868e96"/><rect x="12" y="4" width="58" height="8" rx="4" fill="#ced4da"/>
  <rect x="8" y="2" width="10" height="28" rx="3" fill="#495057"/><rect x="64" y="2" width="10" height="28" rx="3" fill="#495057"/>
</svg>`;

const MOLE_OPTIONS = [1, 2, 3, 4, 5, 6].map((n) => [n, String(n)]);

export function renderPreview(result) {
  return `<div style="display:grid;gap:4px;justify-items:center">${(result.steps || [])
    .map(
      (s) =>
        `<div style="display:flex;gap:3px">${Array.from({ length: HOLES }, (_, h) => {
          const mole = s.moles.includes(h);
          const picked = s.hole === h;
          const bg = picked ? (s.hit ? 'var(--accent)' : 'var(--red)') : mole ? '#8d6748' : 'var(--surface-3)';
          return `<span style="width:22px;height:16px;border-radius:50%;background:${bg};${picked ? 'box-shadow:0 0 0 2px #fff' : ''}"></span>`;
        }).join('')}</div>`,
    )
    .join('')}<div class="muted" style="margin-top:4px">${result.moles} mole${result.moles === 1 ? '' : 's'} · ${result.hits} hit${result.hits === 1 ? '' : 's'}</div></div>`;
}

export default function mountMoles(ctx) {
  const { fmt, sound } = ctx;
  const round = createRound(ctx, 'moles');
  const t = timers();
  let destroyed = false;
  let moles = 3;
  let autoHole = null; // null → random each hit

  const autoHint = el('<div class="bp-hint ml-auto-hint"></div>');
  const panel = ctx.createBetPanel({
    fields: [
      amountField(),
      { key: 'moles', type: 'select', label: 'Moles', options: MOLE_OPTIONS, value: moles },
      { key: 'hits', type: 'number', label: 'Hits per round', value: 2, min: 1, max: 9, mode: 'auto' },
      { key: 'profit', type: 'profit', label: 'Total Profit (1.00×)' },
    ],
    onBet: () => (round.live ? cashout() : startRound()),
    auto: { run: () => autoRound() },
    hotkeys: Object.fromEntries(Array.from({ length: HOLES }, (_, i) => [String(i + 1), () => whack(i)])),
  });
  const randomBtn = el(`<button class="btn btn-secondary btn-block" hidden>${icon('refresh', 16)} Random Pick</button>`);
  panel.extra.append(randomBtn, autoHint);

  const stage = el(`<div class="ml-stage">
    <div class="stage-center"><div class="ml-field">${Array.from(
      { length: HOLES },
      (_, i) => `<button type="button" class="ml-hole" data-h="${i}" aria-label="Hole ${i + 1}"><div class="ml-pit"></div><div class="ml-pop">${MOLE}</div><div class="ml-rim"></div><div class="ml-swing">${HAMMER}</div><span class="ml-key">${i + 1}</span></button>`,
    ).join('')}</div></div>
    <div class="stage-caption ml-caption" aria-live="polite"><div class="main">Whack-a-mole</div><div class="sub">Press Bet, then whack a hole you think hides a mole</div></div>
    <div class="stage-bottom ml-bottom"></div>
  </div>`);
  ctx.stage.appendChild(stage);
  const history = ctx.historyStrip(stage, { max: 8 });
  stage.prepend(history.el);
  const field = stage.querySelector('.ml-field');
  const holes = [...stage.querySelectorAll('.ml-hole')];
  const caption = stage.querySelector('.ml-caption');
  const steps = ladderStrip(fmt, []);
  stage.querySelector('.ml-bottom').appendChild(steps.el);

  function setCaption(main, sub, cls = '') {
    caption.className = `stage-caption ml-caption ${cls}`;
    caption.querySelector('.main').textContent = main;
    caption.querySelector('.sub').innerHTML = sub;
  }

  function build() {
    steps.build(Array.from({ length: maxHits(moles) }, (_, i) => ({ m: multiplierFor(moles, i + 1), sub: chanceLabel((moles / HOLES) ** (i + 1)) })));
    steps.update(0, { smooth: false });
  }

  function clearHoles() {
    holes.forEach((h) => h.classList.remove('up', 'picked', 'hit', 'miss', 'swing', 'auto-pick'));
  }

  function renderAutoPick() {
    const auto = panel.mode === 'auto';
    field.classList.toggle('auto', auto);
    holes.forEach((h, i) => h.classList.toggle('auto-pick', auto && autoHole === i));
    autoHint.hidden = !auto;
    autoHint.textContent = autoHole == null ? 'Tap a hole to always whack it, or leave unselected for a random hole each hit.' : `Whacking hole ${autoHole + 1} every hit · tap again for random`;
  }

  // Show one whack: hammer swings, moles pop up, hit or miss.
  async function showStep(s, fast) {
    clearHoles();
    const anim = ctx.animations();
    const hole = holes[s.hole];
    hole.classList.add('picked', 'swing');
    if (anim) await t.wait(fast ? 90 : 200);
    if (destroyed) return;
    s.moles.forEach((m) => holes[m].classList.add('up'));
    hole.classList.add(s.hit ? 'hit' : 'miss');
    s.hit ? sound.reveal() : sound.bomb();
    if (!s.hit && anim) {
      field.classList.remove('shake');
      void field.offsetWidth;
      field.classList.add('shake');
    }
    if (anim) await t.wait(fast ? 220 : 480);
  }

  function sync() {
    const live = round.live;
    const v = live ? round.game.state : null;
    panel.lock(live);
    randomBtn.hidden = !live;
    randomBtn.disabled = round.busy;
    field.classList.toggle('live', live && !round.busy);
    const hitsTarget = Math.min(maxHits(moles), Math.max(1, Math.round(Number(panel.get('hits')) || 1)));
    const m = live ? v.multiplier : multiplierFor(moles, panel.mode === 'auto' ? hitsTarget : 1);
    panel.setLabel('profit', `${live ? 'Total Profit' : 'Profit on Win'} (${fmt.multiplier(m)})`);
    panel.setProfit(m);
    if (live) panel.setButton(v.hits ? `Cashout ${fmt.multiplier(v.multiplier)}` : 'Cashout', { disabled: round.busy || !v.hits });
    else if (!panel.autoRunning) panel.resetButton();
    renderAutoPick();
  }

  function finish(res, { fast = false } = {}) {
    const bet = res.bet;
    const v = res.game.state;
    const won = bet.payout > 0;
    steps.update(v.hits, { lost: v.lost });
    if (won) {
      sound.cashout();
      setCaption(`Cashed out at ${fmt.multiplier(bet.multiplier)}`, `${v.hits} mole${v.hits === 1 ? '' : 's'} whacked`, 'win');
      ctx.resultPop(field, { multiplier: bet.multiplier, payout: bet.payout, currency: bet.currency, duration: fast ? 900 : 1600 });
    } else setCaption('Missed!', `Hole ${v.steps[v.steps.length - 1].hole + 1} was empty`, 'lose');
    history.push({ label: fmt.multiplier(bet.multiplier), win: won, betId: bet.id });
    ctx.settle(res);
  }

  async function startRound() {
    if (round.busy || !ctx.requireAuth()) return;
    const v = panel.values();
    if (!panel.checkBalance(v.amount)) return;
    panel.setBusy(true);
    try {
      const res = await round.start(v.amount, { moles });
      if (destroyed) return;
      if (res.restored) return restore(res.restored);
      sound.bet();
      ctx.setBalance(res.balance);
      clearHoles();
      steps.update(0, { live: true });
      setCaption('Pick a hole', `${moles} mole${moles === 1 ? '' : 's'} will pop up — first hit pays ${fmt.multiplier(res.game.state.nextMultiplier)}`);
    } finally {
      panel.setBusy(false);
      sync();
    }
  }

  async function whack(h) {
    if (!round.live || round.busy || panel.mode !== 'manual') return;
    sound.click();
    const pending = round.act('whack', { hole: h });
    sync();
    try {
      const res = await pending;
      if (destroyed) return;
      const v = res.game.state;
      await showStep(v.steps[v.steps.length - 1], false);
      if (destroyed) return;
      if (res.bet) return finish(res);
      steps.update(v.hits, { live: true });
      setCaption(fmt.multiplier(v.multiplier), `Next hit pays ${fmt.multiplier(v.nextMultiplier)}`, 'win');
    } finally {
      sync();
    }
  }

  async function cashout() {
    if (!round.live || round.busy || !round.game.state.hits) return;
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
    const n = Math.min(maxHits(moles), Math.max(1, Math.round(Number(panel.get('hits')) || 1)));
    const picks = Array.from({ length: n }, () => (autoHole == null ? Math.floor(Math.random() * HOLES) : autoHole));
    const v = panel.values();
    const res = await round.start(v.amount, { moles, autoHoles: picks });
    if (destroyed) return null;
    if (res.restored) {
      restore(res.restored);
      return null;
    }
    ctx.debitView(res);
    sound.bet();
    const s = res.game.state;
    let hits = 0;
    for (const step of s.steps) {
      await showStep(step, true);
      if (destroyed) return null;
      if (step.hit) steps.update(++hits, { live: true, smooth: false });
    }
    finish(res, { fast: true });
    if (ctx.animations()) await t.wait(s.lost ? 380 : 600);
    clearHoles();
    renderAutoPick();
    return { win: res.bet.payout > res.bet.amount, profit: res.bet.payout - res.bet.amount };
  }

  function restore(game) {
    if (game.params?.moles && game.params.moles !== moles) {
      moles = game.params.moles;
      panel.set('moles', moles);
      build();
    }
    if (game.currency === ctx.currency()) panel.set('amount', game.amount);
    const v = game.state;
    steps.update(v.hits, { live: true });
    setCaption('Round in progress', `${v.hits} hit${v.hits === 1 ? '' : 's'} · ${fmt.multiplier(v.multiplier)}`);
    sync();
  }

  on(field, 'click', '.ml-hole', (e, h) => {
    const i = Number(h.dataset.h);
    if (panel.mode === 'auto') {
      if (panel.autoRunning) return;
      autoHole = autoHole === i ? null : i;
      sound.click();
      renderAutoPick();
      return;
    }
    whack(i);
  });
  randomBtn.addEventListener('click', () => whack(Math.floor(Math.random() * HOLES)));
  panel.onChange((key, value) => {
    if (key === 'moles' && value !== moles) {
      moles = Number(value);
      build();
      clearHoles();
    }
    if (key === 'mode') clearHoles();
    if (['mode', 'moles', 'hits', 'amount', 'autoStopped'].includes(key)) sync();
  });

  async function resume() {
    const game = await round.resume();
    if (game && !destroyed) restore(game);
  }

  build();
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
