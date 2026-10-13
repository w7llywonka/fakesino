import { oneOf } from './util.js';

// Catalogue entry, read by the server (game discovery) and the lobby (/api/config).
export const META = {
  slug: 'tarot',
  name: 'Tarot',
  category: 'originals',
  order: 76,
  edge: 0.02,
  rtp: 98,
  desc: 'Three cards decide your fate: a Major Arcana in the middle and two Minor Arcana beside it. Your payout is their multipliers multiplied together.',
  howTo: ['Choose a difficulty.', 'Press Bet — the middle (Major) card turns first, then the left and right (Minor) cards.', 'Payout = left × middle × right. A 0× card ends the reading.'],
  verifyFields: [['difficulty', 'Difficulty', ['easy', 'medium', 'hard', 'expert']]],
  icon: '<rect x="3" y="5" width="7" height="12" rx="1" transform="rotate(-10 6 11)"/><rect x="8.5" y="4" width="7" height="13" rx="1"/><rect x="14" y="5" width="7" height="12" rx="1" transform="rotate(10 17 11)"/><path d="M12 8.5l.9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3z"/>',
  thumb: {
    bg: ['#7048e8', '#1b1340'],
    glyph:
      '<g transform="translate(150 185)">' +
      [[-80, -12], [0, 0], [80, 12]]
        .map(([x, r], i) => `<g transform="translate(${x} 0) rotate(${r})"><rect x="-34" y="-58" width="68" height="116" rx="8" fill="${i === 1 ? '#ffd43b' : '#d0bfff'}"/><rect x="-26" y="-50" width="52" height="100" rx="5" fill="none" stroke="#5f3dc4" stroke-width="3"/><circle r="14" fill="#5f3dc4"/></g>`)
        .join('') +
      '</g>',
  },
};

export const RULES_VERSION = 1;

// [multiplier, probability %] in lookup order. E[minor]² × E[major] = 0.98 on
// every difficulty. Medium is published; the others are house-designed to the
// published maximums (20×, 1,176×, 5,000×).
export const TABLES = {
  easy: {
    minor: [[0, 10], [0.5, 40], [0.7, 20], [1.1, 10], [1.5, 10], [2, 10]],
    major: [[1, 51], [1.5, 23.75], [2, 15.25], [3, 7], [5, 3]],
  },
  medium: {
    minor: [[0, 19], [0.3, 50], [0.6, 15], [2, 9], [4, 7]],
    major: [[1, 55], [2, 23], [3, 13], [5, 6], [10, 3]],
  },
  hard: {
    minor: [[0, 40], [0.5, 34], [1, 13], [2, 7], [3, 4], [7, 2]],
    major: [[1, 65], [2, 18.5], [3, 8], [5, 5], [10, 2.5], [24, 1]],
  },
  expert: {
    minor: [[0, 47], [0.5, 28], [1, 13], [2, 7], [4, 3.5], [10, 1.5]],
    major: [[1, 72.6], [2, 13.7], [3, 7], [5, 4], [10, 1.9], [50, 0.8]],
  },
};
export const DIFFICULTIES = Object.keys(TABLES);

export function normalize(params = {}) {
  return { difficulty: oneOf(params.difficulty ?? 'medium', 'difficulty', DIFFICULTIES) };
}

export function lookup(table, f) {
  let acc = 0;
  for (const [m, p] of table) {
    acc += p / 100;
    if (f < acc) return m;
  }
  return table[table.length - 1][0];
}

// Floats in flip order: middle (Major), left (Minor), right (Minor).
export function outcome(rng, params) {
  const t = TABLES[params.difficulty];
  const [fm, fl, fr] = rng.take(3);
  const middle = lookup(t.major, fm);
  const left = lookup(t.minor, fl);
  const right = lookup(t.minor, fr);
  const multiplier = Math.round(left * middle * right * 10000) / 10000;
  // A 0× left card ends the reading; the right card is never turned.
  return { cards: { left, middle, right: left === 0 ? null : right }, multiplier };
}

// Best case for the bet limits.
export const maxMultiplier = (params) => {
  const t = TABLES[params.difficulty];
  return Math.max(...t.minor.map(([m]) => m)) ** 2 * Math.max(...t.major.map(([m]) => m));
};
