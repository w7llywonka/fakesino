import { el, esc, on } from '../dom.js';
import { icon } from '../icons.js';
import { state, bus } from '../state.js';
import { GAMES, bySlug, CATEGORIES } from '../games/registry.js';
import { tile, loadPresence, playing } from './tiles.js';

const RECENT_KEY = 'fakesino:searches';
const recent = () => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
};
const saveRecent = (list) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 5)));
  } catch {
    /* private mode */
  }
};

let current = null;

export function closeSearch() {
  current?.close();
}

// Full-site game search: overlay under the header, works on mobile too.
export function openSearch() {
  if (current) return current.input.focus();
  loadPresence();
  const catName = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.name.toLowerCase()]));
  const root = el(`<div class="sr-overlay"><div class="sr-scrim"></div><div class="sr-panel" role="dialog" aria-label="Search">
    <div class="sr-bar">${icon('search', 18)}<input class="input" placeholder="Search your game" autocomplete="off" aria-label="Search games"><button class="icon-btn" data-act="close" aria-label="Close search">${icon('close', 18)}</button></div>
    <div class="sr-body"></div></div></div>`);
  document.body.appendChild(root);
  const input = root.querySelector('input');
  const body = root.querySelector('.sr-body');

  function suggested() {
    const mine = JSON.parse(localStorage.getItem('fakesino:recent') || '[]').map((s) => bySlug[s]).filter(Boolean);
    const popular = [...GAMES].sort((a, b) => playing(b.slug) - playing(a.slug) || (a.order ?? 999) - (b.order ?? 999));
    const seen = new Set();
    return [...mine, ...popular].filter((g) => !seen.has(g.slug) && seen.add(g.slug)).slice(0, 8);
  }

  function render() {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      const r = recent();
      body.innerHTML = `${r.length ? `<div class="sr-sec"><div class="sr-h">Recent searches<button class="link" data-act="clear-all">Clear</button></div><div class="sr-chips">${r.map((t) => `<span class="sr-chip"><button data-q="${esc(t)}">${esc(t)}</button><button data-rm="${esc(t)}" aria-label="Remove">${icon('close', 12)}</button></span>`).join('')}</div></div>` : ''}
        <div class="sr-sec"><div class="sr-h">Suggested for you</div><div class="game-grid sr-grid">${suggested().map(tile).join('')}</div></div>`;
      return;
    }
    const hits = GAMES.filter((g) => g.name.toLowerCase().includes(q) || g.slug.includes(q) || catName[g.category]?.includes(q));
    body.innerHTML = `${q.length < 3 ? '<div class="sr-hint">Type 3 characters or more to search</div>' : ''}
      ${hits.length ? `<div class="game-grid sr-grid">${hits.map(tile).join('')}</div>` : `<div class="empty">No results found for “${esc(q)}”</div>`}`;
  }

  const remember = () => {
    const q = input.value.trim();
    if (q.length >= 3) saveRecent([q, ...recent().filter((x) => x.toLowerCase() !== q.toLowerCase())]);
  };
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter') {
      remember();
      body.querySelector('.game-card')?.click();
    }
  });
  on(body, 'click', '[data-q]', (e, b) => {
    input.value = b.dataset.q;
    render();
    input.focus();
  });
  on(body, 'click', '[data-rm]', (e, b) => {
    saveRecent(recent().filter((x) => x !== b.dataset.rm));
    render();
  });
  on(body, 'click', '[data-act=clear-all]', () => {
    saveRecent([]);
    render();
  });
  on(body, 'click', '.game-card', () => {
    remember();
    setTimeout(close, 0);
  });
  root.querySelector('.sr-scrim').addEventListener('click', close);
  root.querySelector('[data-act=close]').addEventListener('click', close);
  const offRoute = bus.on('route', close);

  function close() {
    root.remove();
    offRoute();
    current = null;
  }
  render();
  input.focus();
  current = { close, input };
}

// '/' opens search when hotkeys are on (desktop).
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || !state.prefs.hotkeys || current) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable]') || document.querySelector('.modal-backdrop')) return;
  e.preventDefault();
  openSearch();
});
