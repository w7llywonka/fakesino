import crypto from 'node:crypto';
import { CURRENCIES, isCurrency, isDisplayFiat, roundDown, toUsd, emptyBalances } from '../public/js/shared/currencies.js';
import { initialSeeds, publicSeeds } from './fair.js';
import { HttpError, badRequest } from './http.js';

export const SESSION_TTL = 365 * 24 * 3600 * 1000;

export const VIP_LEVELS = [
  { name: 'None', wager: 0, color: '#9fb0c4' },
  { name: 'Bronze', wager: 10000, color: '#c47a3a' },
  { name: 'Silver', wager: 50000, color: '#b8c4d1' },
  { name: 'Gold', wager: 100000, color: '#f2c94c' },
  { name: 'Platinum I', wager: 250000, color: '#7fd6d9' },
  { name: 'Platinum II', wager: 500000, color: '#7fd6d9' },
  { name: 'Platinum III', wager: 1000000, color: '#7fd6d9' },
  { name: 'Platinum IV', wager: 2500000, color: '#7fd6d9' },
  { name: 'Platinum V', wager: 5000000, color: '#7fd6d9' },
  { name: 'Platinum VI', wager: 10000000, color: '#7fd6d9' },
  { name: 'Diamond I', wager: 25000000, color: '#a78bfa' },
  { name: 'Diamond II', wager: 50000000, color: '#9b7bf7' },
  { name: 'Diamond III', wager: 100000000, color: '#8d68f2' },
  { name: 'Diamond IV', wager: 250000000, color: '#7e55ec' },
  { name: 'Diamond V', wager: 500000000, color: '#6f42e3' },
  { name: 'Obsidian', wager: 1000000000, color: '#c9d1e0' },
];

// Per-UTC-day wager buckets drive the weekly, monthly, daily and reload bonuses.
export const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const KEEP_DAYS = 45;

export const RAKEBACK_SHARE = 0.05; // of expected house edge

export function vipInfo(wageredUsd) {
  let i = 0;
  while (i + 1 < VIP_LEVELS.length && wageredUsd >= VIP_LEVELS[i + 1].wager) i++;
  const level = VIP_LEVELS[i];
  const next = VIP_LEVELS[i + 1] || null;
  const progress = next ? (wageredUsd - level.wager) / (next.wager - level.wager) : 1;
  return { index: i, level: level.name, color: level.color, next: next?.name || null, nextWager: next?.wager || null, progress: Math.max(0, Math.min(1, progress)), wageredUsd };
}

const USERNAME_RE = /^[A-Za-z0-9_]{3,14}$/;
export const DEVICE_RE = /^[a-f0-9]{32,128}$/;
const RESTORE_CAP_USD = 10_000_000; // per currency, when rebuilding a wallet from a browser snapshot
const SETTING_KEYS = ['hideZero', 'displayFiat', 'privateMode', 'sound', 'animations', 'maxBetWarning'];

export const deviceKey = (deviceId) => crypto.createHash('sha256').update(`device:${deviceId}`).digest('hex');

export function validateUsername(store, username, self = null) {
  username = String(username || '').trim();
  if (!USERNAME_RE.test(username)) throw badRequest('Username must be 3–14 characters: letters, numbers or _', { field: 'username' });
  const owner = store.data.usernames[username.toLowerCase()];
  if (owner != null && owner !== self?.id) throw badRequest('That username is taken', { field: 'username' });
  return username;
}

function guestName(store) {
  for (let i = 0; i < 50; i++) {
    const name = `Player${crypto.randomInt(10000, 1000000)}`;
    if (store.data.usernames[name.toLowerCase()] == null) return name;
  }
  return `Player${store.data.seq.user + 1}${crypto.randomInt(10, 100)}`;
}

