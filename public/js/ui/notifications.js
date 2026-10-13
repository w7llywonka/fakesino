import { el, esc, on } from '../dom.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { state, bus } from '../state.js';
import { navigate } from '../router.js';
import * as fmt from '../format.js';

const KIND_ICON = { deposit: 'wallet', withdrawal: 'arrowUp', vault: 'vault', vip: 'crown', challenge: 'trophy', bonus: 'gift', tip: 'coins', rain: 'coins', swap: 'swap', affiliate: 'users', mention: 'chat', limit: 'shield', race: 'trophy', security: 'lock' };
const FILTERS = [
  ['all', 'All'],
  ['wallet', 'Wallet'],
  ['rewards', 'Rewards'],
  ['social', 'Social'],
];

const store = { list: [], unread: 0, loaded: false };

function setUnread(n) {
  store.unread = n;
  bus.emit('notifications', store);
}

export async function loadNotifications() {
  if (!state.user) return;
  try {
    const r = await api.get('/api/notifications');
    store.list = r.notifications;
    store.loaded = true;
    setUnread(r.unread);
  } catch {
    /* try again on the next open */
  }
}

bus.on('live:notification', (n) => {
  store.list.unshift(n);
  if (store.list.length > 50) store.list.length = 50;
  setUnread(store.unread + 1);
});
bus.on('user', () => {
  store.list = [];
  store.loaded = false;
  setUnread(0);
  loadNotifications();
});

// Bell button with an unread badge; opens the panel.
export function bellButton() {
  const wrap = el(`<div class="nt-wrap"><button class="icon-btn nt-bell" aria-label="Notifications" data-tip="Notifications">${icon('bell', 20)}<span class="nt-badge" hidden></span></button></div>`);
  const badge = wrap.querySelector('.nt-badge');
  const render = () => {
    badge.hidden = !store.unread;
    badge.textContent = store.unread > 9 ? '9+' : store.unread;
  };
  render();
  const off = bus.on('notifications', render);
  wrap.querySelector('button').addEventListener('click', (e) => {
    e.stopPropagation();
    const open = wrap.querySelector('.nt-panel');
    if (open) return open.remove();
    document.querySelectorAll('.dropdown').forEach((d) => d.remove());
    openPanel(wrap);
  });
  if (!store.loaded) loadNotifications();
  wrap._off = off;
  return wrap;
}

function openPanel(wrap) {
  let filter = 'all';
  const panel = el(`<div class="dropdown right nt-panel" role="dialog" aria-label="Notifications">
    <div class="nt-head"><b>Notifications</b><button class="link nt-readall">Mark all as read</button><button class="icon-btn nt-close" aria-label="Close">${icon('close', 18)}</button></div>
    <div class="nt-filters">${FILTERS.map(([k, l]) => `<button data-f="${k}" class="${k === filter ? 'active' : ''}">${l}</button>`).join('')}</div>
    <div class="nt-list"></div></div>`);
  wrap.appendChild(panel);
  const listEl = panel.querySelector('.nt-list');
  const render = () => {
    const items = store.list.filter((n) => filter === 'all' || n.category === filter);
    listEl.innerHTML = items.length
      ? items
          .map(
            (n) => `<button class="nt-item ${n.read ? '' : 'unread'}" data-id="${n.id}" data-link="${esc(n.link || '')}"><span class="nt-ic">${icon(KIND_ICON[n.kind] || 'bell', 16)}</span>
            <span class="nt-text"><span class="nt-title">${esc(n.title)}</span><span class="nt-msg">${esc(n.message)}</span><span class="nt-time">${esc(fmt.relative(n.createdAt))}</span></span></button>`,
          )
          .join('')
      : `<div class="empty" style="padding:28px 12px">${icon('bell', 26)}<div>No notifications</div></div>`;
  };
  render();
  const off = bus.on('notifications', render);
  const close = () => {
    off();
    panel.remove();
  };
  new MutationObserver((m, obs) => {
    if (!panel.isConnected) {
      off();
      obs.disconnect();
    }
  }).observe(wrap, { childList: true });
  on(panel, 'click', '[data-f]', (e, b) => {
    filter = b.dataset.f;
    panel.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('active', x === b));
    render();
  });
  panel.querySelector('.nt-close').addEventListener('click', close);
  panel.querySelector('.nt-readall').addEventListener('click', async () => {
    store.list.forEach((n) => (n.read = true));
    setUnread(0);
    api.post('/api/notifications/read', { all: true }).catch(() => {});
  });
  on(panel, 'click', '.nt-item', (e, b) => {
    const n = store.list.find((x) => String(x.id) === b.dataset.id);
    if (n && !n.read) {
      n.read = true;
      setUnread(Math.max(0, store.unread - 1));
      api.post('/api/notifications/read', { ids: [n.id] }).catch(() => {});
    }
    if (b.dataset.link) {
      close();
      navigate(b.dataset.link);
    }
  });
}
