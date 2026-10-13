// Frozen copy of rules v1 (kept so bets placed under v1 can still be verified).
import { oneOf } from '../util.js';

export const MULTIPLIER = 1.98;

export function normalize(params = {}) {
  return { side: oneOf(params.side ?? 'heads', 'side', ['heads', 'tails']) };
}

export function outcome(rng, params) {
  const side = rng.next() < 0.5 ? 'heads' : 'tails';
  const win = side === params.side;
  return { side, win, multiplier: win ? MULTIPLIER : 0 };
}
