import { el, on } from '../dom.js';
import { icon } from '../icons.js';
import { amountField } from '../ui/controls.js';
import { createRound, ladderStrip, timers } from '../ui/stepgame.js';
import { TILES, LEVELS, DIFFICULTIES, multiplierFor } from '../shared/games/lava.js';

const DIFF_OPTIONS = Object.keys(DIFFICULTIES).map((d) => [d, d[0].toUpperCase() + d.slice(1)]);
const SIDE = 7;
const PLAYER = `<svg class="lv-player" viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="20" cy="36" rx="11" ry="3" fill="#000" opacity=".3"/>
  <circle cx="20" cy="19" r="14" fill="#4dabf7"/><circle cx="20" cy="19" r="14" fill="none" stroke="#fff" stroke-width="2.5"/>
  <circle cx="15" cy="17" r="2.4" fill="#fff"/><circle cx="25" cy="17" r="2.4" fill="#fff"/><circle cx="15.6" cy="17.4" r="1.1" fill="#111"/><circle cx="25.6" cy="17.4" r="1.1" fill="#111"/>
  <path d="M15 24q5 4 10 0" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;

const totalSteps = (d) => LEVELS * DIFFICULTIES[d].rounds;
const stepIndex = (d, level, round) => (level - 1) * DIFFICULTIES[d].rounds + round;

export function renderPreview(result) {
  const last = result.jumps?.[result.jumps.length - 1];
  const lava = new Set(last ? (result.lost ? [...last.dropped] : Array.from({ length: TILES }, (_, i) => i).filter((i) => !result.standing.includes(i))) : []);
  const cells = Array.from({ length: TILES }, (_, i) => {
    const me = last && last.tile === i;
    const bg = me ? (result.lost ? 'var(--red)' : 'var(--accent)') : lava.has(i) ? '#ff7a1a' : 'var(--surface-3)';
    return `<span style="aspect-ratio:1;border-radius:4px;background:${bg}"></span>`;
  }).join('');
  return `<div style="display:grid;justify-items:center;gap:6px"><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;width:180px">${cells}</div>
    <div class="muted">${result.difficulty} · level ${result.level} · ${result.jumps?.length || 0} jump${result.jumps?.length === 1 ? '' : 's'}${result.lost ? ' · fell in' : ''}</div></div>`;
}

export default function mountLava(ctx) {
  const { fmt, sound } = ctx;
  const round = createRound(ctx, 'lava');
  const t = timers();
  let destroyed = false;
  let difficulty = 'easy';

  const panel = ctx.createBetPanel({
    fields: [
      amountField(),
      { key: 'difficulty', type: 'select', label: 'Difficulty', options: DIFF_OPTIONS, value: difficulty },
      { key: 'jumps', type: 'number', label: 'Jumps per round', value: 2, min: 1, max: 18, mode: 'auto' },
      { key: 'profit', type: 'profit', label: 'Total Profit (1.00×)' },
    ],
    onBet: () => (round.live ? cashout() : startRound()),
    auto: { run: () => autoRound() },
  });
  const randomBtn = el(`<button class="btn btn-secondary btn-block" hidden>${icon('refresh', 16)} Random Pick</button>`);
  panel.extra.append(randomBtn);

  const stage = el(`<div class="lv-stage">
    <div class="lv-top"><div class="lv-level"></div></div>
    <div class="stage-center"><div class="lv-floor">${Array.from({ length: TILES }, (_, i) => `<button type="button" class="lv-tile" data-t="${i}" aria-label="Tile ${i + 1}"></button>`).join('')}<div class="lv-me">${PLAYER}</div></div></div>
    <div class="stage-caption lv-caption" aria-live="polite"><div class="main">The floor is lava!</div><div class="sub">Press Bet, pick a tile and jump — then the floor starts to sink</div></div>
    <div class="stage-bottom lv-bottom"></div>
  </div>`);
  ctx.stage.appendChild(stage);
  const history = ctx.historyStrip(stage, { max: 8 });
  stage.prepend(history.el);
  const floor = stage.querySelector('.lv-floor');
  const tiles = [...stage.querySelectorAll('.lv-tile')];
  const me = stage.querySelector('.lv-me');
  const levelEl = stage.querySelector('.lv-level');
  const caption = stage.querySelector('.lv-caption');
  const steps = ladderStrip(fmt, []);
  stage.querySelector('.lv-bottom').appendChild(steps.el);

  function setCaption(main, sub, cls = '') {
    caption.className = `stage-caption lv-caption ${cls}`;
    caption.querySelector('.main').textContent = main;
    caption.querySelector('.sub').innerHTML = sub;
  }

  function setLevel(level, roundNo) {
    const { rounds, drop } = DIFFICULTIES[difficulty];
    levelEl.innerHTML = Array.from({ length: LEVELS }, (_, i) => `<span class="lv-pip ${i + 1 < level ? 'done' : i + 1 === level ? 'cur' : ''}">Level ${i + 1}</span>`).join('') + `<span class="lv-round">Round ${Math.min(roundNo + 1, rounds)}/${rounds} · ${drop} tile${drop === 1 ? '' : 's'} sink per round</span>`;
  }

  function build() {
    const { rounds } = DIFFICULTIES[difficulty];
    steps.build(Array.from({ length: totalSteps(difficulty) }, (_, i) => ({ m: multiplierFor(difficulty, Math.floor(i / rounds) + 1, (i % rounds) + 1), sub: `L${Math.floor(i / rounds) + 1} · R${(i % rounds) + 1}` })));
    steps.update(0, { smooth: false });
    panel.setLabel('jumps', `Jumps per round (max ${totalSteps(difficulty)})`);
  }

  function placeMe(tile) {
    if (tile == null) {
      me.hidden = true;
      return;
    }
    me.hidden = false;
    me.style.setProperty('--x', tile % SIDE);
    me.style.setProperty('--y', Math.floor(tile / SIDE));
  }

  function resetFloor() {
    tiles.forEach((tl) => (tl.className = 'lv-tile'));
    floor.classList.remove('lost', 'won', 'falling');
    me.classList.remove('sink');
  }

  // Paint a settled state: lava = tiles not standing in the current level.
  function paint(v) {
    resetFloor();
    const standing = new Set(v.standing);
    const last = v.jumps[v.jumps.length - 1];
    if (v.round > 0 || v.lost) tiles.forEach((tl, i) => !standing.has(i) && tl.classList.add('lava'));
    if (v.lost && last) last.dropped.forEach((i) => tiles[i].classList.add('lava'));
    placeMe(last ? last.tile : null);
    if (last) tiles[last.tile].classList.add('mine');
    if (v.lost) {
      me.classList.add('sink');
      floor.classList.add('lost');
    }
    setLevel(v.level, v.round);
    const done = v.lost ? v.jumps.length - 1 : v.jumps.length;
    steps.update(done, { live: !v.done, lost: v.lost });
  }

  // Animate one jump: hop, then the round's tiles sink.
  async function showJump(j, fast) {
    const anim = ctx.animations();
    tiles.forEach((tl) => tl.classList.remove('mine'));
    placeMe(j.tile);
    tiles[j.tile].classList.add('mine');
    sound.click();
    if (anim) await t.wait(fast ? 140 : 260);
    if (destroyed) return;
    const order = [...j.dropped].sort(() => Math.random() - 0.5);
    const per = anim ? Math.min(fast ? 12 : 40, (fast ? 260 : 700) / order.length) : 0;
    for (const i of order) {
      tiles[i].classList.add('lava', 'sinking');
      if (per) await t.wait(per);
      if (destroyed) return;
    }
    if (j.dropped.includes(j.tile)) {
      me.classList.add('sink');
      floor.classList.add('lost');
      sound.bomb();
    } else sound.reveal();
    if (anim) await t.wait(fast ? 120 : 260);
  }

  function sync() {
    const live = round.live;
    const v = live ? round.game.state : null;
    panel.lock(live);
    randomBtn.hidden = !live;
    randomBtn.disabled = round.busy;
    floor.classList.toggle('live', live && !round.busy);
    const { rounds } = DIFFICULTIES[difficulty];
    const n = Math.min(totalSteps(difficulty), Math.max(1, Math.round(Number(panel.get('jumps')) || 1)));
    const m = live ? v.multiplier : panel.mode === 'auto' ? multiplierFor(difficulty, Math.ceil(n / rounds), ((n - 1) % rounds) + 1) : multiplierFor(difficulty, 1, 1);
    panel.setLabel('profit', `${live ? 'Total Profit' : 'Profit on Win'} (${fmt.multiplier(m)})`);
    panel.setProfit(m);
    if (live) panel.setButton(v.jumps.length ? `Cashout ${fmt.multiplier(v.multiplier)}` : 'Cashout', { disabled: round.busy || !v.jumps.length });
    else if (!panel.autoRunning) panel.resetButton();
  }

  function finish(res, { fast = false } = {}) {
    const bet = res.bet;
    const v = res.game.state;
    const won = bet.payout > 0;
    paint(v);
    if (won) {
      sound.cashout();
      floor.classList.add('won');
      setCaption(`Cashed out at ${fmt.multiplier(bet.multiplier)}`, `${v.jumps.length} safe jump${v.jumps.length === 1 ? '' : 's'}`, 'win');
      ctx.resultPop(floor, { multiplier: bet.multiplier, payout: bet.payout, currency: bet.currency, duration: fast ? 900 : 1600 });
    } else setCaption('Into the lava!', `Tile ${v.jumps[v.jumps.length - 1].tile + 1} sank on level ${v.level}`, 'lose');
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
      setCaption('Pick a tile', `Jump onto any tile — first round pays ${fmt.multiplier(res.game.state.nextMultiplier)}`);
    } finally {
      panel.setBusy(false);
      sync();
    }
  }

  async function jump(tile) {
    if (!round.live || round.busy) return;
    if (!round.game.state.standing.includes(tile)) return;
    const pending = round.act('jump', { tile });
    sync();
    try {
      const res = await pending;
      if (destroyed) return;
      const v = res.game.state;
      const j = v.jumps[v.jumps.length - 1];
      await showJump(j, false);
      if (destroyed) return;
      if (res.bet) return finish(res);
      if (v.round === 0) {
        // Level cleared: show the sunk floor briefly, then reset.
        setCaption(`Level ${v.level - 1} cleared!`, `${fmt.multiplier(v.multiplier)} — the floor resets for level ${v.level}`, 'win');
        sound.win();
        if (ctx.animations()) await t.wait(700);
        if (destroyed) return;
      } else setCaption(fmt.multiplier(v.multiplier), `Next round pays ${fmt.multiplier(v.nextMultiplier)}`, 'win');
      paint(v);
    } finally {
      sync();
    }
  }

  async function cashout() {
    if (!round.live || round.busy || !round.game.state.jumps.length) return;
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
    const n = Math.min(totalSteps(difficulty), Math.max(1, Math.round(Number(panel.get('jumps')) || 1)));
    const v = panel.values();
    const res = await round.start(v.amount, { difficulty, autoJumps: n });
    if (destroyed) return null;
    if (res.restored) {
      restore(res.restored);
      return null;
    }
    ctx.debitView(res);
    sound.bet();
    const s = res.game.state;
    resetFloor();
    let level = 1;
    for (let i = 0; i < s.jumps.length && !destroyed; i++) {
      const j = s.jumps[i];
      if (j.level !== level) {
        level = j.level;
        resetFloor();
      }
      setLevel(j.level, j.round - 1);
      await showJump(j, true);
      if (!j.dropped.includes(j.tile)) steps.update(i + 1, { live: true, smooth: false });
    }
    if (destroyed) return null;
    finish(res, { fast: true });
    if (ctx.animations()) await t.wait(s.lost ? 420 : 640);
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
    setCaption('Round in progress', `${fmt.multiplier(game.state.multiplier)} · next round pays ${fmt.multiplier(game.state.nextMultiplier)}`);
    sync();
  }

  on(floor, 'click', '.lv-tile', (e, tl) => jump(Number(tl.dataset.t)));
  randomBtn.addEventListener('click', () => {
    if (!round.live) return;
    const s = round.game.state.standing;
    jump(s[Math.floor(Math.random() * s.length)]);
  });
  panel.onChange((key, value) => {
    if (key === 'difficulty' && value !== difficulty) {
      difficulty = value;
      build();
      resetFloor();
      placeMe(null);
      setLevel(1, 0);
    }
    if (['mode', 'difficulty', 'jumps', 'amount', 'autoStopped'].includes(key)) sync();
  });

  async function resume() {
    const game = await round.resume();
    if (game && !destroyed) restore(game);
  }

  build();
  placeMe(null);
  setLevel(1, 0);
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
