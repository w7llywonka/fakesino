import { el, esc, on, $ } from '../dom.js';
import { icon, coin } from '../icons.js';
import { state, bus, currency, balanceOf, setCurrency, savePrefs } from '../state.js';
import { CURRENCIES, CURRENCY_CODES } from '../shared/currencies.js';
import { GAMES, CATEGORIES } from '../games/registry.js';
import * as fmt from '../format.js';
import { setQuery, navigate } from '../router.js';
import { api } from '../api.js';
import { createChat } from './chat.js';

export function renderShell(app) {
  app.innerHTML = '';
  const shell = el(`<div class="shell ${state.prefs.sidebarCollapsed ? 'sidebar-collapsed' : ''}">
    <aside class="sidebar">
      <div class="sidebar-top">
        <button class="icon-btn" data-act="collapse" aria-label="Toggle menu">${icon('menu', 20)}</button>
        <div class="sidebar-tabs"><a href="/casino" class="sidebar-tab active">Casino</a><a href="/promotions" class="sidebar-tab">Promos</a></div>
      </div>
      <nav class="sidebar-scroll">${sidebarNav()}</nav>
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
      <a href="/casino">${icon('casino', 20)}<span>Casino</span></a>
      <a href="/transactions/bets">${icon('list', 20)}<span>Bets</span></a>
      <button data-act="chat">${icon('chat', 20)}<span>Chat</span></button>
    </nav>
  </div>`);
  app.appendChild(shell);

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
  on(shell, 'click', '.nav-group > .nav-item[data-toggle]', (e, b) => b.parentElement.classList.toggle('open'));
  on(shell, 'click', '[data-modal]', (e, b) => {
    e.preventDefault();
    setQuery({ modal: b.dataset.modal, tab: b.dataset.tab || null });
  });

  const chatSlot = shell.querySelector('.chat-slot');
  let chat = null;
  function toggleChat(force) {
    const open = force ?? !chat;
    if (open && !chat) chat = createChat(chatSlot, () => toggleChat(false));
    if (!open && chat) {
      chat.destroy();
      chat = null;
    }
    savePrefs({ chatOpen: !!chat });
    shell.querySelectorAll('[data-act=chat]').forEach((b) => b.classList.toggle('active', !!chat));
  }
  if (state.prefs.chatOpen && window.innerWidth > 1100) toggleChat(true);

  renderHeader(shell);
  bus.on('user', () => renderHeader(shell));
  bus.on('route', ({ path }) => highlightNav(shell, path));
  highlightNav(shell, location.pathname);
  return { shell, page: shell.querySelector('#page'), toggleChat };
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
    <div class="nav-group">
      <a class="nav-item" href="/promotions">${icon('gift', 18)}<span>Promotions</span></a>
      <a class="nav-item" href="/vip">${icon('crown', 18)}<span>VIP Club</span></a>
      <a class="nav-item" href="/leaderboard">${icon('trophy', 18)}<span>Leaderboard</span></a>
    </div>
    <div class="nav-group">
      <a class="nav-item" href="/provably-fair">${icon('shield', 18)}<span>Provably Fair</span></a>
      <a class="nav-item" href="/responsible-gaming">${icon('support', 18)}<span>Responsible Gaming</span></a>
      <button class="nav-item" data-act="chat">${icon('chat', 18)}<span>Live Chat</span></button>
    </div>`;
}

function highlightNav(shell, path) {
  shell.querySelectorAll('.sidebar a.nav-item').forEach((a) => {
    const href = a.getAttribute('href');
    a.classList.toggle('active', href === path || (href !== '/casino' && path.startsWith(href + '/')));
  });
}

function footer() {
  const games = GAMES.slice(0, 6)
    .map((g) => `<a href="/casino/games/${g.slug}">${esc(g.name)}</a>`)
    .join('');
  return `<footer class="footer"><div class="footer-inner">
    <div><h4>Casino</h4>${games}</div>
    <div><h4>Platform</h4><a href="/provably-fair">Provably Fair</a><a href="/vip">VIP Club</a><a href="/promotions">Promotions</a><a href="/leaderboard">Leaderboard</a></div>
    <div><h4>Account</h4><a href="?modal=wallet&tab=deposit">Deposit</a><a href="?modal=wallet&tab=withdraw">Withdraw</a><a href="/transactions/deposits">Transactions</a><a href="/settings/general">Settings</a></div>
    <div><h4>About</h4><a href="/responsible-gaming">Responsible Gaming</a><a href="/terms">Terms of Service</a><p style="margin:8px 0 0">Fakesino is a simulation. All balances are play money with no cash value. No real payments are ever processed.</p></div>
  </div>
  <div class="footer-bottom"><div class="logo" style="font-size:18px"><span>FAKE<b>SINO</b></span></div><div>© ${new Date().getFullYear()} Fakesino · Play money only</div><div class="badge-18">18+</div></div>
  </footer>`;
}

// ---- Header (auth-dependent) ----

let docClick = null;

function renderHeader(shell) {
  const center = shell.querySelector('.header-center');
  const right = shell.querySelector('.header-right');
  if (docClick) document.removeEventListener('click', docClick);
  if (!state.user) {
    center.innerHTML = '';
    right.innerHTML = `
      <button class="btn btn-ghost" data-modal="auth" data-tab="login">Sign In</button>
      <button class="btn btn-blue" data-modal="auth" data-tab="register">Register</button>
      <button class="icon-btn hide-mobile" data-act="chat" aria-label="Chat">${icon('chat', 20)}</button>`;
    return;
  }
  center.innerHTML = `<div class="wallet-pill">
      <button class="balance-btn" data-act="currency"><span class="bal"><span class="bal-amount"></span><span class="bal-coin"></span></span>${icon('down', 14)}</button>
      <button class="wallet-btn" data-modal="wallet" data-tab="deposit"><span class="show-mobile">${icon('wallet', 18)}</span><span class="label">Wallet</span></button>
    </div>`;
  right.innerHTML = `
    <button class="icon-btn hide-mobile" data-act="search" aria-label="Search">${icon('search', 20)}</button>
    <div style="position:relative">
      <button class="icon-btn" data-act="user" aria-label="Account">${icon('user', 20)}</button>
    </div>
    <button class="icon-btn hide-mobile" data-act="chat" aria-label="Chat">${icon('chat', 20)}</button>`;

  const updateBalance = (e) => {
    const code = currency();
    const amountEl = center.querySelector('.bal-amount');
    if (!amountEl) return;
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
  const userWrap = right.querySelector('[data-act=user]').parentElement;
  userWrap.querySelector('button').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown(userWrap, userDropdown, 'user', 'right');
  });
  right.querySelector('[data-act=search]').addEventListener('click', () => {
    navigate('/casino');
    setTimeout(() => $('.search-bar input')?.focus(), 50);
  });
  docClick = (e) => {
    if (!e.target.closest('.dropdown')) closeDropdowns();
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
    navigate('/settings/preferences');
  });
  return dd;
}

function userDropdown() {
  const items = [
    ['wallet', 'Wallet', '?modal=wallet&tab=deposit'],
    ['vault', 'Vault', '?modal=wallet&tab=vault'],
    ['crown', 'VIP', '/vip'],
    ['stats', 'Statistics', '?modal=stats'],
    ['list', 'Transactions', '/transactions/deposits'],
    ['history', 'My Bets', '/transactions/bets'],
    ['settings', 'Settings', '/settings/general'],
    ['shield', 'Provably Fair', '?modal=fairness'],
  ];
  const dd = el(`<div class="dropdown"><div style="padding:8px 16px 10px;border-bottom:1px solid #e3e8ee;margin-bottom:4px">
      <div style="font-weight:800">${esc(state.user.username)}</div><div style="font-size:12px;color:#5a6b7e">${esc(state.user.vip.level)} VIP</div></div>
    ${items.map(([ic, label, href]) => `<a class="dropdown-item" href="${href}">${icon(ic, 16)} ${label}</a>`).join('')}
    <button class="dropdown-item" data-act="logout">${icon('logout', 16)} Logout</button></div>`);
  dd.addEventListener('click', (e) => {
    if (e.target.closest('a')) setTimeout(closeDropdowns, 0);
  });
  dd.querySelector('[data-act=logout]').addEventListener('click', async () => {
    closeDropdowns();
    await api.post('/api/auth/logout');
    bus.emit('logout');
  });
  return dd;
}
