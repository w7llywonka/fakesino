import { fail, cardFromFloat, floor4 } from './util.js';

// Catalogue entry, read by the server (game discovery) and the lobby (/api/config).
export const META = {
  slug: 'hilo',
  name: 'Hilo',
  category: 'originals',
  order: 80,
  edge: 0.01,
  rtp: 99,
  desc: 'Guess whether the next card is higher or lower. Chain correct guesses to multiply your stake, skip cards you don’t like.',
  howTo: [
      'Press Bet to draw the first card.',
      'Guess whether the next card is higher or lower (or the same).',
      'Skip any card you don’t like.',
      'Cash out after any correct guess.',
    ],
  hotkeys: [['Q', 'Higher'], ['W', 'Lower'], ['E', 'Skip card']],
};

export const RULES_VERSION = 1;

// Infinite-deck Hilo. Ace is low (1) and King is high (13).
// At an Ace you can pick Higher or Same; at a King, Lower or Same; otherwise
// Higher-or-Same or Lower-or-Same. Each step multiplies by 0.99 / probability.

export const EDGE = 0.01;
export const MAX_CARDS = 200;
const ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function rankValue(rank) {
  return ORDER.indexOf(rank) + 1;
}

export function options(card) {
  const v = rankValue(card.rank);
  if (v === 1) return ['higher', 'same'];
  if (v === 13) return ['lower', 'same'];
  return ['higher_or_same', 'lower_or_same'];
}

export function probability(card, guess) {
  const v = rankValue(card.rank);
  switch (guess) {
    case 'higher':
      return (13 - v) / 13;
    case 'lower':
      return (v - 1) / 13;
    case 'same':
      return 1 / 13;
    case 'higher_or_same':
      return (14 - v) / 13;
    case 'lower_or_same':
      return v / 13;
    default:
      return 0;
  }
}

export function stepMultiplier(card, guess) {
  return (1 - EDGE) / probability(card, guess);
}

export function isCorrect(prev, next, guess) {
  const a = rankValue(prev.rank);
  const b = rankValue(next.rank);
  switch (guess) {
    case 'higher':
      return b > a;
    case 'lower':
      return b < a;
    case 'same':
      return b === a;
    case 'higher_or_same':
      return b >= a;
    case 'lower_or_same':
      return b <= a;
    default:
      return false;
  }
}

export const stateful = true;

export function normalize() {
  return {};
}

export function start(rng) {
  return {
    cards: [{ ...cardFromFloat(rng.next()), guess: null }],
    multiplier: 1,
    exact: 1,
    wager: 1,
    payout: 0,
    done: false,
    lost: false,
  };
}

export function actions(state) {
  if (state.done) return [];
  const current = state.cards[state.cards.length - 1];
  const list = [...options(current), 'skip'];
  if (state.cards.some((c) => c.guess && c.guess !== 'skip')) list.push('cashout');
  return list;
}

export function cost() {
  return 0;
}

export function act(state, action, data, rng) {
  if (state.done) fail('Game is over');
  if (!actions(state).includes(action)) fail('That move is not available');
  if (action === 'cashout') {
    state.done = true;
    state.payout = state.multiplier;
    return state;
  }
  if (state.cards.length >= MAX_CARDS) fail('Card limit reached, please cash out');
  const prev = state.cards[state.cards.length - 1];
  const next = { ...cardFromFloat(rng.next()), guess: action };
  state.cards.push(next);
  if (action === 'skip') return state;
  if (!isCorrect(prev, next, action)) {
    state.done = true;
    state.lost = true;
    state.multiplier = 0;
    state.payout = 0;
    return state;
  }
  state.exact *= stepMultiplier(prev, action);
  state.multiplier = floor4(state.exact);
  return state;
}

export function view(state) {
  const current = state.cards[state.cards.length - 1];
  const odds = {};
  if (!state.done) {
    for (const g of options(current)) {
      odds[g] = { chance: probability(current, g) * 100, multiplier: floor4(state.exact * stepMultiplier(current, g)) };
    }
  }
  return { cards: state.cards, multiplier: state.multiplier, done: state.done, lost: state.lost, odds };
}
