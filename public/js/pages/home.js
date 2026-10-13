import { el, esc, on } from '../dom.js';
import { icon, gameArt } from '../icons.js';
import { state, bus } from '../state.js';
import { GAMES, CATEGORIES, bySlug } from '../games/registry.js';
import { createLiveBets } from '../ui/livebets.js';
import { recentGames, favouriteGames } from './game.js';
import * as fmt from '../format.js';

const tile = (g) => `<div class="game-tile-wrap"><a class="game-card" href="/casino/games/${g.slug}" title="${esc(g.name)}">${gameArt(g.slug, g.name)}</a>
  <div class="game-tile-meta"><span class="dot-live"></span>${esc(g.name)} · RTP ${g.rtp}%</div></div>`;

export default function homePage(page) {
  document.title = 'Fakesino — Play-Money Casino';
  const authed = !!state.user;
  const root = el(`<div>
    <div class="hero">
      <div class="promo p1">
        <span class="tag">${authed ? `Welcome back` : 'Play money'}</span>
        <div><h2>${authed ? `Hi ${esc(state.user.username)}, ready to play?` : 'The whole casino. None of the risk.'}</h2>
        <p>${authed ? 'Top up with a demo card or a simulated crypto transfer and jump into any game.' : 'Real games, real odds, provably fair results — all on balances that are 100% fake.'}</p></div>
        ${authed ? '<a class="btn btn-secondary" href="?modal=wallet&tab=deposit">Deposit play money</a>' : '<a class="btn btn-secondary" href="?modal=auth&tab=register">Register now</a>'}
        <svg class="promo-art" viewBox="0 0 200 200">${[0, 1, 2, 3, 4].map((i) => `<circle cx="${130 + Math.cos(i * 1.3) * 50}" cy="${100 + Math.sin(i * 1.3) * 60}" r="${18 + i * 4}" fill="#fff" opacity="${0.08 + i * 0.03}"/>`).join('')}<text x="120" y="130" font-size="90" font-weight="900" fill="#fff" opacity=".9" text-anchor="middle">$</text></svg>
      </div>
      <div class="promo p2"><span class="tag">VIP Club</span><div><h2>Daily Reload</h2><p>Claim free play money every 24 hours. Higher VIP levels get bigger reloads.</p></div>
        <a class="btn btn-secondary" href="/vip">Claim reload</a>
        <svg class="promo-art" viewBox="0 0 200 200"><path d="M40 140l30-60 30 40 30-70 30 90z" fill="#fff" opacity=".25"/><path d="M60 150h100l-10-40-40 20-40-20z" fill="#ffd166" opacity=".9"/></svg></div>
      <div class="promo p3"><span class="tag">Originals</span><div><h2>Crash is live</h2><p>Shared multiplayer rounds every few seconds. Cash out before it busts.</p></div>
        <a class="btn btn-secondary" href="/casino/games/crash">Play Crash</a>
        <svg class="promo-art" viewBox="0 0 200 200"><path d="M20 180 C 90 175 130 130 170 40" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" opacity=".85"/><circle cx="170" cy="40" r="14" fill="#ffd166"/></svg></div>
    </div>
    <div class="search-bar">${icon('search', 18)}<input class="input" placeholder="Search your game" data-act="search"></div>
    <div class="tabs" style="margin-top:12px" data-role="cats">
      <button class="tab active" data-cat="lobby">${icon('home', 16)} Lobby</button>
      ${CATEGORIES.map((c) => `<button class="tab" data-cat="${c.key}">${icon(c.icon, 16)} ${esc(c.name)}</button>`).join('')}
    </div>
    <div class="lobby-body"></div>
    ${authed ? statsStrip() : ''}
    <div class="lb-slot"></div>
  </div>`);
  page.appendChild(root);
  const body = root.querySelector('.lobby-body');

  const renderLobby = (cat = 'lobby', q = '') => {
    if (q) {
      const hits = GAMES.filter((g) => g.name.toLowerCase().includes(q) || g.slug.includes(q));
      body.innerHTML = `<div class="section-title">${icon('search', 18)} Results for “${esc(q)}”</div>${hits.length ? `<div class="game-grid">${hits.map(tile).join('')}</div>` : '<div class="empty">No games match that search.</div>'}`;
      return;
    }
    if (cat !== 'lobby') {
      const c = CATEGORIES.find((x) => x.key === cat);
      body.innerHTML = `<div class="section-title">${icon(c.icon, 18)} ${esc(c.name)}</div><div class="game-grid">${GAMES.filter((g) => g.category === cat).map(tile).join('')}</div>`;
      return;
    }
    const recent = recentGames().map((s) => bySlug[s]).filter(Boolean);
    body.innerHTML =
      (recent.length ? `<div class="section-title">${icon('clock', 18)} Continue playing</div><div class="game-row">${recent.map(tile).join('')}</div>` : '') +
      CATEGORIES.map(
        (c) => `<div class="section-title">${icon(c.icon, 18)} ${esc(c.name)}<span class="spacer"></span><a class="btn btn-ghost btn-sm" href="/casino/group/${c.key}">View all</a></div>
        <div class="game-row">${GAMES.filter((g) => g.category === c.key).map(tile).join('')}</div>`,
      ).join('');
  };
  renderLobby();

  on(root, 'click', '[data-cat]', (e, b) => {
    root.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('active', x === b));
    root.querySelector('[data-act=search]').value = '';
    renderLobby(b.dataset.cat);
  });
  root.querySelector('[data-act=search]').addEventListener('input', (e) => renderLobby('lobby', e.target.value.trim().toLowerCase()));

  const live = createLiveBets(root.querySelector('.lb-slot'));
  const off = bus.on('balance', () => {
    const strip = root.querySelector('.stats-strip');
    if (strip && state.user) strip.outerHTML = statsStrip();
  });
  return () => {
    live.destroy();
    off();
  };
}

