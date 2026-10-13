import { esc, on } from '../dom.js';
import { gameArt, icon } from '../icons.js';
import { api } from '../api.js';
import { state, bus } from '../state.js';
import * as fmt from '../format.js';

// Live "N playing" counts, shared by lobby tiles and game headers.
state.presence = state.presence || {};
bus.on('live:presence:counts', (counts) => {
  state.presence = counts || {};
  bus.emit('presence', state.presence);
});
let loaded = false;
export function loadPresence() {
  if (loaded) return;
  loaded = true;
  api
    .get('/api/presence')
    .then(({ counts }) => {
      state.presence = counts || {};
      bus.emit('presence', state.presence);
    })
    .catch(() => (loaded = false));
}

export const playing = (slug) => state.presence?.[slug] || 0;
export const playingLabel = (n) => `${fmt.compact ? fmt.compact(n) : n} playing`;

export function tileMeta(g) {
  const n = playing(g.slug);
  return n ? `<span class="dot-live"></span><span class="gtm-text">${esc(playingLabel(n))}</span>` : `<span class="dot-idle"></span><span class="gtm-text">${esc(g.name)}</span>`;
}

export const tile = (g) => `<div class="game-tile-wrap" data-slug="${esc(g.slug)}"><a class="game-card" href="/casino/games/${g.slug}" title="${esc(g.name)} · RTP ${g.rtp}%">${gameArt(g.slug, g.name)}</a>
  <div class="game-tile-meta" data-tip="RTP ${g.rtp}%">${tileMeta(g)}</div></div>`;

// Refresh the counts under any tiles inside `root`.
export function refreshTiles(root, bySlug) {
  root.querySelectorAll('.game-tile-wrap[data-slug]').forEach((w) => {
    const g = bySlug[w.dataset.slug];
    const meta = w.querySelector('.game-tile-meta');
    if (g && meta) meta.innerHTML = tileMeta(g);
  });
}

// ‹ › buttons for a section title; they scroll the .game-row that follows it.
export const rowNav = () =>
  `<span class="row-nav hide-mobile" hidden><button class="icon-btn" data-row="-1" aria-label="Scroll left">${icon('left', 16)}</button><button class="icon-btn" data-row="1" aria-label="Scroll right">${icon('right', 16)}</button></span>`;

export function wireRows(root) {
  const sync = (row) => {
    const nav = row.previousElementSibling?.querySelector('.row-nav');
    if (!nav) return;
    const max = row.scrollWidth - row.clientWidth;
    nav.hidden = max <= 2;
    const [prev, next] = nav.querySelectorAll('[data-row]');
    prev.disabled = row.scrollLeft <= 2;
    next.disabled = row.scrollLeft >= max - 2;
  };
  const syncAll = () => root.querySelectorAll('.game-row').forEach(sync);
  const offClick = on(root, 'click', '[data-row]', (e, b) => {
    const row = b.closest('.section-title')?.nextElementSibling;
    if (row?.classList.contains('game-row')) row.scrollBy({ left: Number(b.dataset.row) * row.clientWidth * 0.9 });
  });
  const onScroll = (e) => e.target.classList?.contains('game-row') && sync(e.target);
  root.addEventListener('scroll', onScroll, true);
  const ro = new ResizeObserver(syncAll);
  ro.observe(root);
  return {
    sync: () => requestAnimationFrame(syncAll),
    destroy() {
      offClick();
      root.removeEventListener('scroll', onScroll, true);
      ro.disconnect();
    },
  };
}
