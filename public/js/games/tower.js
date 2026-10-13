import { el, on } from '../dom.js';
import { amountField } from '../ui/controls.js';
import { coin } from '../icons.js';
import { roundDown } from '../shared/currencies.js';
import { DIFFICULTIES, ROWS, multiplierFor } from '../shared/games/tower.js';

const EGG = `<svg class="tw-icon tw-egg" viewBox="0 0 40 48" aria-hidden="true">
  <path d="M20 2C11 2 4 17 4 28.5 4 39 11 46 20 46s16-7 16-17.5C36 17 29 2 20 2z" fill="#12924b"/>
  <path d="M20 2C11 2 4 17 4 28.5 4 37 9 43.5 16.5 45.6 11 41 9 34 9 27 9 15 14 5 20 2z" fill="#39e08a"/>
  <path d="M20 2c4.5 2.5 9 12 9.6 22.5C30 32 26 40 19 45.9c.3 0 .7.1 1 .1 9 0 16-7 16-17.5C36 17 29 2 20 2z" fill="#1cb862"/>
  <circle cx="25" cy="19" r="3.2" fill="#ffd166"/><circle cx="14" cy="31" r="2.6" fill="#ffd166"/><circle cx="25.5" cy="35" r="2.1" fill="#ffd166"/><circle cx="18" cy="13" r="1.5" fill="#ffd166"/>
  <ellipse cx="12.5" cy="17" rx="2.6" ry="6" transform="rotate(22 12.5 17)" fill="#fff" opacity=".55"/>
</svg>`;

const SKULL = `<svg class="tw-icon tw-skull" viewBox="0 0 48 48" aria-hidden="true">
  <g class="tw-fire"><path d="M24 1c3 9 13 13 13 25a13 13 0 0 1-26 0c0-6 3.6-9.6 6.4-12 0 5 2.4 7.4 5 7.4 0-7.4-2.6-13 1.6-20.4z" fill="#ff6a2b"/>
  <path d="M24 17c1.4 5 6.6 7.6 6.6 13.6a6.6 6.6 0 0 1-13.2 0c0-3.6 2.4-6 3.8-7.2 0 2.6 1.3 3.8 2.6 3.8 0-3.8-1.3-6.4.2-10.2z" fill="#ffd34d"/></g>
  <path d="M24 12c-8 0-13.5 5.8-13.5 13 0 4.5 2.2 7.8 5.4 9.6V39a1.8 1.8 0 0 0 1.8 1.8h12.6a1.8 1.8 0 0 0 1.8-1.8v-4.4c3.2-1.8 5.4-5.1 5.4-9.6C37.5 17.8 32 12 24 12z" fill="#f3ecdc"/>
  <path d="M24 12c-8 0-13.5 5.8-13.5 13 0 4.5 2.2 7.8 5.4 9.6V39a1.8 1.8 0 0 0 1.8 1.8h2.4C17 36 15 31 15 25c0-6.6 3.6-11.4 9-13z" fill="#d9ceb6"/>
  <ellipse cx="18.6" cy="25.5" rx="3.8" ry="4.2" fill="#2a0d10"/><ellipse cx="29.4" cy="25.5" rx="3.8" ry="4.2" fill="#2a0d10"/>
  <circle cx="18.6" cy="26" r="1.3" fill="#ff4d5e"/><circle cx="29.4" cy="26" r="1.3" fill="#ff4d5e"/>
  <path d="M24 29.5l-2.2 4h4.4z" fill="#2a0d10"/>
  <path d="M20 36.5v4M24 36.5v4M28 36.5v4" stroke="#a8987a" stroke-width="1.4"/>
</svg>`;

