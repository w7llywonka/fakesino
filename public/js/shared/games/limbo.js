import { fail, num, floor2 } from './util.js';

export const EDGE = 0.01;
export const MIN_TARGET = 1.01;
export const MAX_TARGET = 1000000;

export function normalize(params = {}) {
  const target = Math.round(num(params.target ?? 2, 'target') * 100) / 100;
  if (target < MIN_TARGET || target > MAX_TARGET) fail(`Target must be between ${MIN_TARGET}x and ${MAX_TARGET}x`);
  return { target };
}

export function winChance(target) {
  return (100 * (1 - EDGE)) / target;
}

export function resultFromFloat(f) {
  if (f === 0) return MAX_TARGET;
  const point = floor2((1 - EDGE) / f);
  return Math.min(MAX_TARGET, Math.max(1, point));
}

export function outcome(rng, params) {
  const result = resultFromFloat(rng.next());
  const win = result >= params.target;
  return { result, win, multiplier: win ? params.target : 0 };
}
