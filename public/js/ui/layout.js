import { el, esc, on, $ } from '../dom.js';
import { icon, coin } from '../icons.js';
import { bellButton } from './notifications.js';
import { openSearch } from './search.js';
import { state, bus, currency, balanceOf, setCurrency, savePrefs } from '../state.js';
import { CURRENCIES, CURRENCY_CODES } from '../shared/currencies.js';
import { GAMES, CATEGORIES } from '../games/registry.js';
import * as fmt from '../format.js';
import { setQuery } from '../router.js';
import { createChat } from './chat.js';
import { slip, createSlipPanel } from './betslip.js';
import { LANGUAGES, currentLanguage, setLanguage } from '../i18n.js';
import { SPORTS, LEAGUES } from '../shared/sports.js';

export function renderShell(app) {
  app.innerHTML = '';
  const shell = el(`<div class="shell ${state.prefs.sidebarCollapsed ? 'sidebar-collapsed' : ''}">
    <aside class="sidebar">
      <div class="sidebar-top">
        <button class="icon-btn" data-act="collapse" aria-label="Toggle menu">${icon('menu', 20)}</button>
        <div class="sidebar-tabs"><a href="/casino" class="sidebar-tab" data-section="casino">Casino</a><a href="/sports" class="sidebar-tab" data-section="sports">Sports</a></div>
      </div>
      <nav class="sidebar-scroll" data-section="casino">${sidebarNav()}</nav>
      <div class="sidebar-foot">Play money only. Nothing here can be cashed out.</div>
    </aside>
    <div class="scrim"></div>
    <div class="main">
      <header class="header"><div class="header-inner">
        <button class="icon-btn show-mobile" data-act="mobile-menu" aria-label="Menu">${icon('menu', 20)}</button>
        <a href="/" class="logo"><img class="logo-mark" src="/img/favicon.svg" alt=""><span>FAKE<b>SINO</b></span></a>
        <div class="header-center"></div>
        <div class="header-right"></div>
      </div></header>
      <div class="play-money-banner"><b>Play money casino.</b> Every balance here is fake — deposits use demo cards, nothing is ever charged or paid out.</div>
      <main class="content" id="page"></main>
      ${footer()}
    </div>
    <div class="chat-slot"></div>
    <nav class="mobile-nav">
      <button data-act="mobile-menu">${icon('menu', 20)}<span>Browse</span></button>
      <a href="/casino" data-nav="casino">${icon('casino', 20)}<span>Casino</span></a>
      <a href="/transactions/bets" data-nav="bets">${icon('list', 20)}<span>Bets</span></a>
      <a href="/sports" data-nav="sports">${icon('sports', 20)}<span>Sports</span></a>
      <button data-act="chat">${icon('chat', 20)}<span>Chat</span></button>
    </nav>
    <button class="to-top" data-act="to-top" aria-label="Back to top" data-tip="Back to top">${icon('arrowUp', 18)}</button>
  </div>`);
  app.appendChild(shell);

  on(shell, 'change', '[data-lang]', (e, sel) => setLanguage(sel.value));
  on(shell, 'click', '[data-act=collapse]', () => {
    if (window.innerWidth <= 900) return shell.classList.remove('mobile-menu');
    const collapsed = !shell.classList.contains('sidebar-collapsed');
    shell.classList.toggle('sidebar-collapsed', collapsed);
    savePrefs({ sidebarCollapsed: collapsed });
  });
  on(shell, 'click', '[data-act=mobile-menu]', () => shell.classList.toggle('mobile-menu'));
  on(shell, 'click', '.scrim', () => shell.classList.remove('mobile-menu'));
  on(shell, 'click', '.sidebar a', () => shell.classList.remove('mobile-menu'));
  on(shell, 'click', '[data-act=chat]', () => toggleChat());
  on(shell, 'click', '[data-act=mobile-search]', () => {
    shell.classList.remove('mobile-menu');
    openSearch();
  });
  on(shell, 'click', '.nav-group > .nav-item[data-toggle]', (e, b) => b.parentElement.classList.toggle('open'));
  on(shell, 'click', '[data-modal]', (e, b) => {
    e.preventDefault();
    setQuery({ modal: b.dataset.modal, tab: b.dataset.tab || null });
  });

  // The right-hand drawer holds either chat or the sports bet slip.
  const chatSlot = shell.querySelector('.chat-slot');
  let chat = null;
  let slipPanel = null;
  function toggleChat(force) {
    const open = force ?? !chat;
    if (open && slipPanel) toggleSlip(false);
    if (open && !chat) chat = createChat(chatSlot, () => toggleChat(false));
    if (!open && chat) {
      chat.destroy();
      chat = null;
    }
    savePrefs({ chatOpen: !!chat });
    shell.querySelectorAll('[data-act=chat]').forEach((b) => b.classList.toggle('active', !!chat));
    shell.classList.toggle('drawer-open', !!(chat || slipPanel));
  }
  function toggleSlip(force) {
    const open = force ?? !slipPanel;
    if (open && chat) toggleChat(false);
    if (open && !slipPanel) slipPanel = createSlipPanel(chatSlot, () => toggleSlip(false));
    if (!open && slipPanel) {
      slipPanel.destroy();
      slipPanel = null;
    }
    shell.querySelectorAll('[data-act=slip]').forEach((b) => b.classList.toggle('active', !!slipPanel));
    shell.classList.toggle('drawer-open', !!(chat || slipPanel));
  }
  on(shell, 'click', '[data-act=slip]', () => toggleSlip());
  bus.on('slip:open', () => toggleSlip(true));
  const syncSlipBadge = () =>
    shell.querySelectorAll('.slip-badge').forEach((b) => {
      b.textContent = slip.selections.length;
      b.hidden = !slip.selections.length;
    });
  bus.on('slip', syncSlipBadge);
  if (state.prefs.chatOpen && window.innerWidth > 1100) toggleChat(true);

  renderHeader(shell);
  bus.on('user', () => {
    renderHeader(shell);
    syncSlipBadge();
  });
  bus.on('route', ({ path }) => highlightNav(shell, path));
  highlightNav(shell, location.pathname);
  syncSlipBadge();

  // Back to top, once a long page has been scrolled.
  const toTop = shell.querySelector('.to-top');
  let topTick = false;
  window.addEventListener(
    'scroll',
    () => {
      if (topTick) return;
      topTick = true;
      requestAnimationFrame(() => {
        topTick = false;
        toTop.classList.toggle('show', window.scrollY > 900);
      });
    },
    { passive: true },
  );
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));

  // Keyboard: "/" searches games, "?" opens the Help Center.
  document.addEventListener('keydown', (e) => {
    if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]') || document.querySelector('.modal-backdrop:not(.closing)')) return;
    e.preventDefault();
    setQuery({ modal: 'help' });
  });
  initTabFades(shell);
  return { shell, page: shell.querySelector('#page'), toggleChat };
}

