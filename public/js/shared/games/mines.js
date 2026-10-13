import { fail, int, combinations, floor4 } from './util.js';
import { shuffleSelect } from '../fair.js';

// Catalogue entry, read by the server (game discovery) and the lobby (/api/config).
export const META = {
  slug: 'mines',
  name: 'Mines',
  category: 'originals',
  order: 30,
  edge: 0.01,
  rtp: 99,
  desc: 'Uncover gems on a 5×5 grid while avoiding the mines. Every safe tile raises your multiplier; cash out whenever you like.',
  howTo: [
      'Choose how many mines (1–24) hide on the grid.',
      'Press Bet, then reveal tiles one at a time.',
      'Each gem raises your multiplier; hitting a mine loses the bet.',
      'Cash out at any time after your first gem.',
    ],
  hotkeys: [['Q', 'Pick a random tile'], ['W', 'Remove a mine (idle)'], ['E', 'Add a mine (idle)']],
  verifyFields: [['mines', 'Mines', 'number', 3]],
};

export const RULES_VERSION = 1;

export const TILES = 25;
export const EDGE = 0.01;

export function normalize(params = {}) {
  const mines = int(Number(params.mines ?? 3), 'mines', 1, 24);
  let autoTiles = null;
  if (params.autoTiles != null) {
    if (!Array.isArray(params.autoTiles) || params.autoTiles.length < 1) fail('Pick at least one tile');
    autoTiles = [...new Set(params.autoTiles.map((t) => int(Number(t), 'tile', 0, TILES - 1)))];
    if (autoTiles.length > TILES - mines) fail('Too many tiles selected for that many mines');
  }
  return { mines, autoTiles };
}

export function multiplierFor(mines, revealed) {
  if (revealed === 0) return 1;
  return floor4(((1 - EDGE) * combinations(TILES, revealed)) / combinations(TILES - mines, revealed));
}

export function minePositions(rng, mines) {
  const order = shuffleSelect(rng.take(TILES - 1), Array.from({ length: TILES }, (_, i) => i));
  return order.slice(0, mines).sort((a, b) => a - b);
}

// --- Stateful protocol ---------------------------------------------------------

export const stateful = true;

export function start(rng, params) {
  const state = {
    mines: params.mines,
    positions: minePositions(rng, params.mines),
    revealed: [],
    wager: 1,
    payout: 0,
    multiplier: 1,
    done: false,
    hit: null,
  };
  if (params.autoTiles) {
    for (const tile of params.autoTiles) {
      reveal(state, tile);
      if (state.done) return state;
    }
    cashout(state);
  }
  return state;
}

function reveal(state, tile) {
  if (state.revealed.includes(tile)) fail('Tile already revealed');
  state.revealed.push(tile);
  if (state.positions.includes(tile)) {
    state.hit = tile;
    state.done = true;
    state.multiplier = 0;
    state.payout = 0;
    return;
  }
  state.multiplier = multiplierFor(state.mines, state.revealed.length);
  if (state.revealed.length === TILES - state.mines) cashout(state);
}

function cashout(state) {
  if (!state.revealed.length) fail('Reveal at least one tile first');
  state.done = true;
  state.payout = state.multiplier;
}

export function actions(state) {
  if (state.done) return [];
  return state.revealed.length ? ['reveal', 'cashout'] : ['reveal'];
}

export function cost() {
  return 0;
}

export function act(state, action, data = {}) {
  if (action === 'reveal') reveal(state, int(Number(data.tile), 'tile', 0, TILES - 1));
  else if (action === 'cashout') cashout(state);
  else fail('Unknown action');
  return state;
}

export function view(state) {
  return {
    mines: state.mines,
    revealed: state.revealed,
    multiplier: state.multiplier,
    nextMultiplier: state.done ? null : multiplierFor(state.mines, state.revealed.length + 1),
    done: state.done,
    hit: state.hit,
    positions: state.done ? state.positions : null,
  };
}
