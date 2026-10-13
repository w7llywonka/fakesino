import { fail, oneOf } from './util.js';

// Catalogue entry, read by the server (game discovery) and the lobby (/api/config).
export const META = {
  slug: 'coinflip',
  name: 'Flip',
  category: 'originals',
  order: 100,
  edge: 0.02,
  rtp: 98,
  desc: 'Call heads or tails up to 20 times. Each correct call doubles your multiplier from 1.96× to 1,027,604.48×; cash out after any win.',
  howTo: [
      'Press Bet to start a round.',
      'Call heads or tails (or Random) for each flip.',
      'Each correct call doubles your multiplier; one miss ends the round.',
      'Cash out after any win — up to 20 flips.',
    ],
  hotkeys: [['Q', 'Heads'], ['W', 'Tails'], ['E', 'Random']],
};

export const RULES_VERSION = 2;

// Flip: call up to 20 coin flips in a row. Each correct call doubles the
// multiplier (0.98 × 2^wins, a 2% edge); one miss ends the round. 20 floats
// are drawn up front; a float <= 0.5 lands tails, otherwise heads.

export const EDGE = 0.02;
export const MAX_FLIPS = 20;
export const SIDES = ['heads', 'tails'];

export function multiplierFor(wins) {
  return wins ? Math.round((1 - EDGE) * 2 ** wins * 100) / 100 : 1;
}

export function normalize(params = {}) {
  let autoSides = null;
  if (params.autoSides != null) {
    if (!Array.isArray(params.autoSides) || params.autoSides.length < 1 || params.autoSides.length > MAX_FLIPS) fail(`Pick 1 to ${MAX_FLIPS} flips`);
    autoSides = params.autoSides.map((side) => oneOf(side, 'side', SIDES));
  }
  return { autoSides };
}

export const stateful = true;

export function start(rng, params = {}) {
  const state = {
    results: rng.take(MAX_FLIPS).map((f) => (f <= 0.5 ? 'tails' : 'heads')),
    calls: [],
    wins: 0,
    wager: 1,
    payout: 0,
    multiplier: 1,
    done: false,
    lost: false,
  };
  if (params.autoSides) {
    for (const side of params.autoSides) {
      flip(state, side);
      if (state.done) return state;
    }
    cashout(state);
  }
  return state;
}

function flip(state, side) {
  const result = state.results[state.calls.length];
  state.calls.push({ side, result });
  if (result !== side) {
    state.done = true;
    state.lost = true;
    state.multiplier = 0;
    state.payout = 0;
    return;
  }
  state.wins++;
  state.multiplier = multiplierFor(state.wins);
  if (state.wins === MAX_FLIPS) cashout(state);
}

function cashout(state) {
  if (!state.wins) fail('Win at least one flip first');
  state.done = true;
  state.payout = state.multiplier;
}

export function actions(state) {
  if (state.done) return [];
  return state.wins ? ['flip', 'cashout'] : ['flip'];
}

export function cost() {
  return 0;
}

export function act(state, action, data = {}) {
  if (state.done) fail('Round is over');
  if (action === 'flip') flip(state, oneOf(data.side, 'side', SIDES));
  else if (action === 'cashout') cashout(state);
  else fail('Unknown action');
  return state;
}

export function view(state) {
  return {
    calls: state.calls,
    wins: state.wins,
    multiplier: state.multiplier,
    nextMultiplier: state.done ? null : multiplierFor(state.wins + 1),
    done: state.done,
    lost: state.lost,
    // Unplayed flips stay secret until the round ends.
    results: state.done ? state.results : null,
  };
}

// The full ladder (multiplier and chance per streak length) for the UI.
export const LADDER = Array.from({ length: MAX_FLIPS }, (_, i) => ({ wins: i + 1, multiplier: multiplierFor(i + 1), chance: 100 / 2 ** (i + 1) }));