// Tab rows that scroll sideways fade at the edge that has more tabs.
const FADE_ROWS = '.tabs, .help-chips';
function initTabFades(root) {
  const sync = (t) => {
    const max = t.scrollWidth - t.clientWidth;
    t.classList.toggle('fade-l', max > 2 && t.scrollLeft > 2);
    t.classList.toggle('fade-r', max > 2 && t.scrollLeft < max - 2);
  };
  const ro = new ResizeObserver((entries) => entries.forEach((en) => sync(en.target)));
  const seen = new WeakSet();
  const scan = (node) => {
    const list = node.matches?.(FADE_ROWS) ? [node] : [...(node.querySelectorAll?.(FADE_ROWS) || [])];
    for (const t of list) {
      if (seen.has(t)) continue;
      seen.add(t);
      ro.observe(t);
      // The active tab is brought into view when a row first appears.
      requestAnimationFrame(() => {
        const a = t.querySelector('.active');
        if (a && t.scrollWidth > t.clientWidth) t.scrollLeft = Math.max(0, a.offsetLeft - (t.clientWidth - a.offsetWidth) / 2);
        sync(t);
      });
    }
  };
  document.addEventListener('scroll', (e) => e.target.matches?.(FADE_ROWS) && sync(e.target), true);
  new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach(scan))).observe(document.body, { childList: true, subtree: true });
  scan(document.body);
}

