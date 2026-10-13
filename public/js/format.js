import { CURRENCIES } from './shared/currencies.js';
import { state } from './state.js';

const nf = new Map();
function formatter(min, max) {
  const key = `${min}:${max}`;
  if (!nf.has(key)) nf.set(key, new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max }));
  return nf.get(key);
}

// Raw amount at the currency's precision ("0.00012000", "12.50").
export function amount(value, code) {
  const c = CURRENCIES[code] || CURRENCIES.USD;
  const v = Number(value) || 0;
  return formatter(c.decimals, c.decimals).format(v);
}

export function fiat(usd, code = 'USD') {
  const c = CURRENCIES[code] || CURRENCIES.USD;
  return `${c.symbol}${formatter(2, 2).format(usd / c.usd)}`;
}

// Amount honouring the "display in fiat" preference.
export function money(value, code) {
  if (state.user?.settings?.displayFiat && CURRENCIES[code]?.type === 'crypto') {
    return fiat((Number(value) || 0) * CURRENCIES[code].usd);
  }
  if (CURRENCIES[code]?.type === 'fiat') return `${CURRENCIES[code].symbol}${amount(value, code)}`;
  return amount(value, code);
}

export function usdOf(value, code) {
  return (Number(value) || 0) * (CURRENCIES[code]?.usd ?? 1);
}

export function multiplier(m, digits = 2) {
  const v = Number(m) || 0;
  return `${formatter(digits, digits).format(v)}×`;
}

export function percent(p, digits = 2) {
  return `${formatter(digits, digits).format(p)}%`;
}

export function compact(n) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function time(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function dateTime(ts) {
  return new Date(ts).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function relative(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function duration(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${sec}s` : `${sec}s`;
}

// Strip trailing zeros for editable inputs: 1.50000000 → 1.5
export function inputAmount(value, code) {
  const c = CURRENCIES[code] || CURRENCIES.USD;
  return (Number(value) || 0).toFixed(c.decimals);
}

// Exchange rates: up to 8 significant digits, no trailing zeros.
export function rate(value) {
  const v = Number(value) || 0;
  const decimals = v >= 1 ? Math.max(0, 8 - Math.floor(Math.log10(v)) - 1) : 8;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: Math.min(8, decimals), maximumSignificantDigits: 8 }).format(v);
}
