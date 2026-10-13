import { fail, oneOf } from './util.js';

// Catalogue entry, read by the server (game discovery) and the lobby (/api/config).
export const META = {
  slug: 'rps',
  name: 'Rock Paper Scissors',
  category: 'originals',
  order: 107,
  edge: 0.02,
  rtp: 98,
  desc: 'Beat the house up to 20 times in a row. Every win doubles your multiplier, a draw replays the round, one loss ends it.',
  howTo: ['Press Bet to start.', 'Throw rock, paper or scissors against the house.', 'Wins double the multiplier (0.98 × 2ⁿ); draws replay; a loss ends the round.', 'Cash out after any win.'],
  hotkeys: [['R', 'Rock'], ['P', 'Paper'], ['Q', 'Scissors']],
  icon: '<path d="M7 11V6a1.5 1.5 0 0 1 3 0v5M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M16 9.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2-3a1.5 1.5 0 0 1 2.5-1.6L7 13"/>',
  thumb: {
    bg: ['#20c997', '#087f5b'],
    glyph:
      '<g transform="translate(150 185)" font-size="74" text-anchor="middle"><circle cx="-80" r="44" fill="#fff" opacity=".2"/><circle cx="0" cy="-40" r="44" fill="#fff" opacity=".2"/><circle cx="80" r="44" fill="#fff" opacity=".2"/><text x="-80" y="26">✊</text><text x="0" y="-14">✋</text><text x="80" y="26">✌</text></g>',
  },
};

export const RULES_VERSION = 1;

export const HANDS = ['rock', 'paper', 'scissors'];
export const MAX_WINS = 20;
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

export function multiplierFor(wins) {
  return wins ? Math.round(0.98 * 2 ** wins * 100) / 100 : 1;
}

// One float per throw: house = floor(f × 3). A draw consumes a float and replays.
export function judge(player, house) {
  if (player === house) return 'draw';
  return BEATS[player] === house ? 'win' : 'loss';
}

export function normalize(params = {}) {
  let autoHands = null;
  if (params.autoHands != null) {
    if (!Array.isArray(params.autoHands) || params.autoHands.length < 1 || params.autoHands.length > MAX_WINS) fail(`Pick 1 to ${MAX_WINS} hands`);
    autoHands = params.autoHands.map((h) => oneOf(h, 'hand', HANDS));
  }
  return { autoHands };
}

export const stateful = true;
const MAX_THROWS = 400;

export function start(rng, params = {}) {
  const state = { throws: [], wins: 0, wager: 1, payout: 0, multiplier: 1, done: false, lost: false };
  if (params.autoHands) {
    // Each pre-selected hand is thrown until it wins or loses (draws repeat it).
    for (const hand of params.autoHands) {
      while (!state.done) {
        const r = play(state, hand, rng);
        if (r !== 'draw') break;
      }
      if (state.done) return state;
    }
    cashout(state);
  }
  return state;
}

function play(state, hand, rng) {
  if (state.throws.length >= MAX_THROWS) fail('Too many throws, please cash out');
  const house = HANDS[Math.floor(rng.next() * 3)];
  const result = judge(hand, house);
  state.throws.push({ hand, house, result });
  if (result === 'loss') {
    state.done = true;
    state.lost = true;
    state.multiplier = 0;
    state.payout = 0;
  } else if (result === 'win') {
    state.wins++;
    state.multiplier = multiplierFor(state.wins);
    if (state.wins === MAX_WINS) cashout(state);
  }
  return result;
}

function cashout(state) {
  if (!state.wins) fail('Win at least one round first');
  state.done = true;
  state.payout = state.multiplier;
}

export function actions(state) {
  if (state.done) return [];
  return state.wins ? ['play', 'cashout'] : ['play'];
}

export function cost() {
  return 0;
}

export function act(state, action, data = {}, rng) {
  if (state.done) fail('Round is over');
  if (action === 'play') play(state, oneOf(data.hand, 'hand', HANDS), rng);
  else if (action === 'cashout') cashout(state);
  else fail('Unknown action');
  return state;
}

export function view(state) {
  return { throws: state.throws, wins: state.wins, multiplier: state.multiplier, nextMultiplier: state.done ? null : multiplierFor(state.wins + 1), done: state.done, lost: state.lost };
}
