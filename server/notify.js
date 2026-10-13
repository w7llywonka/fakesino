import { CURRENCIES } from '../public/js/shared/currencies.js';

const KEEP = 50;

// Per-wallet notification history (header bell), pushed live over SSE.
// category: wallet | rewards | social.
export function createNotifier({ store, live }) {
  const all = () => (store.data.notifications ||= {});

  function notify(userId, { kind, category = 'wallet', title, message = '', link = null }) {
    const list = (all()[userId] ||= []);
    const n = { id: store.nextId('note'), kind, category, title, message, link, createdAt: Date.now(), read: false };
    list.unshift(n);
    if (list.length > KEEP) list.length = KEEP;
    store.save();
    live.toUser(userId, 'notification', n);
    return n;
  }

  function list(userId) {
    const items = all()[userId] || [];
    return { notifications: items, unread: items.filter((n) => !n.read).length };
  }

  function markRead(userId, ids) {
    const items = all()[userId] || [];
    const set = ids === 'all' ? null : new Set((ids || []).map(Number));
    for (const n of items) if (!set || set.has(n.id)) n.read = true;
    store.save();
    return list(userId);
  }

  return { notify, list, markRead };
}

export const amountText = (amount, currency) => `${Number(amount).toLocaleString('en-US', { maximumFractionDigits: CURRENCIES[currency]?.decimals ?? 8 })} ${currency}`;
