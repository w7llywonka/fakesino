import { roundDown, CURRENCIES } from '../public/js/shared/currencies.js';
import { limitsFor, maxStake } from '../public/js/shared/limits.js';
import { badRequest } from './http.js';

const show = (code, n) => `${Number(roundDown(code, n)).toLocaleString('en-US', { maximumFractionDigits: CURRENCIES[code]?.decimals ?? 8 })} ${code}`;

// Reject stakes above the currency's max bet, and fixed-multiplier bets whose
// best case would exceed the max profit.
export function assertStake(code, amount, maxMultiplier = null) {
  const { maxBet } = limitsFor(code);
  if (amount > maxBet + 1e-12) throw badRequest(`The maximum bet is ${show(code, maxBet)}`, { code: 'max_bet', maxBet });
  if (maxMultiplier > 1) {
    const max = maxStake(code, maxMultiplier);
    if (amount > max + 1e-12) throw badRequest(`The maximum bet amount is ${show(code, max)}. Reduce multiplier to increase maximum bet`, { code: 'max_profit', maxBet: roundDown(code, max) });
  }
}

// Progressive games can run past the max profit; their payout is capped.
export function capPayout(code, amount, payout) {
  const { maxProfit } = limitsFor(code);
  return Math.min(payout, roundDown(code, amount + maxProfit));
}
