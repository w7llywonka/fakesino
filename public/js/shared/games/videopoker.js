import { fail, RANKS, SUITS } from './util.js';
import { shuffleSelect } from '../fair.js';

// Jacks or Better, full-pay 9/6, single 52-card deck. Ten floats shuffle the
// first ten cards of the deck: five are dealt, the rest replace discards in order.

export const PAYTABLE = [
  { key: 'royal_flush', name: 'Royal Flush', pays: 800 },
  { key: 'straight_flush', name: 'Straight Flush', pays: 50 },
  { key: 'four_kind', name: '4 of a Kind', pays: 25 },
  { key: 'full_house', name: 'Full House', pays: 9 },
  { key: 'flush', name: 'Flush', pays: 6 },
  { key: 'straight', name: 'Straight', pays: 4 },
  { key: 'three_kind', name: '3 of a Kind', pays: 3 },
  { key: 'two_pair', name: 'Two Pair', pays: 2 },
  { key: 'jacks_better', name: 'Jacks or Better', pays: 1 },
];

const DECK = SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));

export function evaluate(cards) {
  const values = cards.map((c) => RANKS.indexOf(c.rank) + 2).sort((a, b) => a - b);
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([v, n]) => ({ v: Number(v), n }))
    .sort((a, b) => b.n - a.n || b.v - a.v);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const unique = groups.length === 5;
  const wheel = values.join(',') === '2,3,4,5,14';
  const straight = unique && (values[4] - values[0] === 4 || wheel);
  if (straight && flush) return values[0] === 10 ? 'royal_flush' : 'straight_flush';
  if (groups[0].n === 4) return 'four_kind';
  if (groups[0].n === 3 && groups[1].n === 2) return 'full_house';
  if (flush) return 'flush';
  if (straight) return 'straight';
  if (groups[0].n === 3) return 'three_kind';
  if (groups[0].n === 2 && groups[1].n === 2) return 'two_pair';
  if (groups[0].n === 2 && groups[0].v >= 11) return 'jacks_better';
  return null;
}

export function paysFor(key) {
  return PAYTABLE.find((p) => p.key === key)?.pays ?? 0;
}

export const stateful = true;

export function normalize() {
  return {};
}

export function start(rng) {
  const order = shuffleSelect(rng.take(10), DECK.map((_, i) => i)).map((i) => DECK[i]);
  return {
    hand: order.slice(0, 5),
    reserve: order.slice(5, 10),
    held: [false, false, false, false, false],
    wager: 1,
    payout: 0,
    done: false,
    result: evaluate(order.slice(0, 5)),
  };
}

export function actions(state) {
  return state.done ? [] : ['draw'];
}

export function cost() {
  return 0;
}

export function act(state, action, data = {}) {
  if (state.done) fail('Hand is over');
  if (action !== 'draw') fail('Unknown action');
  const held = Array.isArray(data.held) ? data.held.slice(0, 5).map(Boolean) : [];
  while (held.length < 5) held.push(false);
  let r = 0;
  state.hand = state.hand.map((card, i) => (held[i] ? card : state.reserve[r++]));
  state.held = held;
  state.result = evaluate(state.hand);
  state.payout = paysFor(state.result);
  state.done = true;
  return state;
}

export function view(state) {
  return { hand: state.hand, held: state.held, result: state.result, done: state.done, payout: state.payout };
}