function sidebarNav() {
  const gameLinks = (cat) =>
    GAMES.filter((g) => g.category === cat)
      .map((g) => `<a class="nav-item" href="/casino/games/${g.slug}">${icon(g.slug, 18)}<span>${esc(g.name)}</span></a>`)
      .join('');
  return `
    <div class="nav-group">
      <a class="nav-item" href="/casino">${icon('home', 18)}<span>Lobby</span></a>
      <a class="nav-item" href="/casino/group/favourites">${icon('star', 18)}<span>Favourites</span></a>
      <a class="nav-item" href="/casino/group/recent">${icon('clock', 18)}<span>Recent</span></a>
      <a class="nav-item" href="/transactions/bets">${icon('list', 18)}<span>My Bets</span></a>
    </div>
    ${CATEGORIES.map(
      (c, i) => `<div class="nav-group ${i === 0 ? 'open' : ''}">
        <button class="nav-item" data-toggle>${icon(c.icon, 18)}<span>${esc(c.name)}</span><span class="chev">${icon('down', 16)}</span></button>
        <div class="nav-sub">${gameLinks(c.key)}</div></div>`,
    ).join('')}
    ${siteNav()}`;
}

function siteNav() {
  return `
    <div class="nav-group">
      <a class="nav-item" href="/promotions">${icon('gift', 18)}<span>Promotions</span></a>
      <a class="nav-item" href="/challenges">${icon('trophy', 18)}<span>Challenges</span></a>
      <a class="nav-item" href="/vip">${icon('crown', 18)}<span>VIP Club</span></a>
      <a class="nav-item" href="/leaderboard">${icon('trophy', 18)}<span>Leaderboard</span></a>
      <a class="nav-item" href="/affiliate">${icon('users', 18)}<span>Affiliate</span></a>
    </div>
    <div class="nav-group">
      <a class="nav-item" href="/provably-fair">${icon('shield', 18)}<span>Provably Fair</span></a>
      <a class="nav-item" href="/responsible-gaming">${icon('support', 18)}<span>Responsible Gaming</span></a>
      <button class="nav-item" data-act="chat">${icon('chat', 18)}<span>Live Chat</span></button>
      <a class="nav-item" href="?modal=help">${icon('help', 18)}<span>Help Center</span></a>
    </div>`;
}

function sportsNav() {
  return `
    <div class="nav-group">
      <a class="nav-item" href="/sports">${icon('home', 18)}<span>Sports Lobby</span></a>
      <a class="nav-item" href="/sports/my-bets">${icon('ticket', 18)}<span>My Bets</span></a>
      <button class="nav-item" data-act="slip">${icon('list', 18)}<span>Bet Slip</span><span class="slip-badge pill" hidden></span></button>
    </div>
    <div class="nav-group open">
      <button class="nav-item" data-toggle>${icon('sports', 18)}<span>Top Sports</span><span class="chev">${icon('down', 16)}</span></button>
      <div class="nav-sub">${Object.entries(SPORTS)
        .map(([k, sp]) => `<a class="nav-item" href="/sports/${k}">${icon(k, 18)}<span>${esc(sp.name)}</span></a>`)
        .join('')}</div></div>
    <div class="nav-group">
      <button class="nav-item" data-toggle>${icon('trophy', 18)}<span>Leagues</span><span class="chev">${icon('down', 16)}</span></button>
      <div class="nav-sub">${LEAGUES.map((l) => `<a class="nav-item" href="/sports/${l.sport}">${icon(l.sport, 18)}<span>${esc(l.name)}</span></a>`).join('')}</div></div>
    ${siteNav()}`;
}

