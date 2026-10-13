import { esc } from '../dom.js';
import { gameArt } from '../icons.js';
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
  return n ? `<span class="dot-live"></span>${esc(playingLabel(n))}` : `<span class="dot-idle"></span>${esc(g.name)}`;
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
