import { oneOf } from './util.js';

// Catalogue entry, read by the server (game discovery) and the lobby (/api/config).
export const META = {
  slug: 'darts',
  name: 'Darts',
  category: 'originals',
  order: 75,
  edge: 0.02,
  rtp: 98,
  desc: 'Throw a dart at a six-ring board. The closer to the bullseye, the bigger the multiplier — up to 500× on Expert.',
  howTo: ['Choose a difficulty: harder boards have smaller centres and bigger prizes.', 'Press Bet to throw.', 'The ring the dart lands in sets your multiplier.'],
  verifyFields: [['difficulty', 'Difficulty', ['easy', 'medium', 'hard', 'expert']]],
  icon: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M14 10l7-7M18 3h3v3"/>',
  thumb: {
    bg: ['#ff8787', '#862e9c'],
    glyph:
      '<g transform="translate(150 190)"><circle r="96" fill="#1b1b2f"/><circle r="80" fill="#e9ecef"/><circle r="62" fill="#e03131"/><circle r="44" fill="#e9ecef"/><circle r="26" fill="#2f9e44"/><circle r="10" fill="#e03131"/><path d="M8 -8l70 -70" stroke="#ffd43b" stroke-width="6"/><path d="M70 -86l20 -4-4 20z" fill="#ffd43b"/></g>',
  },
};

export const RULES_VERSION = 1;

// Tiers 1 (outer ring) … 6 (bullseye). Multipliers are published; the ring
// probabilities (in %) make each difficulty return exactly 98%.
export const TABLES = {
  easy: { mult: [0.5, 0.8, 1.2, 1.5, 2.7, 8.5], prob: [48.5333, 25.0667, 12.4, 6.9, 5.5, 1.6] },
  medium: { mult: [0.4, 0.6, 1.3, 3.1, 6, 16], prob: [54.85, 29.15, 7.5, 4.2, 3.3, 1.0] },
  hard: { mult: [0.2, 0.5, 2.5, 3.6, 8.8, 63], prob: [58.81, 28.2, 6.3, 4.23, 2.1, 0.36] },
  expert: { mult: [0.1, 0.5, 4.8, 9.6, 42, 500], prob: [67.515, 26.625, 3.89, 1.29, 0.64, 0.04] },
};
export const DIFFICULTIES = Object.keys(TABLES);

export function normalize(params = {}) {
  return { difficulty: oneOf(params.difficulty ?? 'medium', 'difficulty', DIFFICULTIES) };
}

// Ring boundaries as a fraction of the board area, from the centre outwards.
export function bands(difficulty) {
  const { prob } = TABLES[difficulty];
  const out = [];
  let acc = 0;
  for (let tier = 6; tier >= 1; tier--) {
    acc += prob[tier - 1] / 100;
    out.push({ tier, outer: Math.min(1, acc) });
  }
  return out;
}

// f1 → angle (clockwise from the top, visual only); f2 → area fraction from
// the centre, which picks the ring. Radius = √f2 keeps the board area-uniform.
export function outcome(rng, params) {
  const [f1, f2] = rng.take(2);
  const ring = bands(params.difficulty).find((b) => f2 < b.outer) || { tier: 1 };
  const multiplier = TABLES[params.difficulty].mult[ring.tier - 1];
  return { tier: ring.tier, angle: f1 * 360, radius: Math.sqrt(f2), multiplier };
}

// Best case for the bet limits.
export const maxMultiplier = (params) => Math.max(...TABLES[params.difficulty].mult);
