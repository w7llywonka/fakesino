import { fail, int, floor2 } from './util.js';
import { shuffleSelect } from '../fair.js';

// Catalogue entry, read by the server (game discovery) and the lobby (/api/config).
export const META = {
  slug: 'moles',
  name: 'Moles',
  category: 'originals',
  order: 108,
  edge: 0.02,
  rtp: 98,
  desc: 'Seven holes, up to six moles. Whack a hole with a mole to climb the ladder — miss and the round is over.',
  howTo: ['Choose how many moles pop up (1–6). Fewer moles, bigger multipliers.', 'Press Bet, then whack one of the seven holes.', 'Hit a mole to climb; hit an empty hole and the bet is lost. Cash out any time after a hit.'],
  hotkeys: [['1-7', 'Whack that hole']],
  verifyFields: [['moles', 'Moles', [1, 2, 3, 4, 5, 6]]],
  icon: '<path d="M4 20h16"/><ellipse cx="12" cy="20" rx="7" ry="2"/><path d="M8 19v-6a4 4 0 0 1 8 0v6"/><path d="M10 12h.01M14 12h.01M11 15h2"/>',
  thumb: {
    bg: ['#a9e34b', '#5c940d'],
    glyph:
      '<g transform="translate(150 200)"><ellipse cy="60" rx="110" ry="26" fill="#3b2a1a"/><path d="M-56 58v-70a56 56 0 0 1 112 0v70z" fill="#8d6748"/><ellipse cx="0" cy="-6" rx="30" ry="22" fill="#d9b48f"/><circle cx="-22" cy="-30" r="7" fill="#111"/><circle cx="22" cy="-30" r="7" fill="#111"/><ellipse cy="-8" rx="10" ry="7" fill="#ff8fab"/><rect x="-60" y="-150" width="120" height="34" rx="8" fill="#ced4da" transform="rotate(-18)"/><rect x="-8" y="-124" width="16" height="70" rx="6" fill="#868e96" transform="rotate(-18)"/></g>',
  },
};

export const RULES_VERSION = 1;

export const HOLES = 7;
export const EDGE = 0.02;

export function maxHits(moles) {
  return moles === 1 ? 8 : 9;
}

// Published ladder: floor2(0.98 × (7/m)^h).
export function multiplierFor(moles, hits) {
  if (hits <= 0) return 1;
  return floor2((1 - EDGE) * (HOLES / moles) ** hits);
}

export function normalize(params = {}) {
  const moles = int(Number(params.moles ?? 3), 'moles', 1, 6);
  let autoHoles = null;
  if (params.autoHoles != null) {
    if (!Array.isArray(params.autoHoles) || params.autoHoles.length < 1 || params.autoHoles.length > maxHits(moles)) fail(`Pick 1 to ${maxHits(moles)} hits`);
    autoHoles = params.autoHoles.map((h) => int(Number(h), 'hole', 0, HOLES - 1));
  }
  return { moles, autoHoles };
}

export const stateful = true;

// Each step draws `moles` floats picking which holes have a mole.
function popUp(rng, moles) {
  return shuffleSelect(rng.take(moles), Array.from({ length: HOLES }, (_, i) => i)).sort((a, b) => a - b);
}

export function start(rng, params) {
  const state = { moles: params.moles, steps: [], hits: 0, wager: 1, payout: 0, multiplier: 1, done: false, lost: false };
  if (params.autoHoles) {
    for (const hole of params.autoHoles) {
      whack(state, hole, rng);
      if (state.done) return state;
    }
    cashout(state);
  }
  return state;
}

function whack(state, hole, rng) {
  const moles = popUp(rng, state.moles);
  const hit = moles.includes(hole);
  state.steps.push({ hole, moles, hit });
  if (!hit) {
    state.done = true;
    state.lost = true;
    state.multiplier = 0;
    state.payout = 0;
    return;
  }
  state.hits++;
  state.multiplier = multiplierFor(state.moles, state.hits);
  if (state.hits === maxHits(state.moles)) cashout(state);
}

function cashout(state) {
  if (!state.hits) fail('Hit at least one mole first');
  state.done = true;
  state.payout = state.multiplier;
}

export function actions(state) {
  if (state.done) return [];
  return state.hits ? ['whack', 'cashout'] : ['whack'];
}

export function cost() {
  return 0;
}

export function act(state, action, data = {}, rng) {
  if (state.done) fail('Round is over');
  if (action === 'whack') whack(state, int(Number(data.hole), 'hole', 0, HOLES - 1), rng);
  else if (action === 'cashout') cashout(state);
  else fail('Unknown action');
  return state;
}

export function view(state) {
  return { moles: state.moles, steps: state.steps, hits: state.hits, multiplier: state.multiplier, nextMultiplier: state.done ? null : multiplierFor(state.moles, state.hits + 1), done: state.done, lost: state.lost };
}