function highlightNav(shell, path) {
  const section = path.startsWith('/sports') ? 'sports' : 'casino';
  const nav = shell.querySelector('.sidebar-scroll');
  if (nav.dataset.section !== section) {
    nav.dataset.section = section;
    nav.innerHTML = section === 'sports' ? sportsNav() : sidebarNav();
  }
  shell.querySelectorAll('.sidebar-tab').forEach((t) => t.classList.toggle('active', t.dataset.section === section));
  shell.classList.toggle('in-sports', section === 'sports');
  shell.querySelectorAll('.sidebar a.nav-item').forEach((a) => {
    const href = a.getAttribute('href');
    a.classList.toggle('active', href === path || (href !== '/casino' && path.startsWith(href + '/')));
  });
  const tab = path === '/transactions/bets' ? 'bets' : section === 'sports' ? 'sports' : path === '/' || path.startsWith('/casino') ? 'casino' : null;
  shell.querySelectorAll('.mobile-nav [data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === tab));
}

function footer() {
  const games = GAMES.slice(0, 6)
    .map((g) => `<a href="/casino/games/${g.slug}">${esc(g.name)}</a>`)
    .join('');
  return `<footer class="footer"><div class="footer-inner">
    <div><h4>Casino</h4>${games}</div>
    <div><h4>Platform</h4><a href="/provably-fair">Provably Fair</a><a href="/vip">VIP Club</a><a href="/promotions">Promotions</a><a href="/leaderboard">Leaderboard</a><a href="/affiliate">Affiliate</a></div>
    <div><h4>Account</h4><a href="?modal=wallet&tab=deposit">Deposit</a><a href="?modal=wallet&tab=withdraw">Withdraw</a><a href="/transactions/deposits">Transactions</a><a href="/settings/general">Settings</a></div>
    <div><h4>About</h4><a href="?modal=help">Help Center</a><a href="/responsible-gaming">Responsible Gaming</a><a href="/terms">Terms of Service</a><p style="margin:8px 0 0">Fakesino is a simulation. All balances are play money with no cash value. No real payments are ever processed.</p></div>
  </div>
  <div class="footer-bottom"><div class="logo" style="font-size:18px"><span>FAKE<b>SINO</b></span></div>
    <label class="lang-pick no-i18n">${icon('globe', 16)}<select class="select" data-lang aria-label="Language">${LANGUAGES.map(([k, n]) => `<option value="${k}" ${k === currentLanguage() ? 'selected' : ''}>${n}</option>`).join('')}</select></label><div>© ${new Date().getFullYear()} Fakesino · Play money only</div><div class="badge-18">18+</div></div>
  </footer>`;
}

// ---- Header (auth-dependent) ----

let docClick = null;

function renderHeader(shell) {
  const center = shell.querySelector('.header-center');
  const right = shell.querySelector('.header-right');
  if (docClick) document.removeEventListener('click', docClick);
  if (!state.user) {
    // Only while the wallet session is (re)connecting.
    center.innerHTML = '';
    right.innerHTML = `<button class="icon-btn hide-mobile" data-act="chat" aria-label="Chat">${icon('chat', 20)}</button>`;
    return;
  }
  center.innerHTML = `<div class="wallet-pill">
      <button class="balance-btn" data-act="currency"><span class="bal"><span class="bal-amount"></span><span class="bal-coin"></span></span>${icon('down', 14)}</button>
      <button class="wallet-btn" data-modal="wallet" data-tab="deposit"><span class="show-mobile">${icon('wallet', 18)}</span><span class="label">Wallet</span></button>
    </div>`;
  right.innerHTML = `
    <button class="icon-btn hide-mobile" data-act="search" aria-label="Search" data-tip="Search">${icon('search', 20)}</button>
    <a class="icon-btn hide-mobile" href="?modal=help" aria-label="Help Center" data-tip="Help Center">${icon('help', 20)}</a>
    <span class="nt-slot"></span>
    <button class="icon-btn slip-btn" data-act="slip" aria-label="Bet slip" data-tip="Bet slip">${icon('ticket', 20)}<span class="slip-badge" hidden></span></button>
    <div style="position:relative">
      <button class="icon-btn" data-act="user" aria-label="Account" data-tip="Account">${icon('user', 20)}</button>
    </div>
    <button class="icon-btn hide-mobile" data-act="chat" aria-label="Chat" data-tip="Chat">${icon('chat', 20)}</button>`;

  const updateBalance = (e) => {
    const code = currency();
    const amountEl = center.querySelector('.bal-amount');
    if (!amountEl) return;
    // Until the first deposit, the Wallet button pulses gently.
    const u = state.user;
    const empty = u && !u.stats?.bets && ![u.balances, u.vault].some((b) => Object.values(b || {}).some((v) => v > 0));
    const wbtn = center.querySelector('.wallet-btn');
    wbtn.classList.toggle('nudge', !!empty);
    if (!empty) delete wbtn.dataset.tip;
    else if (!wbtn.dataset.tip) wbtn.dataset.tip = 'Get free play money';
    amountEl.textContent = fmt.money(balanceOf(code), code);
    center.querySelector('.bal-coin').innerHTML = coin(code);
    if (e?.reason === 'win' || e?.reason === 'push') {
      amountEl.classList.remove('balance-flash-win');
      void amountEl.offsetWidth;
      amountEl.classList.add('balance-flash-win');
    }
  };
  updateBalance();
  if (!shell._balanceSub) {
    shell._balanceSub = bus.on('balance', (e) => {
      if (!e || e.currency === currency()) shell._updateBalance?.(e);
    });
    bus.on('currency', () => shell._updateBalance?.());
    bus.on('user-settings', () => shell._updateBalance?.());
  }
  shell._updateBalance = updateBalance;

  const pill = center.querySelector('.wallet-pill');
  pill.querySelector('[data-act=currency]').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown(pill, currencyDropdown, 'currency');
  });
  right.querySelector('.nt-slot').replaceWith(bellButton());
  const userWrap = right.querySelector('[data-act=user]').parentElement;
  userWrap.querySelector('button').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown(userWrap, userDropdown, 'user', 'right');
  });
  right.querySelector('[data-act=search]').addEventListener('click', () => openSearch());
  // Close dropdowns on outside clicks; clicks on a dropdown's own anchor
  // (its parent) are left to the anchor's toggle.
  docClick = (e) => {
    document.querySelectorAll('.dropdown').forEach((d) => {
      if (!d.contains(e.target) && !d.parentElement?.contains(e.target)) d.remove();
    });
  };
  document.addEventListener('click', docClick);
}