// Rebuild what a browser remembers about its wallet. Everything is play money,
// so a snapshot is trusted as long as it is well-formed and within sane bounds.
function applySnapshot(store, user, snap) {
  if (!snap || typeof snap !== 'object') return false;
  const num = (v, max) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
  };
  for (const field of ['balances', 'vault']) {
    const src = snap[field];
    if (!src || typeof src !== 'object') continue;
    for (const code of Object.keys(CURRENCIES)) user[field][code] = roundDown(code, num(src[code], RESTORE_CAP_USD / CURRENCIES[code].usd));
  }
  if (isCurrency(snap.currency)) user.currency = snap.currency;
  if (snap.settings && typeof snap.settings === 'object') {
    for (const k of SETTING_KEYS) if (k in snap.settings) user.settings[k] = !!snap.settings[k];
    if (isDisplayFiat(snap.settings.displayFiatCurrency)) user.settings.displayFiatCurrency = snap.settings.displayFiatCurrency;
  }
  user.stats.wageredUsd = num(snap.wageredUsd, 1e10);
  if (snap.username) {
    try {
      user.username = validateUsername(store, snap.username);
    } catch {
      /* keep the generated name if the old one is taken or invalid */
    }
  }
  return true;
}

export function createGuest(store, snapshot = null) {
  const d = store.data;
  const id = store.nextId('user');
  const user = {
    id,
    username: guestName(store),
    createdAt: Date.now(),
    balances: emptyBalances(),
    vault: emptyBalances(),
    currency: 'USD',
    settings: { hideZero: false, displayFiat: false, displayFiatCurrency: 'USD', privateMode: false, sound: true, animations: true, maxBetWarning: true },
    stats: { bets: 0, wins: 0, losses: 0, wageredUsd: 0, profitUsd: 0, byGame: {}, byCurrency: {} },
    rakeback: emptyBalances(),
    seeds: initialSeeds(),
    seedHistory: [],
    active: {},
    cards: [],
    addresses: {},
    limits: { depositDailyUsd: null, breakUntil: 0 },
  };
  const restored = applySnapshot(store, user, snapshot);
  d.users[id] = user;
  d.usernames[user.username.toLowerCase()] = id;
  store.save();
  return { user, restored };
}

export function userForDevice(store, deviceId) {
  const id = store.data.devices[deviceKey(deviceId)];
  return id != null ? store.data.users[id] || null : null;
}

export function linkDevice(store, deviceId, user) {
  store.data.devices[deviceKey(deviceId)] = user.id;
  store.save();
}

export function renameUser(store, user, username) {
  const name = validateUsername(store, username, user);
  delete store.data.usernames[user.username.toLowerCase()];
  user.username = name;
  store.data.usernames[name.toLowerCase()] = user.id;
  store.save();
  return user;
}

export function createSession(store, user) {
  const token = crypto.randomBytes(32).toString('hex');
  store.data.sessions[token] = { userId: user.id, createdAt: Date.now() };
  store.save();
  return token;
}

export function sessionUser(store, token) {
  if (!token) return null;
  const s = store.data.sessions[token];
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL) {
    delete store.data.sessions[token];
    return null;
  }
  return store.data.users[s.userId] || null;
}

export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
    balances: user.balances,
    vault: user.vault,
    currency: user.currency,
    settings: user.settings,
    vip: vipInfo(user.stats.wageredUsd),
    stats: { bets: user.stats.bets, wins: user.stats.wins, losses: user.stats.losses, wageredUsd: user.stats.wageredUsd, profitUsd: user.stats.profitUsd },
    rakeback: user.rakeback,
    welcomeCode: user.welcomeCode || null,
    seeds: publicSeeds(user),
    activeGames: Object.keys(user.active || {}),
    limits: user.limits || { depositDailyUsd: null, breakUntil: 0 },
    cards: (user.cards || []).map(({ id, brand, last4, expMonth, expYear, name }) => ({ id, brand, last4, expMonth, expYear, name })),
    twoFactor: !!user.totp,
  };
}

// --- Wallet -------------------------------------------------------------------

export function parseCurrency(user, c) {
  const code = c ?? user.currency;
  if (!isCurrency(code)) throw badRequest('Unsupported currency');
  return code;
}

