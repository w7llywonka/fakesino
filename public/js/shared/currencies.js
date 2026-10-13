// Currency catalogue shared by the server wallet and the browser UI.
// Everything here is play money: rates are fixed reference values used only
// to show a fiat equivalent and to rank wagers, never to settle anything real.

export const CURRENCIES = {
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2, usd: 1, type: 'fiat', color: '#2fbf71' },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2, usd: 1.08, type: 'fiat', color: '#3b82f6' },
  BTC: { code: 'BTC', name: 'Bitcoin', symbol: '₿', decimals: 8, usd: 62000, type: 'crypto', color: '#f7931a', network: 'Bitcoin' },
  ETH: { code: 'ETH', name: 'Ethereum', symbol: 'Ξ', decimals: 8, usd: 2600, type: 'crypto', color: '#8a92b2', network: 'Ethereum (ERC20)' },
  LTC: { code: 'LTC', name: 'Litecoin', symbol: 'Ł', decimals: 8, usd: 70, type: 'crypto', color: '#bfbbbb', network: 'Litecoin' },
  SOL: { code: 'SOL', name: 'Solana', symbol: '◎', decimals: 8, usd: 150, type: 'crypto', color: '#14f195', network: 'Solana' },
  DOGE: { code: 'DOGE', name: 'Dogecoin', symbol: 'Ð', decimals: 8, usd: 0.12, type: 'crypto', color: '#c2a633', network: 'Dogecoin' },
  USDT: { code: 'USDT', name: 'Tether', symbol: '₮', decimals: 8, usd: 1, type: 'crypto', color: '#26a17b', network: 'Ethereum (ERC20)' },
  TRX: { code: 'TRX', name: 'Tron', symbol: 'T', decimals: 8, usd: 0.16, type: 'crypto', color: '#ef0027', network: 'Tron (TRC20)' },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES);

// Currencies crypto amounts can be *displayed* in ("Display crypto in fiat").
// Display only: bets and balances stay in the crypto itself.
export const DISPLAY_FIATS = {
  USD: { name: 'US Dollar', symbol: '$', usd: 1, decimals: 2 },
  EUR: { name: 'Euro', symbol: '€', usd: 1.08, decimals: 2 },
  GBP: { name: 'British Pound', symbol: '£', usd: 1.27, decimals: 2 },
  CAD: { name: 'Canadian Dollar', symbol: 'CA$', usd: 0.73, decimals: 2 },
  AUD: { name: 'Australian Dollar', symbol: 'A$', usd: 0.66, decimals: 2 },
  NZD: { name: 'New Zealand Dollar', symbol: 'NZ$', usd: 0.6, decimals: 2 },
  JPY: { name: 'Japanese Yen', symbol: '¥', usd: 0.0067, decimals: 0 },
  CNY: { name: 'Chinese Yuan', symbol: 'CN¥', usd: 0.14, decimals: 2 },
  KRW: { name: 'South Korean Won', symbol: '₩', usd: 0.00073, decimals: 0 },
  INR: { name: 'Indian Rupee', symbol: '₹', usd: 0.012, decimals: 2 },
  IDR: { name: 'Indonesian Rupiah', symbol: 'Rp', usd: 0.000063, decimals: 0 },
  PHP: { name: 'Philippine Peso', symbol: '₱', usd: 0.017, decimals: 2 },
  VND: { name: 'Vietnamese Dong', symbol: '₫', usd: 0.00004, decimals: 0 },
  BRL: { name: 'Brazilian Real', symbol: 'R$', usd: 0.18, decimals: 2 },
  MXN: { name: 'Mexican Peso', symbol: 'MX$', usd: 0.055, decimals: 2 },
  ARS: { name: 'Argentine Peso', symbol: 'ARS', usd: 0.001, decimals: 2 },
  CLP: { name: 'Chilean Peso', symbol: 'CLP', usd: 0.0011, decimals: 0 },
  TRY: { name: 'Turkish Lira', symbol: '₺', usd: 0.03, decimals: 2 },
  PLN: { name: 'Polish Zloty', symbol: 'zł', usd: 0.25, decimals: 2 },
  NGN: { name: 'Nigerian Naira', symbol: '₦', usd: 0.00065, decimals: 2 },
};
export const isDisplayFiat = (code) => Object.prototype.hasOwnProperty.call(DISPLAY_FIATS, code);

export function isCurrency(code) {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, code);
}

// Round toward zero at the currency's precision so the house never pays a
// fraction of a unit that does not exist.
export function roundDown(code, amount) {
  const d = CURRENCIES[code].decimals;
  const f = 10 ** d;
  return Math.floor(amount * f + 1e-7) / f;
}

export function roundNearest(code, amount) {
  const d = CURRENCIES[code].decimals;
  const f = 10 ** d;
  return Math.round(amount * f) / f;
}

export function toUsd(code, amount) {
  return amount * CURRENCIES[code].usd;
}

export function fromUsd(code, usd) {
  return usd / CURRENCIES[code].usd;
}

export function emptyBalances() {
  const out = {};
  for (const c of CURRENCY_CODES) out[c] = 0;
  return out;
}