function closeDropdowns() {
  document.querySelectorAll('.dropdown').forEach((d) => d.remove());
}

function toggleDropdown(anchor, render, kind, align = '') {
  const existing = anchor.querySelector(`.dropdown[data-kind=${kind}]`);
  closeDropdowns();
  if (existing) return;
  const dd = render();
  dd.dataset.kind = kind;
  if (align) dd.classList.add(align);
  else {
    dd.style.left = '50%';
    dd.style.transform = 'translateX(-50%)';
  }
  anchor.appendChild(dd);
}

function currencyDropdown() {
  const hideZero = state.user.settings.hideZero;
  const dd = el(`<div class="dropdown" style="min-width:260px">
    <div class="dropdown-search"><input placeholder="Search currencies"></div>
    <div class="currency-list"></div>
    <div class="dropdown-foot"><button data-act="wallet-settings">${icon('settings', 14)} Wallet settings</button></div>
  </div>`);
  const list = dd.querySelector('.currency-list');
  const render = (q = '') => {
    list.innerHTML = CURRENCY_CODES.filter((c) => !q || c.toLowerCase().includes(q) || CURRENCIES[c].name.toLowerCase().includes(q))
      .filter((c) => !hideZero || balanceOf(c) > 0 || c === currency())
      .map(
        (c) => `<button class="dropdown-item currency-row ${c === currency() ? 'active' : ''}" data-c="${c}">
          <span>${esc(fmt.money(balanceOf(c), c))}</span><span class="code">${coin(c)} ${c}</span></button>`,
      )
      .join('');
  };
  render();
  dd.querySelector('input').addEventListener('input', (e) => render(e.target.value.trim().toLowerCase()));
  on(dd, 'click', '[data-c]', (e, b) => {
    setCurrency(b.dataset.c);
    closeDropdowns();
  });
  dd.querySelector('[data-act=wallet-settings]').addEventListener('click', () => {
    closeDropdowns();
    setQuery({ modal: 'wallet-settings' });
  });
  return dd;
}

function userDropdown() {
  const items = [
    ['wallet', 'Wallet', '?modal=wallet&tab=deposit'],
    ['vault', 'Vault', '?modal=wallet&tab=vault'],
    ['crown', 'VIP', '/vip'],
    ['stats', 'Statistics', '?modal=stats'],
    ['users', 'Affiliate', '/affiliate'],
    ['list', 'Transactions', '/transactions/deposits'],
    ['history', 'My Bets', '/transactions/bets'],
    ['settings', 'Settings', '/settings/general'],
    ['lock', 'Wallet backup', '/settings/general#backup'],
    ['shield', 'Provably Fair', '?modal=fairness'],
    ['help', 'Help Center', '?modal=help'],
  ];
  const dd = el(`<div class="dropdown"><div style="padding:8px 16px 10px;border-bottom:1px solid #e3e8ee;margin-bottom:4px">
      <div style="font-weight:800">${esc(state.user.username)}</div><div style="font-size:12px;color:#5a6b7e">${esc(state.user.vip.level)} VIP</div></div>
    ${items.map(([ic, label, href]) => `<a class="dropdown-item" href="${href}">${icon(ic, 16)} ${label}</a>`).join('')}</div>`);
  dd.addEventListener('click', (e) => {
    if (e.target.closest('a')) setTimeout(closeDropdowns, 0);
  });
  return dd;
}
