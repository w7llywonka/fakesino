import { api } from './api.js';
import { state, bus, setUser, refreshUser } from './state.js';
import { route, startRouter, setQuery } from './router.js';
import { connectLive } from './live.js';
import { renderShell } from './ui/layout.js';
import { closeModal, currentModal } from './ui/modal.js';
import { initTooltips } from './ui/tooltip.js';
import { toast } from './ui/toast.js';
import * as misc from './pages/misc.js';

const lazy = (path, name = 'default') => async (page, params) => (await import(path))[name](page, params);

route('/', lazy('./pages/home.js'));
route('/casino', lazy('./pages/home.js'));
route('/casino/games/:slug', lazy('./pages/game.js'));
route('/casino/group/:group', lazy('./pages/home.js', 'groupPage'));
route('/vip', lazy('./pages/vip.js'));
route('/transactions', lazy('./pages/transactions.js'));
route('/transactions/:tab', lazy('./pages/transactions.js'));
route('/settings', lazy('./pages/settings.js'));
route('/settings/:tab', lazy('./pages/settings.js'));
route('/provably-fair', lazy('./pages/fair.js'));
route('/promotions', misc.promotionsPage);
route('/leaderboard', misc.leaderboardPage);
route('/responsible-gaming', misc.responsiblePage);
route('/terms', misc.termsPage);

let pageEl = null;
let cleanup = null;
let renderToken = 0;
let currentMatch = null;

async function renderPage(match) {
  currentMatch = match;
  const token = ++renderToken;
  if (cleanup) {
    try {
      cleanup();
    } catch (err) {
      console.error(err);
    }
    cleanup = null;
  }
  pageEl.innerHTML = '';
  window.scrollTo(0, 0);
  try {
    const result = match ? await match.load(pageEl, match.params) : misc.notFound(pageEl);
    if (token !== renderToken) {
      if (typeof result === 'function') result();
      return;
    }
    cleanup = typeof result === 'function' ? result : null;
  } catch (err) {
    console.error(err);
    if (token === renderToken) pageEl.innerHTML = `<div class="empty">Something went wrong loading this page.</div>`;
  }
}

// ---- Modals driven by ?modal= ----
let openKey = null;
async function syncModal(q) {
  const key = q.modal ? `${q.modal}${q.modal === 'bet' ? `:${q.id}` : ''}` : null;
  if (key === openKey && (key === null || currentModal())) return;
  openKey = key;
  if (!key) {
    if (currentModal()) closeModal({ silent: true });
    return;
  }
  const done = (m) => {
    if (!m) return;
    const prev = m.onClose;
    m.onClose = () => {
      openKey = null;
      prev?.();
    };
  };
  switch (q.modal) {
    case 'auth':
      if (state.user) return setQuery({ modal: null, tab: null }, { replace: true });
      done((await import('./ui/auth.js')).openAuthModal(q.tab || 'register'));
      break;
    case 'wallet':
      if (!state.user) return setQuery({ modal: 'auth', tab: 'register' }, { replace: true });
      done((await import('./ui/wallet.js')).openWalletModal(q.tab || 'deposit'));
      break;
    case 'fairness':
      done((await import('./ui/fairness.js')).openFairnessModal({ tab: q.tab }));
      break;
    case 'bet':
      done(await (await import('./ui/betmodal.js')).openBetModal(q.id));
      break;
    case 'stats':
      done(await (await import('./ui/stats.js')).openStatsModal());
      break;
    default:
      setQuery({ modal: null }, { replace: true });
  }
}

async function boot() {
  const [config, me] = await Promise.all([api.get('/api/config'), api.get('/api/me')]);
  state.config = config;
  state.user = me.user;
  const { page } = renderShell(document.getElementById('app'));
  pageEl = page;
  initTooltips();

  bus.on('route', ({ match }) => renderPage(match));
  bus.on('query', (q) => syncModal(q).catch((err) => console.error(err)));

  let lastUserId = state.user?.id ?? null;
  bus.on('user', (user) => {
    const id = user?.id ?? null;
    if (id === lastUserId) return;
    lastUserId = id;
    connectLive();
    // Re-render pages whose content depends on the account (game pages keep their state).
    if (currentMatch && !currentMatch.pattern.startsWith('/casino/games')) renderPage(currentMatch);
  });
  bus.on('logout', () => {
    setUser(null);
    toast({ title: 'Signed out', message: 'See you soon.' });
  });
  window.addEventListener('auth-required', () => setQuery({ modal: 'auth', tab: 'login' }));

  // Keep stats (VIP progress, totals) fresh when navigating.
  bus.on('route', () => state.user && refreshUser().catch(() => {}));

  connectLive();
  startRouter();
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('app').innerHTML = `<div class="boot"><div style="text-align:center"><div class="boot-logo">FAKESINO</div><p class="muted">Could not reach the server. Retrying…</p></div></div>`;
  setTimeout(() => location.reload(), 3000);
});

export { setUser };
