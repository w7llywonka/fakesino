import { fail, num, oneOf, floor4 } from './util.js';

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
