// Frozen copy of rules v1 (kept so bets placed under v1 can still be verified).
import { fail, int, oneOf } from '../util.js';
import { shuffleSelect } from '../../fair.js';

const floor4 = (n) => Math.floor(n * 10000 + 1e-9) / 10000;

// Dragon Tower: climb 9 rows, each with `cols` tiles of which `safe` hide eggs.

export const ROWS = 9;
export const EDGE = 0.02;
export const DIFFICULTIES = {
  easy: { cols: 4, safe: 3 },
  medium: { cols: 3, safe: 2 },
  hard: { cols: 2, safe: 1 },
  expert: { cols: 3, safe: 1 },
  master: { cols: 4, safe: 1 },
};

export function multiplierFor(difficulty, level) {
  if (level === 0) return 1;
  const { cols, safe } = DIFFICULTIES[difficulty];
  return floor4((1 - EDGE) * (cols / safe) ** level);
}

export function normalize(params = {}) {
  const difficulty = oneOf(params.difficulty ?? 'easy', 'difficulty', Object.keys(DIFFICULTIES));
  let autoPath = null;
  if (params.autoPath != null) {
    const { cols } = DIFFICULTIES[difficulty];
    if (!Array.isArray(params.autoPath) || !params.autoPath.length || params.autoPath.length > ROWS) fail('Pick a tile on at least one row');
    autoPath = params.autoPath.map((c) => int(Number(c), 'tile', 0, cols - 1));
  }
  return { difficulty, autoPath };
}

export const stateful = true;

export function layout(rng, difficulty) {
  const { cols, safe } = DIFFICULTIES[difficulty];
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    const order = shuffleSelect(rng.take(cols), Array.from({ length: cols }, (_, i) => i));
    rows.push(order.slice(0, safe).sort((a, b) => a - b));
  }
  return rows;
}

export function start(rng, params) {
  const state = {
    difficulty: params.difficulty,
    safeTiles: layout(rng, params.difficulty),
    picks: [],
    wager: 1,
    payout: 0,
    multiplier: 1,
    done: false,
    lost: false,
  };
  if (params.autoPath) {
    for (const col of params.autoPath) {
      pick(state, col);
      if (state.done) return state;
    }
    cashout(state);
  }
  return state;
}

function pick(state, col) {
  const row = state.picks.length;
  state.picks.push(col);
  if (!state.safeTiles[row].includes(col)) {
    state.done = true;
    state.lost = true;
    state.multiplier = 0;
    state.payout = 0;
    return;
  }
  state.multiplier = multiplierFor(state.difficulty, state.picks.length);
  if (state.picks.length === ROWS) cashout(state);
}

function cashout(state) {
  if (!state.picks.length) fail('Pick a tile first');
  state.done = true;
  state.payout = state.multiplier;
}

export function actions(state) {
  if (state.done) return [];
  return state.picks.length ? ['pick', 'cashout'] : ['pick'];
}

export function cost() {
  return 0;
}

export function act(state, action, data = {}) {
  if (state.done) fail('Game is over');
  const { cols } = DIFFICULTIES[state.difficulty];
  if (action === 'pick') pick(state, int(Number(data.col), 'tile', 0, cols - 1));
  else if (action === 'cashout') cashout(state);
  else fail('Unknown action');
  return state;
}

export function view(state) {
  return {
    difficulty: state.difficulty,
    picks: state.picks,
    multiplier: state.multiplier,
    nextMultiplier: state.done ? null : multiplierFor(state.difficulty, state.picks.length + 1),
    done: state.done,
    lost: state.lost,
    // Rows already passed are public; the whole tower is revealed at the end.
    safeTiles: state.done ? state.safeTiles : state.safeTiles.slice(0, state.picks.length),
  };
}
