import { int, round2, cardFromFloat } from './util.js';

// Catalogue entry, read by the server (game discovery) and the lobby (/api/config).
export const META = {
  slug: 'blitz',
  name: 'Blitz',
  category: 'originals',
  order: 77,
  edge: 0.02,
  rtp: 98,
  desc: 'Pick how many cards to deal, from 5 to 36. If every card is different, you win — the longer the run, the bigger the multiplier.',
  howTo: ['Choose a target from 5 to 36 cards.', 'Press Bet — cards are dealt from an infinite deck.', 'Any repeated card loses; reach the target with all cards unique to win.'],
  verifyFields: [['target', 'Target cards', 'number', 10]],
  icon: '<rect x="4" y="4" width="10" height="14" rx="2"/><rect x="10" y="6" width="10" height="14" rx="2"/><path d="M15 9l-2 4h3l-2 4"/>',
  thumb: {
    bg: ['#ffd43b', '#e8590c'],
    glyph:
      '<g transform="translate(150 190)">' +
      [-90, -45, 0, 45, 90].map((x, i) => `<rect x="${x - 26}" y="${-50 + (i % 2) * 10}" width="52" height="76" rx="7" fill="#fff" transform="rotate(${(i - 2) * 6} ${x} 0)"/>`).join('') +
      '<path d="M8 -70l-30 60h26l-14 60 44-74h-28z" fill="#1c1c28"/></g>',
  },
};

export const RULES_VERSION = 1;

export const MIN_TARGET = 5;
export const MAX_TARGET = 36;

export function chanceFor(n) {
  let p = 1;
  for (let i = 0; i < n; i++) p *= (52 - i) / 52;
  return p;
}

export function multiplierFor(n) {
  return round2(0.98 / chanceFor(n));
}

export function normalize(params = {}) {
  return { target: int(Number(params.target ?? 10), 'target', MIN_TARGET, MAX_TARGET) };
}

// n floats, card_i = cardFromFloat(f_i). The run ends at the first repeat.
export function outcome(rng, params) {
  const seen = new Set();
  const cards = [];
  let repeat = null;
  for (const f of rng.take(params.target)) {
    const card = cardFromFloat(f);
    if (repeat == null) {
      cards.push(card);
      if (seen.has(card.index)) repeat = cards.length - 1;
      seen.add(card.index);
    }
  }
  const win = repeat == null;
  return { cards, repeat, win, multiplier: win ? multiplierFor(params.target) : 0 };
}
