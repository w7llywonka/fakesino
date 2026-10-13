import { fail, num, floor2 } from './util.js';

// Catalogue entry, read by the server (game discovery) and the lobby (/api/config).
export const META = {
  slug: 'limbo',
  name: 'Limbo',
  category: 'originals',
  order: 50,
  edge: 0.01,
  rtp: 99,
  desc: 'Set a target multiplier and see if the result reaches it. Simple, fast and up to 1,000,000×.',
  howTo: ['Choose a target multiplier (1.01× – 1,000,000×).', 'Press Bet.', 'You win if the result is at or above your target.'],
  hotkeys: [['W', 'Target −'], ['E', 'Target +']],
  verifyFields: [['target', 'Target multiplier', 'number', 2]],
};

export const RULES_VERSION = 1;

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

// Best case for the bet limits.
export const maxMultiplier = (params) => params.target;
