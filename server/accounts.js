import crypto from 'node:crypto';
import { CURRENCIES, isCurrency, roundDown, toUsd, emptyBalances } from '../public/js/shared/currencies.js';
import { initialSeeds, publicSeeds } from './fair.js';
import { HttpError, badRequest } from './http.js';

export const SESSION_TTL = 30 * 24 * 3600 * 1000;

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
  { name: 'Diamond', wager: 25000000, color: '#a78bfa' },
];

export const RAKEBACK_SHARE = 0.05; // of expected house edge
export const DAILY_BONUS_COOLDOWN = 24 * 3600 * 1000;

export function vipInfo(wageredUsd) {
  let i = 0;
  while (i + 1 < VIP_LEVELS.length && wageredUsd >= VIP_LEVELS[i + 1].wager) i++;
  const level = VIP_LEVELS[i];
  const next = VIP_LEVELS[i + 1] || null;
  const progress = next ? (wageredUsd - level.wager) / (next.wager - level.wager) : 1;
  return { index: i, level: level.name, color: level.color, next: next?.name || null, nextWager: next?.wager || null, progress: Math.max(0, Math.min(1, progress)), wageredUsd };
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, user) {
  const { hash } = hashPassword(password, user.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(user.passHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const USERNAME_RE = /^[A-Za-z0-9_]{3,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createUser(store, { username, email, password }) {
  username = String(username || '').trim();
  email = String(email || '').trim();
  password = String(password || '');
  if (!USERNAME_RE.test(username)) throw badRequest('Username must be 3–14 characters: letters, numbers or _', { field: 'username' });
  if (!EMAIL_RE.test(email) || email.length > 120) throw badRequest('Enter a valid email address', { field: 'email' });
  if (password.length < 8 || password.length > 200) throw badRequest('Password must be at least 8 characters', { field: 'password' });
  const d = store.data;
  if (d.usernames[username.toLowerCase()]) throw badRequest('That username is taken', { field: 'username' });
  if (d.emails[email.toLowerCase()]) throw badRequest('That email is already registered', { field: 'email' });
  const id = store.nextId('user');
  const { salt, hash } = hashPassword(password);
  const user = {
    id,
    username,
    email,
    salt,
    passHash: hash,
    createdAt: Date.now(),
    balances: emptyBalances(),
    vault: emptyBalances(),
    currency: 'USD',
    settings: { hideZero: false, displayFiat: false, privateMode: false, sound: true, animations: true, maxBetWarning: true },
    stats: { bets: 0, wins: 0, losses: 0, wageredUsd: 0, profitUsd: 0, byGame: {}, byCurrency: {} },
    rakeback: emptyBalances(),
    dailyBonusAt: 0,
    seeds: initialSeeds(),
    seedHistory: [],
    active: {},
    cards: [],
    addresses: {},
  };
  d.users[id] = user;
  d.usernames[username.toLowerCase()] = id;
  d.emails[email.toLowerCase()] = id;
  store.save();
  return user;
}

export function findByLogin(store, login) {
  const l = String(login || '').trim().toLowerCase();
  const id = store.data.usernames[l] ?? store.data.emails[l];
  return id != null ? store.data.users[id] : null;
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
    email: user.email,
    createdAt: user.createdAt,
    balances: user.balances,
    vault: user.vault,
    currency: user.currency,
    settings: user.settings,
    vip: vipInfo(user.stats.wageredUsd),
    stats: { bets: user.stats.bets, wins: user.stats.wins, losses: user.stats.losses, wageredUsd: user.stats.wageredUsd, profitUsd: user.stats.profitUsd },
    rakeback: user.rakeback,
    dailyBonusAt: user.dailyBonusAt,
    seeds: publicSeeds(user),
    activeGames: Object.keys(user.active || {}),
    cards: (user.cards || []).map(({ id, brand, last4, expMonth, expYear, name }) => ({ id, brand, last4, expMonth, expYear, name })),
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
  user.balances[currency] = roundDown(currency, user.balances[currency] + amount);
  return user.balances[currency];
}

export function debit(user, currency, amount) {
  if (amount > user.balances[currency] + 1e-12) throw new HttpError(400, 'Insufficient balance', { code: 'insufficient_balance' });
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
  user.rakeback[currency] = (user.rakeback[currency] || 0) + amount * (edge ?? 0.01) * RAKEBACK_SHARE;
}
