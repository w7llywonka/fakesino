import { fail } from './util.js';

// Catalogue entry, read by the server (game discovery) and the lobby (/api/config).
export const META = {
  slug: 'diamonds',
  name: 'Diamonds',
  category: 'originals',
  order: 65,
  edge: 0.0171,
  rtp: 98.29,
  desc: 'Five gems, seven colours. Match them like a poker hand — a pair, two pair, three of a kind up to five of a kind for 50×.',
  howTo: ['Set your bet amount.', 'Press Bet — five gems are revealed.', 'Matching colours pay from the table: five of a kind pays 50×.'],
  icon: '<path d="M6 4h12l3 5-9 11L3 9z"/><path d="M3 9h18M9 4l3 16 3-16"/>',
  thumb: {
    bg: ['#4dabf7', '#5f3dc4'],
    glyph:
      '<g transform="translate(150 190)">' +
      [['#40c057', -96], ['#be4bdb', -48], ['#fcc419', 0], ['#ff6b6b', 48], ['#22b8cf', 96]]
        .map(([c, x]) => `<path d="M${x - 20} -10h40l12 16-32 40-32-40z" fill="${c}"/><path d="M${x - 20} -10h40l12 16h-64z" fill="#fff" opacity=".35"/>`)
        .join('') +
      '</g>',
  },
};

export const RULES_VERSION = 1;

export const GEMS = ['green', 'purple', 'yellow', 'red', 'cyan', 'pink', 'blue'];

// Paytable by sorted colour counts; `ways` are the outcomes out of 7^5 = 16807.
export const PAYTABLE = [
  { key: 'five', name: 'Five of a kind', pattern: [5], pays: 50, ways: 7 },
  { key: 'four', name: 'Four of a kind', pattern: [4, 1], pays: 5, ways: 210 },
  { key: 'full', name: 'Full house', pattern: [3, 2], pays: 4, ways: 420 },
  { key: 'three', name: 'Three of a kind', pattern: [3, 1, 1], pays: 3, ways: 2100 },
  { key: 'twopair', name: 'Two pair', pattern: [2, 2, 1], pays: 2, ways: 3150 },
  { key: 'pair', name: 'Pair', pattern: [2, 1, 1, 1], pays: 0.1, ways: 8400 },
  { key: 'none', name: 'No match', pattern: [1, 1, 1, 1, 1], pays: 0, ways: 2520 },
];

export function normalize() {
  return {};
}

export function classify(gems) {
  const counts = {};
  for (const g of gems) counts[g] = (counts[g] || 0) + 1;
  const pattern = Object.values(counts).sort((a, b) => b - a).join(',');
  const row = PAYTABLE.find((p) => p.pattern.join(',') === pattern);
  if (!row) fail('Invalid gems');
  return { row, counts };
}

export function outcome(rng) {
  const gems = rng.take(5).map((f) => GEMS[Math.floor(f * GEMS.length)]);
  const { row, counts } = classify(gems);
  // Colours that are part of a matching group, for highlighting.
  const matched = Object.entries(counts)
    .filter(([, n]) => n >= 2)
    .map(([g]) => g);
  return { gems, hand: row.key, matched, multiplier: row.pays };
}
