import { api, setRecovery } from './api.js';
import { state, bus, ensureSession, refreshUser } from './state.js';
import { route, startRouter, setQuery } from './router.js';
import { connectLive } from './live.js';
import { renderShell } from './ui/layout.js';
import { closeModal, currentModal } from './ui/modal.js';
import { initTooltips } from './ui/tooltip.js';
import * as misc from './pages/misc.js';
import { initRegistry } from './games/registry.js';
import { initI18n } from './i18n.js';
import './ui/onboarding.js';

const lazy = (path, name = 'default') => async (page, params) => (await import(path))[name](page, params);

route('/', lazy('./pages/home.js'));
route('/casino', lazy('./pages/home.js'));
route('/casino/games/:slug', lazy('./pages/game.js'));
route('/casino/group/:group', lazy('./pages/home.js', 'groupPage'));
route('/vip', lazy('./pages/vip.js'));
route('/challenges', lazy('./pages/challenges.js'));
route('/transactions', lazy('./pages/transactions.js'));
route('/transactions/:tab', lazy('./pages/transactions.js'));
route('/explorer/:network/tx/:hash', lazy('./pages/explorer.js'));
route('/settings', lazy('./pages/settings.js'));
route('/settings/:tab', lazy('./pages/settings.js'));
route('/provably-fair', lazy('./pages/fair.js'));
route('/provably-fair/:tab', lazy('./pages/fair.js'));
route('/sports', lazy('./pages/sports.js'));
route('/sports/match/:id', lazy('./pages/sports.js'));
route('/sports/:sport', lazy('./pages/sports.js'));
route('/affiliate', lazy('./pages/affiliate.js'));
route('/affiliate/:tab', lazy('./pages/affiliate.js'));
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
  const key = q.modal ? `${q.modal}${q.modal === 'bet' || q.modal === 'tx' ? `:${q.id}` : ''}` : null;
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
    case 'wallet':
      done((await import('./ui/wallet.js')).openWalletModal(q.tab || 'deposit'));
      break;
    case 'fairness':
      done((await import('./ui/fairness.js')).openFairnessModal({ tab: q.tab }));
      break;
    case 'bet':
      done(await (await import('./ui/betmodal.js')).openBetModal(q.id));
      break;
    case 'help':
      done((await import('./ui/help.js')).openHelpModal({ q: q.q }));
      break;
    case 'wallet-settings':
      done((await import('./ui/walletsettings.js')).openWalletSettingsModal());
      break;
    case 'tx':
      done(await (await import('./ui/txmodal.js')).openTxModal(q.id));
      break;
    case 'stats':
      done(await (await import('./ui/stats.js')).openStatsModal());
      break;
    case 'hotkeys': {
      const m = location.pathname.match(/^\/casino\/games\/([a-z0-9-]+)/);
      done((await import('./ui/hotkeys.js')).openHotkeysModal(m ? m[1] : null));
      break;
    }
    default:
      setQuery({ modal: null }, { replace: true });
  }
}

// Referral links (/?c=CODE): remember the campaign, then tidy the URL.
const REF_KEY = 'fakesino:ref';
function captureReferral() {
  const url = new URL(location.href);
  const code = url.searchParams.get('c');
  if (!code) return;
  try {
    localStorage.setItem(REF_KEY, code);
  } catch {
    /* storage blocked: the referral is simply not recorded */
  }
  url.searchParams.delete('c');
  history.replaceState({}, '', url.pathname + url.search + url.hash);
}
async function attachReferral() {
  let code = null;
  try {
    code = localStorage.getItem(REF_KEY);
  } catch {
    return;
  }
  if (!code || !state.user) return;
  try {
    await api.post('/api/affiliate/attach', { code });
  } catch {
    /* already referred, unknown code or an older wallet */
  }
  try {
    localStorage.removeItem(REF_KEY);
  } catch {
    /* ignore */
  }
}

async function boot() {
  captureReferral();
  // No sign-in: every browser gets its own play-money wallet automatically.
  // If the server ever forgets it, requests rebuild it from the local copy.
  setRecovery(() => ensureSession());
  const [config] = await Promise.all([api.get('/api/config'), ensureSession()]);
  attachReferral();
  state.config = config;
  initRegistry(config.games);
  await initI18n();
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
  // Keep stats (VIP progress, totals) fresh when navigating.
  bus.on('route', () => state.user && refreshUser().catch(() => {}));

  // Challenge wins can land on any page.
  bus.on('live:challenges:won', async (c) => {
    const { toast } = await import('./ui/toast.js');
    const { bySlug } = await import('./games/registry.js');
    toast({ type: 'success', title: `${bySlug[c.game]?.name || c.game} challenge completed`, message: `You won the $${c.prizeUsd} play-money prize!` });
  });

  connectLive();
  startRouter();
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('app').innerHTML = `<div class="boot"><div style="text-align:center"><div class="boot-logo">FAKESINO</div><p class="muted">Could not reach the server. Retrying…</p></div></div>`;
  setTimeout(() => location.reload(), 3000);
});

