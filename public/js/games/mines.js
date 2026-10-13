import { el, on } from '../dom.js';
import { amountField } from '../ui/controls.js';
import { coin } from '../icons.js';
import { roundDown } from '../shared/currencies.js';
import { TILES } from '../shared/games/mines.js';

// Faceted gem (flat facets, no gradients so many copies can share the page).
const GEM = `<svg class="mn-icon mn-gem" viewBox="0 0 64 64" aria-hidden="true">
  <path d="M6 24L18 10h28l12 14L32 58z" fill="#0d8546"/>
  <path d="M6 24L18 10l4 14z" fill="#8ff8bf"/>
  <path d="M18 10h28L32 24z" fill="#d4ffe8"/>
  <path d="M18 10l4 14h10z" fill="#5ff0a0"/>
  <path d="M46 10L32 24h10z" fill="#33d47e"/>
  <path d="M46 10l12 14H42z" fill="#1aa95c"/>
  <path d="M6 24h16l10 34z" fill="#3fdc86"/>
  <path d="M22 24h20L32 58z" fill="#25c06c"/>
  <path d="M42 24h16L32 58z" fill="#108a49"/>
  <path d="M22 13.5h8" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".85"/>
  <path d="M52 3l1.4 3.6L57 8l-3.6 1.4L52 13l-1.4-3.6L47 8l3.6-1.4z" fill="#fff" class="mn-spark"/>
</svg>`;

const MINE = `<svg class="mn-icon mn-bomb" viewBox="0 0 64 64" aria-hidden="true">
  <path d="M41 18c3-7 9-9 14-5" fill="none" stroke="#d8b27a" stroke-width="3.2" stroke-linecap="round"/>
  <rect x="34" y="14" width="12" height="10" rx="2.5" transform="rotate(40 40 19)" fill="#6b7d90"/>
  <rect x="36.5" y="15" width="3" height="8" rx="1.2" transform="rotate(40 40 19)" fill="#93a5b8"/>
  <circle cx="30" cy="38" r="20" fill="#a3172b"/>
  <circle cx="28" cy="35.5" r="17" fill="#e23347"/>
  <ellipse cx="21" cy="29" rx="6" ry="3.6" transform="rotate(-35 21 29)" fill="#fff" opacity=".55"/>
  <circle cx="34" cy="45" r="2" fill="#fff" opacity=".18"/>
  <g class="mn-fuse"><path d="M56 6l1.6 4.4L62 12l-4.4 1.6L56 18l-1.6-4.4L50 12l4.4-1.6z" fill="#ffd34d"/><circle cx="56" cy="12" r="2.2" fill="#fff6c8"/></g>
</svg>`;

