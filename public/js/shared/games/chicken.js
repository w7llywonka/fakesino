import { makeLadder } from './lib/ladder.js';

// Catalogue entry, read by the server (game discovery) and the lobby (/api/config).
export const META = {
  slug: 'chicken',
  name: 'Chicken',
  category: 'originals',
  order: 105,
  edge: 0.02,
  rtp: 98,
  desc: 'Guide the chicken across up to 19 lanes of traffic. Every lane crossed raises the multiplier — cash out before a car gets you.',
  howTo: ['Choose a difficulty: more cars mean bigger multipliers.', 'Press Bet, then GO to cross one lane at a time.', 'Cash out after any safe lane. Hit a car and the bet is lost.'],
  hotkeys: [['Space', 'Bet / cash out'], ['G', 'Go']],
  verifyFields: [['difficulty', 'Difficulty', ['easy', 'medium', 'hard', 'expert']]],
  icon: '<path d="M7 20c-2-2-2.5-6 0-9l2-2V6a3 3 0 0 1 6 0v1l3 1-3 1v2c2 2 2 6 0 9"/><path d="M9 20h6M12 6h.01"/>',
  thumb: {
    bg: ['#f7c948', '#d9480f'],
    glyph:
      '<g transform="translate(150 190)"><rect x="-140" y="40" width="280" height="40" fill="#2b2b38"/><path d="M-130 60h40M-60 60h40M10 60h40M80 60h40" stroke="#fff" stroke-width="6" stroke-dasharray="1"/><ellipse cx="0" cy="-10" rx="52" ry="58" fill="#fff"/><circle cx="-10" cy="-78" r="30" fill="#fff"/><path d="M-12 -112q8 -20 18 0q6 -18 14 2" fill="#e03131"/><path d="M14 -78l26 6l-26 8z" fill="#f59f00"/><circle cx="-2" cy="-84" r="4" fill="#111"/><path d="M-14 46v18M14 46v18" stroke="#f59f00" stroke-width="6"/></g>',
  },
};

export const RULES_VERSION = 1;

// 20 positions, 1/3/5/10 cars; deathLanes = first B of a 20-float shuffle.
const engine = makeLadder({ N: 20, hazards: { easy: 1, medium: 3, hard: 5, expert: 10 }, floats: 20, stepAction: 'go' });
export const { DIFFICULTIES, maxSteps, multiplierFor, ladder, normalize, stateful, start, actions, cost, act, view, reveal } = engine;
