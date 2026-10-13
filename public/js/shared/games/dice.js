import { fail, num, oneOf, floor4 } from './util.js';

// Catalogue entry, read by the server (game discovery) and the lobby (/api/config).
export const META = {
  slug: 'dice',
  name: 'Dice',
  category: 'originals',
  order: 40,
  edge: 0.01,
  rtp: 99,
  desc: 'Pick a target and roll over or under it — or bet on a range, outside a range, or two ranges at once. Slide to trade win chance for multiplier, from 1.0102× to 9,900×.',
  howTo: [
      'Set your bet amount.',
      'Drag the slider (or type a multiplier or win chance) to choose your target.',
      'Toggle Roll Over / Roll Under, or switch mode to Between, Outside or Two Ranges and drag the handles.',
      'Press Bet — the roll lands between 0.00 and 100.00.',
    ],
  hotkeys: [['Q', 'Toggle roll over / under'], ['W', 'Target −1'], ['E', 'Target +1']],
  verifyFields: [
    ['condition', 'Condition', ['over', 'under', 'between', 'outside', 'between2']],
    ['target', 'Target (over / under)', 'number', 50.5],
    ['low', 'Low', 'number', 25],
    ['high', 'High', 'number', 75],
    ['low2', 'Low 2 (two ranges)', 'number', ''],
    ['high2', 'High 2 (two ranges)', 'number', ''],
  ],
};

export const RULES_VERSION = 1;

export const EDGE = 0.01;
export const MIN_CHANCE = 0.01;
export const MAX_CHANCE = 98;
export const CONDITIONS = ['over', 'under', 'between', 'outside', 'between2'];

const r2 = (n) => Math.round(n * 100) / 100;

// Win chance in % for any condition. Ranges are half-open [low, high), and
// "outside" excludes both bounds, so with 10,001 possible rolls the true
// probability is always chance / 100.01 — never above what is shown.
export function chanceFor(p) {
  switch (p.condition) {
    case 'over':
      return r2(100 - p.target);
    case 'under':
      return r2(p.target);
    case 'between':
      return r2(p.high - p.low);
    case 'outside':
      return r2(100 - (p.high - p.low));
    case 'between2':
      return r2(p.high - p.low + (p.high2 - p.low2));
    default:
      return NaN;
  }
}

export function multiplierFor(params) {
  return floor4((100 * (1 - EDGE)) / chanceFor(params));
}

// Winning intervals on the 0–100 bar (for drawing).
export function winRanges(p) {
  switch (p.condition) {
    case 'over':
      return [[p.target, 100]];
    case 'under':
      return [[0, p.target]];
    case 'between':
      return [[p.low, p.high]];
    case 'outside':
      return [[0, p.low], [p.high, 100]];
    case 'between2':
      return [[p.low, p.high], [p.low2, p.high2]];
    default:
      return [];
  }
}

export function wins(p, roll) {
  switch (p.condition) {
    case 'over':
      return roll > p.target;
    case 'under':
      return roll < p.target;
    case 'between':
      return roll >= p.low && roll < p.high;
    case 'outside':
      return roll < p.low || roll > p.high;
    case 'between2':
      return (roll >= p.low && roll < p.high) || (roll >= p.low2 && roll < p.high2);
    default:
      return false;
  }
}

export function normalize(params = {}) {
  const condition = oneOf(params.condition ?? 'over', 'condition', CONDITIONS);
  const bound = (key, def) => {
    const v = r2(num(params[key] === '' || params[key] == null ? def : params[key], key));
    if (v < 0 || v > 100) fail('Bounds must be between 0 and 100');
    return v;
  };
  let out;
  if (condition === 'over' || condition === 'under') out = { target: r2(num(params.target ?? 50.5, 'target')), condition };
  else {
    out = { condition, low: bound('low', 25), high: bound('high', 75) };
    if (!(out.low < out.high)) fail('The low bound must be below the high bound');
    if (condition === 'between2') {
      out.low2 = bound('low2', Math.min(100, out.high + 10));
      out.high2 = bound('high2', Math.min(100, out.low2 + 10));
      if (!(out.high <= out.low2 && out.low2 < out.high2)) fail('The two ranges must not overlap');
    }
  }
  const chance = chanceFor(out);
  if (!(chance >= MIN_CHANCE && chance <= MAX_CHANCE)) fail(`Win chance must be between ${MIN_CHANCE}% and ${MAX_CHANCE}%`);
  return out;
}

export function outcome(rng, params) {
  const f = rng.next();
  // 10,001 possible rolls: 0.00 – 100.00
  const roll = Math.floor(f * 10001) / 100;
  const win = wins(params, roll);
  return { roll, win, multiplier: win ? multiplierFor(params) : 0 };
}

// Best case for the bet limits.
export const maxMultiplier = (params) => multiplierFor(params);