function statsStrip() {
  const u = state.user;
  return `<div class="stats-strip">
    <div class="stat-box"><div class="k">VIP level</div><div class="v" style="color:${u.vip.color}">${icon('crown', 16)} ${esc(u.vip.level)}</div></div>
    <div class="stat-box"><div class="k">Total wagered</div><div class="v">${fmt.fiat(u.stats.wageredUsd)}</div></div>
    <div class="stat-box"><div class="k">Bets</div><div class="v">${u.stats.bets.toLocaleString()}</div></div>
    <div class="stat-box"><div class="k">Net profit</div><div class="v ${u.stats.profitUsd >= 0 ? 'win-text' : 'loss-text'}">${u.stats.profitUsd < 0 ? '-' : ''}${fmt.fiat(Math.abs(u.stats.profitUsd))}</div></div>
  </div>`;
}

export function groupPage(page, { group }) {
  let list;
  let title;
  let ic;
  if (group === 'favourites') {
    list = favouriteGames().map((s) => bySlug[s]).filter(Boolean);
    title = 'Favourites';
    ic = 'star';
  } else if (group === 'recent') {
    list = recentGames().map((s) => bySlug[s]).filter(Boolean);
    title = 'Recently played';
    ic = 'clock';
  } else {
    const c = CATEGORIES.find((x) => x.key === group);
    if (!c) return import('./misc.js').then((m) => m.notFound(page));
    list = GAMES.filter((g) => g.category === group);
    title = c.name;
    ic = c.icon;
  }
  document.title = `${title} — Fakesino`;
  page.innerHTML = `<div class="page-title">${icon(ic, 22)} ${esc(title)}</div>
    ${list.length ? `<div class="game-grid">${list.map(tile).join('')}</div>` : `<div class="empty">${icon(ic, 28)}<div>${group === 'favourites' ? 'Tap the star under any game to add it here.' : 'Games you play will show up here.'}</div></div>`}`;
}