export function parseAmount(currency, value, { min = 0 } = {}) {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) throw badRequest('Invalid amount');
  const amount = roundDown(currency, n);
  if (amount < min) throw badRequest(`Minimum amount is ${min} ${currency}`);
  return amount;
}

export function credit(user, currency, amount) {
  // `|| 0`: wallets created before a coin was listed have no entry for it.
  user.balances[currency] = roundDown(currency, (user.balances[currency] || 0) + amount);
  return user.balances[currency];
}

export function debit(user, currency, amount) {
  if (!(amount <= (user.balances[currency] || 0) + 1e-12)) throw new HttpError(400, 'Insufficient balance', { code: 'insufficient_balance' });
  user.balances[currency] = roundDown(currency, user.balances[currency] - amount);
  if (user.balances[currency] < 0) user.balances[currency] = 0;
  return user.balances[currency];
}

export function recordWagerStats(user, { game, currency, amount, payout, edge }) {
  const s = user.stats;
  const usd = toUsd(currency, amount);
  const profitUsd = toUsd(currency, payout - amount);
  s.bets++;
  if (payout > amount) s.wins++;
  else if (payout < amount) s.losses++;
  s.wageredUsd += usd;
  s.profitUsd += profitUsd;
  const g = (s.byGame[game] ||= { bets: 0, wageredUsd: 0, profitUsd: 0 });
  g.bets++;
  g.wageredUsd += usd;
  g.profitUsd += profitUsd;
  const c = (s.byCurrency[currency] ||= { bets: 0, wagered: 0, profit: 0 });
  c.bets++;
  c.wagered = roundDown(currency, c.wagered + amount);
  c.profit = Math.round((c.profit + payout - amount) * 10 ** CURRENCIES[currency].decimals) / 10 ** CURRENCIES[currency].decimals;
  const edgeUsd = usd * (edge ?? 0.01);
  const days = (user.edgeDays ||= {});
  const today = dayKey();
  const b = (days[today] ||= { wagerUsd: 0, edgeUsd: 0, profitUsd: 0 });
  b.wagerUsd += usd;
  b.edgeUsd += edgeUsd;
  b.profitUsd += profitUsd;
  if (Object.keys(days).length > KEEP_DAYS) for (const k of Object.keys(days).sort().slice(0, -KEEP_DAYS)) delete days[k];
  // Rakeback starts at Bronze, or earlier with a welcome code.
  if (vipInfo(s.wageredUsd).index >= 1 || user.welcomeCode) user.rakeback[currency] = (user.rakeback[currency] || 0) + amount * (edge ?? 0.01) * RAKEBACK_SHARE;
}

// Σ over the UTC days [from, to) of a bucket field.
export function sumDays(user, from, to, field = 'edgeUsd') {
  let total = 0;
  for (const [k, b] of Object.entries(user.edgeDays || {})) {
    const t = Date.parse(`${k}T00:00:00Z`);
    if (t >= from && t < to) total += b[field] || 0;
  }
  return total;
}

// --- Responsible gaming ---------------------------------------------------------

export function assertNotOnBreak(user) {
  const until = user.limits?.breakUntil || 0;
  if (until > Date.now()) {
    throw new HttpError(403, `You're taking a break until ${new Date(until).toUTCString()}. Betting and deposits are paused.`, { code: 'on_break', until });
  }
}

export function assertDepositLimit(store, user, usd) {
  const limit = user.limits?.depositDailyUsd;
  if (limit == null) return;
  const since = Date.now() - 24 * 3600 * 1000;
  let used = 0;
  for (let i = store.data.transactions.length - 1; i >= 0; i--) {
    const t = store.data.transactions[i];
    if (t.createdAt < since) break;
    if (t.userId === user.id && t.type === 'deposit' && t.status !== 'failed') used += toUsd(t.currency, t.amount);
  }
  if (used + usd > limit + 1e-9) {
    throw new HttpError(400, `This deposit would exceed your daily deposit limit of $${limit.toLocaleString('en-US')} ($${Math.max(0, limit - used).toFixed(2)} left today).`, { code: 'deposit_limit', field: 'amount' });
  }
}
