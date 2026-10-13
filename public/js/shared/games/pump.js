import { makeLadder } from './lib/ladder.js';

// Catalogue entry, read by the server (game discovery) and the lobby (/api/config).
export const META = {
  slug: 'pump',
  name: 'Pump',
  category: 'originals',
  order: 106,
  edge: 0.02,
  rtp: 98,
  desc: 'Pump the balloon as far as you dare. Every pump raises the multiplier — cash out before it pops.',
  howTo: ['Choose a difficulty: more pop points mean bigger multipliers.', 'Press Bet, then Pump one breath at a time.', 'Cash out after any pump. If the balloon pops, the bet is lost.'],
  hotkeys: [['P', 'Pump']],
  verifyFields: [['difficulty', 'Difficulty', ['easy', 'medium', 'hard', 'expert']]],
  icon: '<path d="M12 3a6 7 0 0 1 6 7c0 4-3 7-6 7s-6-3-6-7a6 7 0 0 1 6-7z"/><path d="M12 17l-1 2h2l-1-2M12 19c0 2-2 2-2 3"/>',
  thumb: {
    bg: ['#ff6b9a', '#a61e4d'],
    glyph:
      '<g transform="translate(150 175)"><ellipse rx="78" ry="92" fill="#ff8fab"/><ellipse cx="-26" cy="-38" rx="20" ry="30" fill="#fff" opacity=".45"/><path d="M-8 92h16l-8 12z" fill="#c2255c"/><path d="M0 104c0 30-26 30-26 60" stroke="#fff" stroke-width="4" fill="none"/></g>',
  },
};

export const RULES_VERSION = 1;

// 25 pumps, 1/3/5/10 pop points; pops = first M of a 24-float shuffle of 1..25.
const engine = makeLadder({ N: 25, hazards: { easy: 1, medium: 3, hard: 5, expert: 10 }, floats: 24, stepAction: 'pump' });
export const { DIFFICULTIES, maxSteps, multiplierFor, ladder, normalize, stateful, start, actions, cost, act, view, reveal } = engine;
