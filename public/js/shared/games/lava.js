import { fail, int, oneOf, floor2 } from './util.js';
import { shuffleSelect } from '../fair.js';

// Catalogue entry, read by the server (game discovery) and the lobby (/api/config).
export const META = {
  slug: 'lava',
  name: 'Floor Is Lava',
  category: 'originals',
  order: 109,
  edge: 0.02,
  rtp: 98,
  desc: 'Stand on a 7×7 floor while tiles sink into the lava. Survive the rounds to clear a level — three levels, up to 115,296×.',
  howTo: [
    'Choose a difficulty: Easy drops 7 tiles a round, Toxic drops 48.',
    'Press Bet, pick a tile and jump — then that round’s tiles drop.',
    'Survive every round to clear the level; the floor resets for up to 3 levels.',
    'Cash out after any safe landing.',
  ],
  hotkeys: [['Q', 'Jump to a random tile']],
  verifyFields: [['difficulty', 'Difficulty', ['easy', 'medium', 'hard', 'toxic']]],
  icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/><path d="M4 20c2-2 4 0 6-2s4 0 6-2 3 0 4-1" stroke-width="1.5"/>',
  thumb: {
    bg: ['#ff922b', '#c92a2a'],
    glyph:
      '<g transform="translate(150 185)">' +
      Array.from({ length: 25 }, (_, i) => {
        const x = (i % 5) * 36 - 90;
        const y = Math.floor(i / 5) * 36 - 90;
        const sunk = [1, 3, 6, 9, 13, 15, 17, 20, 22].includes(i);
        return `<rect x="${x}" y="${y}" width="32" height="32" rx="5" fill="${sunk ? '#ffd43b' : '#343a40'}" opacity="${sunk ? 0.85 : 1}"/>`;
      }).join('') +
      '</g>',
  },
};

export const RULES_VERSION = 1;

export const TILES = 49;
export const LEVELS = 3;
export const EDGE = 0.02;
// Tiles dropped per round and rounds per level; `standing` = tiles left at the end of a level.
export const DIFFICULTIES = {
  easy: { drop: 7, rounds: 6 },
  medium: { drop: 11, rounds: 4 },
  hard: { drop: 23, rounds: 2 },
  toxic: { drop: 48, rounds: 1 },
};
export const standing = (d) => TILES - DIFFICULTIES[d].drop * DIFFICULTIES[d].rounds;

// After surviving `round` rounds of `level`: 0.98 × 49/remaining × (49/S)^(level−1).
export function multiplierFor(d, level, round) {
  if (level === 1 && round === 0) return 1;
  const remaining = TILES - round * DIFFICULTIES[d].drop;
  return floor2((1 - EDGE) * (TILES / remaining) * (TILES / standing(d)) ** (level - 1));
}

export function normalize(params = {}) {
  const difficulty = oneOf(params.difficulty ?? 'easy', 'difficulty', Object.keys(DIFFICULTIES));
  const max = LEVELS * DIFFICULTIES[difficulty].rounds;
  const autoJumps = params.autoJumps == null || params.autoJumps === '' ? null : int(Number(params.autoJumps), 'jumps', 1, max);
  return { difficulty, autoJumps };
}

export const stateful = true;

const all = () => Array.from({ length: TILES }, (_, i) => i);

export function start(rng, params) {
  const state = { difficulty: params.difficulty, level: 1, round: 0, standing: all(), jumps: [], wager: 1, payout: 0, multiplier: 1, done: false, lost: false };
  if (params.autoJumps) {
    // Auto mode always jumps to the lowest-numbered standing tile; which tile
    // you pick doesn't change the odds, only where you stand.
    for (let i = 0; i < params.autoJumps && !state.done; i++) jump(state, state.standing[0], rng);
    if (!state.done) cashout(state);
  }
  return state;
}

// Jump to a standing tile, then D floats drop D of the standing tiles.
function jump(state, tile, rng) {
  if (!state.standing.includes(tile)) fail('That tile is already in the lava');
  const { drop, rounds } = DIFFICULTIES[state.difficulty];
  const dropped = shuffleSelect(rng.take(drop), state.standing);
  state.round++;
  state.jumps.push({ level: state.level, round: state.round, tile, dropped: dropped.sort((a, b) => a - b) });
  if (dropped.includes(tile)) {
    state.done = true;
    state.lost = true;
    state.multiplier = 0;
    state.payout = 0;
    return;
  }
  state.standing = state.standing.filter((t) => !dropped.includes(t));
  state.multiplier = multiplierFor(state.difficulty, state.level, state.round);
  if (state.round === rounds) {
    if (state.level === LEVELS) return cashout(state);
    // Level cleared: the floor resets.
    state.level++;
    state.round = 0;
    state.standing = all();
  }
}

function cashout(state) {
  if (!state.jumps.length) fail('Make at least one jump first');
  state.done = true;
  state.payout = state.multiplier;
}

export function actions(state) {
  if (state.done) return [];
  return state.jumps.length ? ['jump', 'cashout'] : ['jump'];
}

export function cost() {
  return 0;
}

export function act(state, action, data = {}, rng) {
  if (state.done) fail('Round is over');
  if (action === 'jump') jump(state, int(Number(data.tile), 'tile', 0, TILES - 1), rng);
  else if (action === 'cashout') cashout(state);
  else fail('Unknown action');
  return state;
}

export function view(state) {
  const next = state.done ? null : state.round === 0 && state.jumps.length ? multiplierFor(state.difficulty, state.level, 1) : multiplierFor(state.difficulty, state.level, state.round + 1);
  return { difficulty: state.difficulty, level: state.level, round: state.round, standing: state.standing, jumps: state.jumps, multiplier: state.multiplier, nextMultiplier: next, done: state.done, lost: state.lost };
}
