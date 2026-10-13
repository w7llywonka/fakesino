import { slidePointFromHex } from '../fair.js';

// Slide is a shared multiplayer round (server/plugins/slide.js); this module
// carries its catalogue entry and the result formula shared with the verifier.
export const META = {
  slug: 'slide',
  name: 'Slide',
  category: 'originals',
  order: 12,
  kind: 'multiplayer',
  edge: 0.02,
  rtp: 98,
  desc: 'Pick a target multiplier, then watch a strip of multipliers slide to a stop. If the card under the pointer is at or above your target, you win. Every round is shared and comes from a pre-committed hash chain.',
  howTo: ['Choose a target multiplier (1.01× – 1,000,000×) and an amount.', 'Bet during the countdown — bets placed while the strip slides join the next round.', 'You win amount × target when the round lands on your target or higher.'],
  hotkeys: [['W', 'Target −'], ['E', 'Target +']],
  icon: '<rect x="3" y="7" width="4" height="10" rx="1"/><rect x="10" y="5" width="4" height="14" rx="1"/><rect x="17" y="7" width="4" height="10" rx="1"/><path d="M12 2v2M12 20v2"/>',
  thumb: {
    bg: ['#3b5bdb', '#7048e8'],
    glyph:
      '<g transform="translate(150 190)">' +
      [[-120, '1.24', '#495057'], [-60, '3.10', '#2f9e44'], [0, '12.8', '#1971c2'], [60, '1.02', '#495057'], [120, '2.40', '#2f9e44']]
        .map(([x, t, c], i) => `<rect x="${x - 26}" y="${i === 2 ? -48 : -38}" width="52" height="${i === 2 ? 96 : 76}" rx="8" fill="${c}" ${i === 2 ? 'stroke="#ffd43b" stroke-width="5"' : ''}/><text x="${x}" y="6" text-anchor="middle" font-size="17" font-weight="900" fill="#fff">${t}</text>`)
        .join('') +
      '<path d="M0 -70l-12 -18h24z" fill="#ffd43b"/><path d="M0 70l-12 18h24z" fill="#ffd43b"/></g>',
  },
};

export const RULES_VERSION = 1;
export const MIN_TARGET = 1.01;
export const MAX_TARGET = 1000000;
export const EDGE = 0.02;

// result = max(1, floor(2^32 / (int + 1) × 0.98 × 100) / 100), int = first 8 hex of HMAC_SHA256(hash, salt).
export const resultFromHmac = slidePointFromHex;

export function winChance(target) {
  return ((1 - EDGE) / target) * 100;
}

// Colour band used for history chips and strip cards.
export function tier(m) {
  if (m >= 100) return 'gold';
  if (m >= 10) return 'blue';
  if (m >= 2) return 'green';
  return 'grey';
}