// Original dragon perched on the battlements.
const DRAGON = `<svg class="tw-dragon" viewBox="0 0 400 112" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  <defs><radialGradient id="twGlow" cx="50%" cy="62%" r="50%"><stop offset="0" stop-color="#ff7a2f" stop-opacity=".5"/><stop offset="1" stop-color="#ff7a2f" stop-opacity="0"/></radialGradient></defs>
  <ellipse cx="200" cy="64" rx="160" ry="54" fill="url(#twGlow)" class="tw-glow"/>
  <g class="tw-wing tw-wing-l">
    <path d="M186 66L130 24 34 14c11 9 17 21 21 34 13-3 26 0 37 12 12-6 26-4 37 8 18-6 37 0 57 10z" fill="#5a1828"/>
    <path d="M130 24L55 48M130 24l-38 36M130 24l-1 44" stroke="#9e3047" stroke-width="2.2" stroke-linecap="round" fill="none"/>
    <path d="M186 66L130 24 34 14" stroke="#c0405a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M126 26l5-13 5 12z" fill="#e8c27a"/>
  </g>
  <g transform="translate(400 0) scale(-1 1)"><g class="tw-wing tw-wing-r">
    <path d="M186 66L130 24 34 14c11 9 17 21 21 34 13-3 26 0 37 12 12-6 26-4 37 8 18-6 37 0 57 10z" fill="#5a1828"/>
    <path d="M130 24L55 48M130 24l-38 36M130 24l-1 44" stroke="#9e3047" stroke-width="2.2" stroke-linecap="round" fill="none"/>
    <path d="M186 66L130 24 34 14" stroke="#c0405a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M126 26l5-13 5 12z" fill="#e8c27a"/>
  </g></g>
  <g transform="translate(0 -5)">
  <path d="M185 42c-6-14-15-25-31-34 10 14 15 26 18 41zM215 42c6-14 15-25 31-34-10 14-15 26-18 41z" fill="#e8c27a"/>
  <path d="M185 42c-6-14-15-25-31-34 6 9 10 18 13 27zM215 42c6-14 15-25 31-34-6 9-10 18-13 27z" fill="#c9a35e"/>
  <path d="M200 32c-12 0-22 6-25 16l-6 11 8 3 2 12c4 12 12 20 21 20s17-8 21-20l2-12 8-3-6-11c-3-10-13-16-25-16z" fill="#7d1f33"/>
  <path d="M200 32c-12 0-22 6-25 16l-6 11 8 3 2 12c4 12 12 20 21 20z" fill="#9a2a41"/>
  <path d="M189 69c3-6 19-6 22 0l-2 14c-3 6-15 6-18 0z" fill="#b8384f"/>
  <path d="M191 85l2.4 7 2.4-6.4zM209 85l-2.4 7-2.4-6.4z" fill="#fff3dd"/>
  <path d="M178 47l15 6M222 47l-15 6" stroke="#3d0b17" stroke-width="4.2" stroke-linecap="round"/>
  <path class="tw-eye" d="M181 54c4-1 10 0 13 3-4 3-10 3-13-3z" fill="#ffcc33"/>
  <path class="tw-eye" d="M219 54c-4-1-10 0-13 3 4 3 10 3 13-3z" fill="#ffcc33"/>
  <ellipse cx="188.5" cy="56.4" rx="1.2" ry="2.6" fill="#2a0a00"/><ellipse cx="211.5" cy="56.4" rx="1.2" ry="2.6" fill="#2a0a00"/>
  <path d="M195 76c1 1.5 2.5 1.5 3 0M202 76c.5 1.5 2 1.5 3 0" stroke="#3a0a14" stroke-width="1.8" stroke-linecap="round" fill="none"/>
  </g>
  <g class="tw-breath"><path d="M200 92c-10 6-16 10-18 18h36c-2-8-8-12-18-18z" fill="#ff7a2f"/><path d="M200 98c-5 4-8 6-9 12h18c-1-6-4-8-9-12z" fill="#ffd34d"/></g>
  <path class="tw-wall" d="M0 92h40v-14h24v14h40v-14h24v14h40v-6h64v6h40v-14h24v14h40v-14h24v14h40v20H0z"/>
  <path class="tw-wall-top" d="M0 92h40v3H0zM64 92h40v3H64zM128 92h40v3H128zM232 92h40v3H232zM296 92h40v3H296zM360 92h40v3H360zM40 78h24v3H40zM104 78h24v3H104zM272 78h24v3H272zM336 78h24v3H336zM168 86h64v3H168z"/>
</svg>`;

const DIFF_OPTIONS = [
  ['easy', 'Easy'],
  ['medium', 'Medium'],
  ['hard', 'Hard'],
  ['expert', 'Expert'],
  ['master', 'Master'],
];

const floor2 = (m) => Math.floor(m * 100 + 1e-9) / 100;
// Tile labels: keep huge Master multipliers short enough for narrow tiles.
const tileLabel = (m) => (m >= 1000 ? `${Math.floor(m).toLocaleString('en-US')}×` : `${floor2(m).toFixed(2)}×`);