export default function mountMines(ctx) {
  const { api, fmt, sound } = ctx;
  let game = null; // active (unfinished) game from the server
  let busy = false;
  let destroyed = false;
  let showingResult = false; // board shows a finished round
  const selected = new Set(); // auto-mode tile picks (insertion order = reveal order)
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
      { key: 'mines', type: 'select', label: 'Mines', options: Array.from({ length: 24 }, (_, i) => [i + 1, String(i + 1)]), value: 3 },
      { key: 'gems', type: 'readonly', label: 'Gems', value: '22' },
      { key: 'profit', type: 'readonly', label: 'Total profit (1.00×)', suffix: coin(ctx.currency()), hidden: true, mode: 'manual' },
    ],
    onBet: () => (game ? cashout() : start()),
    auto: {
      run: () => autoRound(),
      canRun: () => {
        if (selected.size) return true;
        ctx.toast({ type: 'error', title: 'No tiles selected', message: 'Pick the tiles to reveal on the board first.' });
        return false;
      },
    },
  });

  // Mines + Gems side by side.
  const pair = el('<div class="bp-two mn-pair"></div>');
  panel.field('mines').before(pair);
  pair.append(panel.field('mines'), panel.field('gems'));

  const randomBtn = el('<button class="btn btn-secondary btn-block mn-random" hidden>Pick random tile</button>');
  const autoTools = el(`<div class="mn-auto-tools" hidden>
    <div class="bp-two"><button class="btn btn-secondary" data-act="rand">Random pick</button><button class="btn btn-secondary" data-act="clear">Clear</button></div>
    <div class="bp-hint mn-hint"></div></div>`);
  panel.extra.append(randomBtn, autoTools);

  const stage = el(`<div class="mines-stage"><div class="mines-board"></div></div>`);
  ctx.stage.appendChild(stage);
  const board = stage.querySelector('.mines-board');
  board.innerHTML = Array.from({ length: TILES }, (_, i) => `<button type="button" class="mn-tile" data-i="${i}" aria-label="Tile ${i + 1}"></button>`).join('');
  const tiles = [...board.children];

  // ---- board rendering ----
  function setTile(i, kind, { picked = true, pop = false, delay = 0 } = {}) {
    const t = tiles[i];
    t.className = 'mn-tile';
    t.style.removeProperty('--d');
    t.innerHTML = '';
    if (!kind) {
      if (panel.mode === 'auto') t.classList.toggle('selected', selected.has(i));
      return;
    }
    t.classList.add('revealed', kind, picked ? 'picked' : 'dim');
    if (pop && ctx.animations()) {
      t.classList.add('pop');
      if (delay) t.style.setProperty('--d', `${delay}ms`);
    }
    t.innerHTML = kind === 'gem' ? GEM : MINE;
  }

  function clearBoard() {
    showingResult = false;
    board.classList.remove('done', 'shake');
    for (let i = 0; i < TILES; i++) setTile(i, null);
    renderSelection();
  }

  function renderSelection() {
    const auto = panel.mode === 'auto';
    board.classList.toggle('auto', auto);
    if (!showingResult) tiles.forEach((t, i) => t.classList.toggle('selected', auto && selected.has(i)));
    const max = TILES - (panel.get('mines') || 3);
    autoTools.querySelector('.mn-hint').textContent = selected.size ? `${selected.size} of ${max} tiles selected` : 'Select tiles on the board to reveal each round';
  }

  // Reveal every tile at the end of a round; picked tiles stay full size.
  function revealAll(view, { animate = true } = {}) {
    const picked = new Set(view.revealed);
    const mines = new Set(view.positions || []);
    tiles.forEach((t, i) => {
      if (picked.has(i)) return;
      setTile(i, mines.has(i) ? 'mine' : 'gem', { picked: false, pop: animate, delay: ((i % 5) + Math.floor(i / 5)) * 22 });
    });
    board.classList.add('done');
    showingResult = true;
  }

  function renderGame(view) {
    showingResult = false;
    board.classList.remove('done', 'shake');
    tiles.forEach((t, i) => {
      if (view.revealed.includes(i)) setTile(i, view.hit === i ? 'mine' : 'gem');
      else setTile(i, null);
    });
    if (view.done) revealAll(view, { animate: false });
  }

  function boom(i) {
    sound.bomb();
    if (!ctx.animations()) return;
    tiles[i].classList.add('boom');
    board.classList.remove('shake');
    void board.offsetWidth;
    board.classList.add('shake');
  }

  // ---- panel state ----
  function setProfitField() {
    if (!game) return;
    const m = game.state.multiplier || 1;
    const code = game.currency;
    panel.setLabel('profit', `Total profit (${fmt.multiplier(Math.floor(m * 100 + 1e-9) / 100)})`);
    panel.set('profit', fmt.amount(roundDown(code, Math.max(0, game.amount * m - game.amount)), code));
    const suffix = panel.field('profit')?.querySelector('.suffix');
    if (suffix) suffix.innerHTML = coin(code);
  }

  function syncControls() {
    const playing = !!game && !game.state.done;
    board.classList.toggle('playing', playing);
    if (playing) {
      panel.lock(true);
      panel.setButton('Cashout', { disabled: busy || !game.state.revealed.length });
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
    autoTools.querySelectorAll('button').forEach((b) => (b.disabled = panel.autoRunning));
  }

  function applyGame(g) {
    game = g;
    if (panel.mode !== 'manual') panel.root.querySelector('.bp-mode .tab[data-mode=manual]')?.click();
    panel.set('mines', g.state.mines);
    panel.set('gems', TILES - g.state.mines);
    if (g.currency === ctx.currency()) panel.set('amount', g.amount);
    renderGame(g.state);
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
      const res = await api.post('/api/games/mines/bet', { amount: v.amount, currency: ctx.currency(), params: { mines: v.mines } });
      if (destroyed) return;
      sound.bet();
      ctx.setBalance(res.balance);
      clearBoard();
      game = res.game;
      if (board.animate && ctx.animations()) board.animate([{ transform: 'scale(.97)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
    } catch (err) {
      if (err.code === 'game_active' && err.data?.game) {
        applyGame(err.data.game);
        ctx.toast({ title: 'Game in progress', message: 'Your unfinished Mines game has been restored.' });
      } else ctx.toastError(err);
    } finally {
      busy = false;
      panel.setBusy(false);
      syncControls();
    }
  }

  async function reveal(i) {
    if (!game || busy || game.state.done || game.state.revealed.includes(i)) return;
    busy = true;
    syncControls();
    tiles[i].classList.add('pending');
    sound.click();
    try {
      const res = await api.post('/api/games/mines/action', { action: 'reveal', data: { tile: i } });
      if (destroyed) return;
      await handle(res, i);
    } catch (err) {
      tiles[i].classList.remove('pending');
      if (err.code === 'no_game') {
        game = null;
        clearBoard();
      }
      ctx.toastError(err);
    } finally {
      busy = false;
      syncControls();
    }
  }

  async function cashout() {
    if (!game || busy || !game.state.revealed.length) return;
    busy = true;
    syncControls();
    try {
      const res = await api.post('/api/games/mines/action', { action: 'cashout' });
      if (destroyed) return;
      await handle(res, null);
    } catch (err) {
      ctx.toastError(err);
    } finally {
      busy = false;
      syncControls();
    }
  }

  async function handle(res, tile) {
    const view = res.game.state;
    if (res.bet) ctx.debitView(res);
    else ctx.setBalance(res.balance);
    if (tile != null) {
      if (view.hit === tile) {
        setTile(tile, 'mine', { pop: true });
        boom(tile);
      } else {
        setTile(tile, 'gem', { pop: true });
        sound.reveal();
      }
    }
    if (!view.done) {
      game = res.game;
      return;
    }
    game = null;
    if (view.hit != null && ctx.animations()) await wait(420);
    if (destroyed) return;
    revealAll(view);
    const bet = res.bet;
    if (bet) {
      ctx.settle(res);
      if (bet.payout > bet.amount) {
        sound.cashout();
        ctx.resultPop(ctx.stage, { multiplier: bet.multiplier, payout: bet.payout, currency: bet.currency });
      } else if (view.hit == null) sound.lose();
    }
  }

  function randomTile(exclude) {
    const free = tiles.map((_, i) => i).filter((i) => !exclude.has(i));
    return free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  // ---- auto play ----
  async function autoRound() {
    const v = panel.values();
    const picks = [...selected];
    const res = await api.post('/api/games/mines/bet', { amount: v.amount, currency: ctx.currency(), params: { mines: v.mines, autoTiles: picks } });
    if (destroyed) return null;
    ctx.debitView(res);
    sound.bet();
    clearBoard();
    const view = res.game.state;
    const anim = ctx.animations();
    for (const i of view.revealed) {
      if (view.hit === i) {
        setTile(i, 'mine', { pop: true });
        boom(i);
      } else {
        setTile(i, 'gem', { pop: true });
        sound.reveal();
      }
      if (anim) await wait(view.revealed.length > 8 ? 45 : 80);
      if (destroyed) return null;
    }
    if (anim && view.hit != null) await wait(260);
    revealAll(view);
    const bet = res.bet;
    ctx.settle(res);
    const win = bet.payout > bet.amount;
    if (win) {
      sound.win();
      ctx.resultPop(ctx.stage, { multiplier: bet.multiplier, payout: bet.payout, currency: bet.currency, duration: 900 });
    }
    if (anim) await wait(win ? 700 : 450);
    return { win, profit: bet.payout - bet.amount };
  }

  function toggleSelect(i) {
    if (panel.autoRunning) return;
    if (showingResult) clearBoard();
    if (selected.has(i)) selected.delete(i);
    else {
      const max = TILES - panel.get('mines');
      if (selected.size >= max) {
        ctx.toast({ type: 'error', title: 'Too many tiles', message: `With ${panel.get('mines')} mines you can select up to ${max} tiles.` });
        return;
      }
      selected.add(i);
    }
    sound.click();
    renderSelection();
  }

  // ---- events ----
  on(board, 'click', '.mn-tile', (e, t) => {
    const i = Number(t.dataset.i);
    if (panel.mode === 'auto') toggleSelect(i);
    else reveal(i);
  });

  randomBtn.addEventListener('click', () => {
    if (!game || busy) return;
    const i = randomTile(new Set(game.state.revealed));
    if (i != null) reveal(i);
  });

  on(autoTools, 'click', '[data-act]', (e, b) => {
    if (panel.autoRunning) return;
    if (showingResult) clearBoard();
    if (b.dataset.act === 'clear') selected.clear();
    else {
      const max = TILES - panel.get('mines');
      if (selected.size >= max) return;
      const i = randomTile(selected);
      if (i != null) selected.add(i);
      sound.click();
    }
    renderSelection();
  });

  panel.onChange((key, value) => {
    if (key === 'mines') {
      panel.set('gems', TILES - value);
      const max = TILES - value;
      while (selected.size > max) selected.delete([...selected].pop());
      renderSelection();
    } else if (key === 'mode') {
      if (!game) clearBoard();
      syncControls();
    } else if (key === 'autoStopped') syncControls();
  });

  async function resume() {
    if (!ctx.isAuthed() || game || busy) return;
    try {
      const { game: g } = await api.get('/api/games/mines/active');
      if (g && !destroyed && !game && !busy) applyGame(g);
    } catch {
      /* ignore */
    }
  }

  ctx.on('user', (user) => {
    if (!user) {
      game = null;
      clearBoard();
      syncControls();
    } else resume();
  });
  ctx.on('currency', () => game && setProfitField());

  clearBoard();
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
