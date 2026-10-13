export class GameRuleError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GameRuleError';
    this.status = 400;
  }
}

export function fail(message) {
  throw new GameRuleError(message);
}

export function num(v, name) {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) fail(`Invalid ${name}`);
  return n;
}

export function int(v, name, min, max) {
  const n = num(v, name);
  if (!Number.isInteger(n) || n < min || n > max) fail(`${name} must be between ${min} and ${max}`);
  return n;
}

export function oneOf(v, name, options) {
  if (!options.includes(v)) fail(`Invalid ${name}`);
  return v;
}

// Floors/rounds with a relative tolerance so values that are mathematically
// exact (0.98 × 7/3 × …) don't lose a cent to binary floating point.
export function floor2(n) {
  return Math.floor(n * 100 * (1 + 1e-12)) / 100;
}

export function floor4(n) {
  return Math.floor(n * 10000 * (1 + 1e-12)) / 10000;
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

// Round half up at 2 decimals (published ladders use this).
export function round2h(n) {
  return Math.round(n * 100 * (1 + 1e-12)) / 100;
}

export function combinations(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

// Standard 52-card shoe ordering used by every card game here.
export const SUITS = ['diamonds', 'hearts', 'spades', 'clubs'];
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export function cardFromFloat(f) {
  const index = Math.floor(f * 52);
  return { rank: RANKS[Math.floor(index / 4)], suit: SUITS[index % 4], index };
}
