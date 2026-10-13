// Per-currency limits for every game: the largest stake, and the largest
// profit a single bet can make (payouts above stake + maxProfit are capped).
export const LIMITS = {
  USD: { maxBet: 1e6, maxProfit: 1e5 },
  EUR: { maxBet: 1e6, maxProfit: 1e5 },
  BTC: { maxBet: 100, maxProfit: 20 },
  ETH: { maxBet: 1000, maxProfit: 700 },
  LTC: { maxBet: 100000, maxProfit: 10000 },
  SOL: { maxBet: 100000, maxProfit: 20000 },
  DOGE: { maxBet: 2e6, maxProfit: 5e5 },
  USDT: { maxBet: 2.5e7, maxProfit: 2.5e6 },
  TRX: { maxBet: 1e7, maxProfit: 1.5e6 },
};

export function limitsFor(code) {
  return LIMITS[code] || { maxBet: Infinity, maxProfit: Infinity };
}

// Largest stake allowed for a bet that can pay up to `multiplier`.
export function maxStake(code, multiplier) {
  const { maxBet, maxProfit } = limitsFor(code);
  return multiplier > 1 ? Math.min(maxBet, maxProfit / (multiplier - 1)) : maxBet;
}
