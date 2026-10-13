import { api } from './api.js';
import { CURRENCIES } from './shared/currencies.js';
import { deviceId, setDeviceId, randomKey } from './walletkey.js';

export { deviceId };

// Global app state + a tiny event bus.
const listeners = new Map();

export const bus = {
  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event)?.delete(fn);
  },
  emit(event, data) {
    for (const fn of listeners.get(event) || []) {
      try {
        fn(data);
      } catch (err) {
        console.error(`[bus:${event}]`, err);
      }
    }
  },
};

const LOCAL_KEY = 'fakesino:prefs';
function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY)) || {};
  } catch {
    return {};
  }
}

export const state = {
  user: null,
  config: null,
  prefs: { sound: true, volume: 0.5, animations: true, sidebarCollapsed: false, chatOpen: false, ...loadPrefs() },
  serverOffset: 0, // serverTime - Date.now()
};

export function savePrefs(patch) {
  Object.assign(state.prefs, patch);
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state.prefs));
  } catch {
    /* storage unavailable */
  }
  bus.emit('prefs', state.prefs);
}

export const currency = () => state.user?.currency || 'USD';
export const balanceOf = (code = currency()) => state.user?.balances?.[code] ?? 0;
export const isAuthed = () => !!state.user;

// ---- Local wallet ----------------------------------------------------------------
// No accounts: the browser keeps a random wallet key (walletkey.js) and a
// snapshot of the wallet. The server only knows a hash of the key. If the
// server ever loses the wallet (fresh database, new host), the snapshot
// rebuilds it.
const WALLET_KEY = 'fakesino:wallet';

function loadSnapshot() {
  try {
    return JSON.parse(localStorage.getItem(WALLET_KEY)) || null;
  } catch {
    return null;
  }
}

function saveSnapshot() {
  const u = state.user;
  if (!u) return;
  try {
    localStorage.setItem(
      WALLET_KEY,
      JSON.stringify({ username: u.username, balances: u.balances, vault: u.vault, currency: u.currency, settings: u.settings, wageredUsd: u.stats?.wageredUsd || 0, savedAt: Date.now() }),
    );
  } catch {
    /* storage unavailable */
  }
}

// Get (or create) this browser's wallet session.
export async function ensureSession() {
  const res = await api.post('/api/auth/guest', { deviceId: deviceId(), restore: loadSnapshot() }, { retry: false });
  setUser(res.user);
  return res;
}

// Switch this browser to another wallet using its backup key.
export async function useWalletKey(key) {
  const id = String(key || '').trim().toLowerCase();
  const res = await api.post('/api/auth/guest', { deviceId: id, mustExist: true }, { retry: false });
  setDeviceId(id);
  setUser(res.user);
  return res;
}

// Start over with a brand-new, empty wallet.
export async function newWallet() {
  const id = randomKey();
  const res = await api.post('/api/auth/guest', { deviceId: id, fresh: true }, { retry: false });
  setDeviceId(id);
  setUser(res.user);
  return res;
}

export function setUser(user) {
  state.user = user;
  saveSnapshot();
  bus.emit('user', user);
  bus.emit('balance', { currency: user?.currency, amount: user ? user.balances[user.currency] : 0 });
}

export function setBalance(code, amount, { reason } = {}) {
  if (!state.user) return;
  const prev = state.user.balances[code];
  state.user.balances[code] = amount;
  // A 'debit' is the transient balance shown while a result animates; the
  // settled balance arrives right after, so only persist real balances.
  if (reason !== 'debit') saveSnapshot();
  bus.emit('balance', { currency: code, amount, prev, reason });
}

export async function refreshUser() {
  const { user } = await api.get('/api/me');
  if (!user) return (await ensureSession()).user;
  setUser(user);
  return user;
}

export async function setCurrency(code) {
  if (!CURRENCIES[code]) return;
  if (!state.user) return;
  state.user.currency = code;
  saveSnapshot();
  bus.emit('currency', code);
  bus.emit('balance', { currency: code, amount: balanceOf(code) });
  try {
    const { user } = await api.post('/api/wallet/currency', { currency: code });
    state.user.settings = user.settings;
  } catch {
    /* non-fatal */
  }
}

export function serverNow() {
  return Date.now() + state.serverOffset;
}
