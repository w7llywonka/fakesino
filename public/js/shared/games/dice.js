import { fail, num, oneOf, floor4 } from './util.js';

// Catalogue entry, read by the server (game discovery) and the lobby (/api/config).
export const META = {
  slug: 'dice',
  name: 'Dice',
  category: 'originals',
  order: 40,
  edge: 0.01,
  rtp: 99,
  desc: 'Pick a target and roll over or under it. Slide to trade win chance for multiplier, from 1.0102× to 9,900×.',
  howTo: [
      'Set your bet amount.',
      'Drag the slider (or type a multiplier or win chance) to choose your target.',
      'Toggle Roll Over / Roll Under.',
      'Press Bet — the roll lands between 0.00 and 100.00.',
    ],
  hotkeys: [['Q', 'Toggle roll over / under'], ['W', 'Target −1'], ['E', 'Target +1']],
  verifyFields: [['target', 'Target', 'number', 50.5], ['condition', 'Condition', ['over', 'under']]],
};

export const RULES_VERSION = 1;

export const EDGE = 0.01;
export const MIN_CHANCE = 0.01;
export const MAX_CHANCE = 98;

export function chanceFor({ target, condition }) {
  return condition === 'over' ? 100 - target : target;
}

export function multiplierFor(params) {
  return floor4((100 * (1 - EDGE)) / chanceFor(params));
}

export function normalize(params = {}) {
  const condition = oneOf(params.condition ?? 'over', 'condition', ['over', 'under']);
  const target = Math.round(num(params.target ?? 50.5, 'target') * 100) / 100;
  const chance = chanceFor({ target, condition });
  if (chance < MIN_CHANCE || chance > MAX_CHANCE) fail(`Win chance must be between ${MIN_CHANCE}% and ${MAX_CHANCE}%`);
  return { target, condition };
}

export function outcome(rng, params) {
  const f = rng.next();
  // 10,001 possible rolls: 0.00 – 100.00
  const roll = Math.floor(f * 10001) / 100;
  const win = params.condition === 'over' ? roll > params.target : roll < params.target;
  return { roll, win, multiplier: win ? multiplierFor(params) : 0 };
}
