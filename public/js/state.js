import { api } from './api.js';
import { CURRENCIES } from './shared/currencies.js';

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

export function setUser(user) {
  state.user = user;
  bus.emit('user', user);
  bus.emit('balance', { currency: user?.currency, amount: user ? user.balances[user.currency] : 0 });
}

export function setBalance(code, amount, { reason } = {}) {
  if (!state.user) return;
  const prev = state.user.balances[code];
  state.user.balances[code] = amount;
  bus.emit('balance', { currency: code, amount, prev, reason });
}

export async function refreshUser() {
  const { user } = await api.get('/api/me');
  setUser(user);
  return user;
}

export async function setCurrency(code) {
  if (!CURRENCIES[code]) return;
  if (!state.user) return;
  state.user.currency = code;
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
