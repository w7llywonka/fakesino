import { CURRENCIES } from './currencies.js';
import { networkFor } from './networks.js';

// Fictional on-ramp providers for "Buy Crypto". Quotes use the reference
// rates with a small drift that changes every 15 seconds, like a live quote.
export const PROVIDERS = [
  { id: 'demoramp', name: 'DemoRamp', color: '#6d5efc', feePct: 3.9, spreadPct: 0, methods: ['Card', 'Mobile wallet', 'Bank transfer'], eta: '5–10 min' },
  { id: 'sandboxpay', name: 'SandboxPay', color: '#0f9f8f', feePct: 2.5, spreadPct: 1, methods: ['Card', 'Mobile wallet'], eta: '2–5 min' },
  { id: 'mockramp', name: 'MockRamp', color: '#e8590c', feePct: 3.2, spreadPct: 0.4, methods: ['Card', 'Bank transfer'], eta: '10–30 min' },
];
export const QUOTE_MS = 15000;
export const BUY_MIN_USD = 10;

export const quoteEpoch = (t = Date.now()) => Math.floor(t / QUOTE_MS);
const drift = (epoch, code) => 1 + 0.003 * Math.sin(epoch * 1.7 + code.charCodeAt(0));

export function quote(providerId, { fiat, fiatAmount, coin, network, epoch = quoteEpoch() }) {
  const p = PROVIDERS.find((x) => x.id === providerId);
  if (!p) return null;
  const fiatUsd = fiatAmount * CURRENCIES[fiat].usd;
  const feeUsd = (fiatUsd * p.feePct) / 100;
  const rateUsd = CURRENCIES[coin].usd * drift(epoch, coin) * (1 + p.spreadPct / 100);
  const networkFee = networkFor(coin, network)?.withdrawFee ?? 0;
  const youGet = Math.max(0, (fiatUsd - feeUsd) / rateUsd - networkFee);
  return { provider: p.id, name: p.name, color: p.color, methods: p.methods, eta: p.eta, feeFiat: feeUsd / CURRENCIES[fiat].usd, networkFee, rate: rateUsd / CURRENCIES[fiat].usd, youGet };
}

export function quotes(params) {
  const list = PROVIDERS.map((p) => quote(p.id, params));
  const best = Math.max(...list.map((q) => q.youGet));
  return list.map((q) => ({ ...q, best: q.youGet === best }));
}
