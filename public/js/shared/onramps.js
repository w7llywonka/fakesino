import { CURRENCIES } from './currencies.js';
import { networkFor } from './networks.js';

// Fictional on-ramp providers for "Buy Crypto". Quotes use the fixed reference
// rates, so the amount shown is exactly what a purchase adds to the wallet.
export const PROVIDERS = [
  { id: 'demoramp', name: 'DemoRamp', color: '#6d5efc', feePct: 3.9, spreadPct: 0, methods: ['Card', 'Mobile wallet', 'Bank transfer'], eta: 'Instant' },
  { id: 'sandboxpay', name: 'SandboxPay', color: '#0f9f8f', feePct: 2.5, spreadPct: 1, methods: ['Card', 'Mobile wallet'], eta: 'Instant' },
  { id: 'mockramp', name: 'MockRamp', color: '#e8590c', feePct: 3.2, spreadPct: 0.4, methods: ['Card', 'Bank transfer'], eta: 'Instant' },
];

export function quote(providerId, { fiat, fiatAmount, coin, network }) {
  const p = PROVIDERS.find((x) => x.id === providerId);
  if (!p) return null;
  const fiatUsd = fiatAmount * CURRENCIES[fiat].usd;
  const feeUsd = (fiatUsd * p.feePct) / 100;
  const rateUsd = CURRENCIES[coin].usd * (1 + p.spreadPct / 100);
  const networkFee = networkFor(coin, network)?.withdrawFee ?? 0;
  const youGet = Math.max(0, (fiatUsd - feeUsd) / rateUsd - networkFee);
  return { provider: p.id, name: p.name, color: p.color, methods: p.methods, eta: p.eta, feeFiat: feeUsd / CURRENCIES[fiat].usd, networkFee, rate: rateUsd / CURRENCIES[fiat].usd, youGet };
}

export function quotes(params) {
  const list = PROVIDERS.map((p) => quote(p.id, params));
  const best = Math.max(...list.map((q) => q.youGet));
  return list.map((q) => ({ ...q, best: q.youGet === best }));
}