export default function mountTower(ctx) {
  const { api, fmt, sound } = ctx;
  let game = null;
  let busy = false;
  let destroyed = false;
  let showingResult = false;
  let animating = false; // auto round playing out
  let difficulty = 'easy';
  let autoPath = [];
  const timers = new Set();
  const wait = (ms) =>
    new Promise((resolve) => {
      const t = setTimeout(() => {
        timers.delete(t);
        resolve();
      }, ms);
      timers.add(t);
    });

  const panel = ctx.createBetPanel({
    fields: [
      amountField(),
      { key: 'difficulty', type: 'select', label: 'Difficulty', options: DIFF_OPTIONS, value: 'easy' },
      { key: 'profit', type: 'readonly', label: 'Total profit (1.00×)', suffix: coin(ctx.currency()), hidden: true, mode: 'manual' },
    ],
    onBet: () => (game ? cashout() : start()),
    hotkeys: {
      q: () => randomBtn.click(),
      ...Object.fromEntries([1, 2, 3, 4].map((n) => [String(n), () => game && !game.state.done && n <= DIFFICULTIES[difficulty].cols && pick(n - 1)])),
    },
    auto: {
      run: () => autoRound(),
      canRun: () => {
        if (autoPath.length) return true;
        ctx.toast({ type: 'error', title: 'No tiles selected', message: 'Pick one tile per row on the tower, starting from the bottom.' });
        return false;
      },
    },
  });

  const randomBtn = el('<button class="btn btn-secondary btn-block tw-random" hidden>Random pick</button>');
  const autoTools = el(`<div class="tw-auto-tools" hidden>
    <button class="btn btn-secondary btn-block" data-act="clear">Clear selection</button>
    <div class="bp-hint tw-hint"></div></div>`);
  panel.extra.append(randomBtn, autoTools);

  const stage = el(`<div class="tower-stage">
    <div class="tw-wrap">
      <div class="tw-top">${DRAGON}</div>
      <div class="tw-frame"><div class="tw-rows"></div></div>
    </div>
  </div>`);
  ctx.stage.appendChild(stage);
  const wrap = stage.querySelector('.tw-wrap');
  const rowsEl = stage.querySelector('.tw-rows');
  let rows = []; // rows[r] = { el, tiles: [] }

  // ---- tower rendering ----
  function build(diff) {
    difficulty = diff;
    const { cols } = DIFFICULTIES[diff];
    wrap.dataset.cols = cols;
    rowsEl.innerHTML = '';
    rows = [];
    for (let r = 0; r < ROWS; r++) {
      const m = multiplierFor(diff, r + 1);
      const row = el(`<div class="tw-row" data-r="${r}">${Array.from(
        { length: cols },
        (_, c) => `<button type="button" class="tw-tile" data-r="${r}" data-c="${c}" aria-label="Row ${r + 1}, tile ${c + 1}"><span class="tw-mult">${tileLabel(m)}</span></button>`,
      ).join('')}</div>`);
      rowsEl.appendChild(row);
      rows.push({ el: row, tiles: [...row.children] });
    }
  }

  function resetTile(t) {
    t.className = 'tw-tile';
    t.querySelector('.tw-icon')?.remove();
  }

  function setTile(r, c, kind, { picked = true, pop = false, delay = 0 } = {}) {
    const t = rows[r].tiles[c];
    resetTile(t);
    t.classList.add('revealed', picked ? 'picked' : 'dim');
    if (kind) t.classList.add(kind);
    if (kind) t.insertAdjacentHTML('beforeend', kind === 'safe' ? EGG : SKULL);
    if (pop && ctx.animations()) {
      t.classList.add('pop');
      t.style.setProperty('--d', `${delay}ms`);
    }
  }

  function setActiveRow(r) {
    rows.forEach((row, i) => {
      row.el.classList.toggle('active', i === r);
      row.el.classList.toggle('future', r != null && i > r);
      row.el.classList.toggle('passed', r != null && i < r);
    });
  }

  function clearTower() {
    showingResult = false;
    wrap.classList.remove('lost', 'won');
    for (const row of rows) row.tiles.forEach(resetTile);
    rows.forEach((row) => row.el.classList.remove('active', 'future', 'passed', 'selectable'));
    renderAutoSelection();
  }

  function renderAutoSelection() {
    const auto = panel.mode === 'auto';
    wrap.classList.toggle('auto', auto);
    const selecting = auto && !showingResult && !animating;
    wrap.classList.toggle('selecting', selecting);
    if (!selecting) {
      rows.forEach((row) => row.el.classList.remove('selectable'));
      return;
    }
    rows.forEach((row, r) => {
      row.tiles.forEach((t, c) => t.classList.toggle('selected', autoPath[r] === c));
      row.el.classList.toggle('selectable', r <= autoPath.length);
    });
    autoTools.querySelector('.tw-hint').textContent = autoPath.length
      ? `${autoPath.length} row${autoPath.length > 1 ? 's' : ''} selected · ${fmt.multiplier(floor2(multiplierFor(difficulty, autoPath.length)))} if all safe`
      : 'Pick one tile per row, starting from the bottom';
  }

  // Draw a full game state (used for resume and end-of-round reveal).
  function renderView(view) {
    clearTower();
    view.picks.forEach((c, r) => {
      const lostHere = view.lost && r === view.picks.length - 1;
      setTile(r, c, lostHere ? 'bad' : 'safe');
    });
    if (view.done) revealAll(view, { animate: false });
    else setActiveRow(view.picks.length);
  }

  function revealAll(view, { animate = true } = {}) {
    setActiveRow(null);
    const tower = view.safeTiles || [];
    tower.forEach((safe, r) => {
      const { cols } = DIFFICULTIES[difficulty];
      for (let c = 0; c < cols; c++) {
        if (view.picks[r] === c) continue;
        setTile(r, c, safe.includes(c) ? 'safe' : null, { picked: false, pop: animate, delay: animate ? r * 35 : 0 });
      }
    });
    wrap.classList.toggle('lost', !!view.lost);
    wrap.classList.toggle('won', !view.lost);
    showingResult = true;
  }

  // ---- panel state ----
  function setProfitField() {
    if (!game) return;
    const m = game.state.multiplier || 1;
    const code = game.currency;
    panel.setLabel('profit', `Total profit (${fmt.multiplier(floor2(m))})`);
    panel.set('profit', fmt.amount(roundDown(code, Math.max(0, game.amount * m - game.amount)), code));
    const suffix = panel.field('profit')?.querySelector('.suffix');
    if (suffix) suffix.innerHTML = coin(code);
  }

  function syncControls() {
    const playing = !!game && !game.state.done;
    wrap.classList.toggle('playing', playing);
    if (playing) {
      panel.lock(true);
      panel.setButton('Cashout', { disabled: busy || !game.state.picks.length });
      panel.show('profit', true);
      setProfitField();
      randomBtn.hidden = false;
      randomBtn.disabled = busy;
    } else {
      panel.lock(false);
      panel.show('profit', false);
      randomBtn.hidden = true;
      if (panel.mode === 'manual') {
        panel.resetButton();
        panel.button.disabled = busy;
      }
    }
    autoTools.hidden = panel.mode !== 'auto';
    autoTools.querySelector('button').disabled = panel.autoRunning;
  }

  function applyGame(g) {
    game = g;
    if (panel.mode !== 'manual') panel.root.querySelector('.bp-mode .tab[data-mode=manual]')?.click();
    if (g.state.difficulty !== difficulty) {
      panel.set('difficulty', g.state.difficulty);
      build(g.state.difficulty);
    }
    if (g.currency === ctx.currency()) panel.set('amount', g.amount);
    renderView(g.state);
    syncControls();
  }

  // ---- manual play ----
  async function start() {
    if (busy || game) return;
    if (!ctx.requireAuth()) return;
    const v = panel.values();
    if (!panel.checkBalance(v.amount)) return;
    busy = true;
    panel.setBusy(true);
    try {
      const res = await api.post('/api/games/tower/bet', { amount: v.amount, currency: ctx.currency(), params: { difficulty: v.difficulty } });
      if (destroyed) return;
      sound.bet();
      ctx.setBalance(res.balance);
      game = res.game;
      clearTower();
      setActiveRow(0);
    } catch (err) {
      if (err.code === 'game_active' && err.data?.game) {
        applyGame(err.data.game);
        ctx.toast({ title: 'Game in progress', message: 'Your unfinished Dragon Tower game has been restored.' });
      } else ctx.toastError(err);
    } finally {
      busy = false;
      panel.setBusy(false);
      syncControls();
    }
  }

  async function pick(c) {
    if (!game || busy || game.state.done) return;
    const r = game.state.picks.length;
    busy = true;
    syncControls();
    const tile = rows[r].tiles[c];
    tile.classList.add('pending');
    sound.click();
    try {
      const res = await api.post('/api/games/tower/action', { action: 'pick', data: { col: c } });
      if (destroyed) return;
      await handle(res, r, c);
    } catch (err) {
      tile.classList.remove('pending');
      if (err.code === 'no_game') {
        game = null;
        clearTower();
      }
      ctx.toastError(err);
    } finally {
      busy = false;
      syncControls();
    }
  }

  async function cashout() {
    if (!game || busy || !game.state.picks.length) return;
    busy = true;
    syncControls();
    try {
      const res = await api.post('/api/games/tower/action', { action: 'cashout' });
      if (destroyed) return;
      await handle(res, null, null);
    } catch (err) {
      ctx.toastError(err);
    } finally {
      busy = false;
      syncControls();
    }
  }

  function revealPick(view, r, c) {
    const bad = view.lost && r === view.picks.length - 1;
    setTile(r, c, bad ? 'bad' : 'safe', { pop: true });
    if (bad) {
      sound.bomb();
      if (ctx.animations()) {
        wrap.classList.remove('shake');
        void wrap.offsetWidth;
        wrap.classList.add('shake');
      }
    } else sound.reveal();
    return bad;
  }

  async function handle(res, r, c) {
    const view = res.game.state;
    if (res.bet) ctx.debitView(res);
    else ctx.setBalance(res.balance);
    let bad = false;
    if (r != null) bad = revealPick(view, r, c);
    if (!view.done) {
      game = res.game;
      setActiveRow(view.picks.length);
      return;
    }
    game = null;
    if (ctx.animations()) await wait(bad ? 520 : 200);
    if (destroyed) return;
    revealAll(view);
    finish(res, { lost: view.lost });
  }

  function finish(res, { lost, quick = false }) {
    const bet = res.bet;
    if (!bet) return;
    ctx.settle(res);
    if (bet.payout > bet.amount) {
      quick ? sound.win() : sound.cashout();
      ctx.resultPop(ctx.stage, { multiplier: bet.multiplier, payout: bet.payout, currency: bet.currency, duration: quick ? 900 : 1600 });
    } else if (!lost) sound.lose();
  }

  // ---- auto play ----
  async function autoRound() {
    const v = panel.values();
    const res = await api.post('/api/games/tower/bet', { amount: v.amount, currency: ctx.currency(), params: { difficulty: v.difficulty, autoPath: [...autoPath] } });
    if (destroyed) return null;
    ctx.debitView(res);
    sound.bet();
    animating = true;
    clearTower();
    const view = res.game.state;
    const anim = ctx.animations();
    for (let r = 0; r < view.picks.length; r++) {
      if (anim) setActiveRow(r);
      if (anim) await wait(70);
      if (destroyed) return null;
      revealPick(view, r, view.picks[r]);
      if (anim) await wait(70);
    }
    if (anim) await wait(view.lost ? 320 : 120);
    if (destroyed) return null;
    animating = false;
    revealAll(view);
    finish(res, { lost: view.lost, quick: true });
    const bet = res.bet;
    const win = bet.payout > bet.amount;
    if (anim) await wait(win ? 700 : 450);
    return { win, profit: bet.payout - bet.amount };
  }

  function toggleAuto(r, c) {
    if (panel.autoRunning) return;
    if (showingResult) clearTower();
    if (r > autoPath.length) return;
    if (autoPath[r] === c) autoPath = autoPath.slice(0, r);
    else if (r === autoPath.length) autoPath.push(c);
    else autoPath[r] = c;
    sound.click();
    renderAutoSelection();
  }

  // ---- events ----
  on(rowsEl, 'click', '.tw-tile', (e, t) => {
    const r = Number(t.dataset.r);
    const c = Number(t.dataset.c);
    if (panel.mode === 'auto') return toggleAuto(r, c);
    if (game && !game.state.done && r === game.state.picks.length) pick(c);
  });

  randomBtn.addEventListener('click', () => {
    if (!game || busy) return;
    pick(Math.floor(Math.random() * DIFFICULTIES[difficulty].cols));
  });

  autoTools.querySelector('[data-act=clear]').addEventListener('click', () => {
    if (panel.autoRunning) return;
    autoPath = [];
    clearTower();
  });

  panel.onChange((key, value) => {
    if (key === 'difficulty') {
      if (value !== difficulty) {
        autoPath = [];
        build(value);
        clearTower();
      }
    } else if (key === 'mode') {
      if (!game) clearTower();
      syncControls();
    } else if (key === 'autoStopped') syncControls();
  });

  async function resume() {
    if (!ctx.isAuthed() || game || busy) return;
    try {
      const { game: g } = await api.get('/api/games/tower/active');
      if (g && !destroyed && !game && !busy) applyGame(g);
    } catch {
      /* ignore */
    }
  }

  ctx.on('user', (user) => {
    if (!user) {
      game = null;
      clearTower();
      syncControls();
    } else resume();
  });
  ctx.on('currency', () => game && setProfitField());

  build('easy');
  clearTower();
  syncControls();
  resume();

  return {
    destroy() {
      destroyed = true;
      timers.forEach(clearTimeout);
      timers.clear();
    },
  };
}
