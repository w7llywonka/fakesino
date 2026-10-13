import { CURRENCIES } from './shared/currencies.js';

// Stroke icons on a 24×24 grid.
const P = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  casino: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
  star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  fire: '<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5.5 1-8.5z"/>',
  gift: '<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v7h14v-7M12 8v12M12 8c-2-4-6-4-6-1.5S9 8 12 8zm0 0c2-4 6-4 6-1.5S15 8 12 8z"/>',
  crown: '<path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  chat: '<path d="M4 5h16v11H8l-4 4z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  wallet: '<path d="M4 7h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a2 2 0 0 1 2-2h11v3"/><circle cx="16" cy="13.5" r="1.3" fill="currentColor"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-7 8-7s7 2.5 8 7"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.8 3.4-6 6.5-6s5.7 2.2 6.5 6"/><circle cx="17" cy="9" r="2.8"/><path d="M16.5 14.2c2.6.2 4.4 2.1 5 5.3"/>',
  sports: '<circle cx="12" cy="12" r="9"/><path d="M12 7l4.3 3.1-1.6 5h-5.4l-1.6-5z"/><path d="M12 3v4M20.6 9.3l-4.3.8M17 19.5l-2.3-4.4M7 19.5l2.3-4.4M3.4 9.3l4.3.8"/>',
  soccer: '<circle cx="12" cy="12" r="9"/><path d="M12 7l4.3 3.1-1.6 5h-5.4l-1.6-5z"/><path d="M12 3v4M20.6 9.3l-4.3.8M17 19.5l-2.3-4.4M7 19.5l2.3-4.4M3.4 9.3l4.3.8"/>',
  basketball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.6 5.6c3.5 3.5 3.5 9.3 0 12.8M18.4 5.6c-3.5 3.5-3.5 9.3 0 12.8"/>',
  tennis: '<circle cx="12" cy="12" r="9"/><path d="M5.5 5.5c3 3 3 10 0 13M18.5 5.5c-3 3-3 10 0 13"/>',
  icehockey: '<path d="M4 3l7 13h6a2 2 0 0 1 0 4H9.5L2 5"/><ellipse cx="18" cy="9" rx="3" ry="1.5"/>',
  esports: '<rect x="2" y="7" width="20" height="11" rx="5.5"/><path d="M7 10.5v4M5 12.5h4"/><circle cx="16" cy="11.5" r="1"/><circle cx="18" cy="13.5" r="1"/>',
  ticket: '<path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z"/><path d="M9 6v12" stroke-dasharray="2 2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  up: '<path d="M18 15l-6-6-6 6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.8-4M4 4v4h4M4 13a8 8 0 0 0 14.8 4M20 20v-4h-4"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  volume: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  volumeOff: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  theatre: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10v4M18 10v4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  bank: '<path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18"/>',
  vault: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="4"/><path d="M12 8v1M12 15v1M8 12h1M15 12h1M7 20v2M17 20v2"/>',
  coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.6-2.4-2.9-5.5-3"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  swap: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  support: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 20h2M20 14v2"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  pause: '<path d="M7 4h4v16H7zM13 4h4v16h-4z"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  rocket: '<path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.8-.9.8-2.3-.1-3.1-.9-.8-2.2-.8-2.9.1z"/><path d="M12 15l-3-3a22 22 0 0 1 2-4A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><circle cx="16" cy="8" r="1.4" fill="currentColor"/><circle cx="8" cy="16" r="1.4" fill="currentColor"/><circle cx="16" cy="16" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>',
  plinko: '<circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="8" cy="10" r="1.3" fill="currentColor"/><circle cx="16" cy="10" r="1.3" fill="currentColor"/><circle cx="4" cy="15" r="1.3" fill="currentColor"/><circle cx="12" cy="15" r="1.3" fill="currentColor"/><circle cx="20" cy="15" r="1.3" fill="currentColor"/><path d="M3 20h18"/>',
  mines: '<circle cx="12" cy="13" r="6"/><path d="M12 7V4M17 8l2-2M18 13h3M7 8L5 6M15.5 4.5L17 3"/><circle cx="10" cy="11" r="1.2" fill="currentColor"/>',
  limbo: '<path d="M4 20L12 4l8 16"/><path d="M8 13h8"/>',
  crash: '<path d="M3 20c6 0 11-4 15-14"/><path d="M14 6h4v4"/><path d="M3 20h18"/>',
  keno: '<rect x="3" y="3" width="5" height="5" rx="1"/><rect x="10" y="3" width="5" height="5" rx="1" fill="currentColor"/><rect x="17" y="3" width="4" height="5" rx="1"/><rect x="3" y="10" width="5" height="5" rx="1" fill="currentColor"/><rect x="10" y="10" width="5" height="5" rx="1"/><rect x="17" y="10" width="4" height="5" rx="1" fill="currentColor"/><rect x="3" y="17" width="5" height="4" rx="1"/><rect x="10" y="17" width="5" height="4" rx="1" fill="currentColor"/>',
  wheel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 3v7M12 14v7M3 12h7M14 12h7M5.6 5.6l5 5M13.4 13.4l5 5M18.4 5.6l-5 5M10.6 13.4l-5 5"/>',
  hilo: '<rect x="5" y="3" width="11" height="15" rx="2"/><path d="M19 7l2 2-2 2M19 13l2 2-2 2"/><path d="M8 7l2.5 4L8 15"/>',
  blackjack: '<rect x="3" y="5" width="11" height="15" rx="2" transform="rotate(-8 8 12)"/><rect x="10" y="4" width="11" height="15" rx="2" transform="rotate(8 15 12)"/>',
  baccarat: '<rect x="4" y="4" width="10" height="14" rx="2"/><rect x="10" y="7" width="10" height="14" rx="2"/><path d="M15 12l1.5 2L15 16l-1.5-2z" fill="currentColor"/>',
  roulette: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="15" cy="8" r="1" fill="currentColor"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>',
  slots: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M8.7 5v14M15.3 5v14"/><path d="M4 11l1.3-2h1.5L5 13M10.5 11l1.3-2h1.5l-1.8 4M17 11l1.3-2h1.5l-1.8 4"/>',
  videopoker: '<rect x="2" y="6" width="5" height="9" rx="1"/><rect x="9.5" y="6" width="5" height="9" rx="1"/><rect x="17" y="6" width="5" height="9" rx="1"/><path d="M2 19h20"/>',
  tower: '<path d="M6 21V8l2-2V3h2v2h4V3h2v3l2 2v13z"/><path d="M10 21v-4a2 2 0 0 1 4 0v4M9 11h.01M15 11h.01"/>',
  coinflip: '<ellipse cx="12" cy="12" rx="8" ry="9"/><path d="M12 7v10M9.5 9.5c0-1 1-1.5 2.5-1.5s2.5.7 2.5 1.7-1 1.4-2.5 1.8-2.5.8-2.5 1.8 1 1.7 2.5 1.7 2.5-.5 2.5-1.5"/>',
};

// Games can ship their own sidebar icon and lobby art in META (icon: inner SVG
// for a 24×24 stroke icon; thumb: { bg: [from, to], glyph: SVG for a 300×400 card }).
const gameIcons = {};
const gameThumbs = {};
const gameSubtitle = {};
const SUBTITLE = { originals: 'FAKESINO ORIGINALS', table: 'TABLE GAMES', slots: 'FAKESINO SLOTS' };
export function registerGameArt(meta) {
  if (meta.icon) gameIcons[meta.slug] = meta.icon;
  if (meta.thumb) gameThumbs[meta.slug] = meta.thumb;
  gameSubtitle[meta.slug] = SUBTITLE[meta.category] || SUBTITLE.originals;
}

export function icon(name, size = 18, extra = '') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${P[name] || gameIcons[name] || P.casino}</svg>`;
}

export function coin(code, size = 16) {
  const c = CURRENCIES[code] || CURRENCIES.USD;
  const fs = c.symbol.length > 1 ? 9 : 11;
  return `<svg class="coin" width="${size}" height="${size}" viewBox="0 0 24 24" aria-label="${c.code}"><circle cx="12" cy="12" r="12" fill="${c.color}"/><circle cx="12" cy="12" r="9.5" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1"/><text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="800" fill="#fff" font-family="system-ui, sans-serif">${c.symbol}</text></svg>`;
}

// Card suit glyphs (filled).
const SUIT_PATHS = {
  hearts: 'M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z',
  diamonds: 'M12 2l7.5 10L12 22 4.5 12z',
  spades: 'M12 2s8 6 8 11a4 4 0 0 1-7 2.6V18l1.5 3h-5L11 18v-2.4A4 4 0 0 1 4 13c0-5 8-11 8-11z',
  clubs: 'M12 2a4 4 0 0 1 3.4 6.1A4 4 0 1 1 13 15.3V18l1.5 3h-5L11 18v-2.7a4 4 0 1 1-2.4-7.2A4 4 0 0 1 12 2z',
};

export function suit(name, cls = 's') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${SUIT_PATHS[name]}"/></svg>`;
}

export const isRedSuit = (s) => s === 'hearts' || s === 'diamonds';

// Render a playing card. card = { rank, suit } | { hidden: true }
export function playingCard(card, cls = '') {
  if (!card || card.hidden) return `<div class="pcard back ${cls}"></div>`;
  const red = isRedSuit(card.suit) ? 'red' : '';
  return `<div class="pcard ${red} ${cls}" data-rank="${card.rank}" data-suit="${card.suit}">
    <div class="corner-t"><span class="r">${card.rank}</span>${suit(card.suit)}</div>
    <div class="big">${suit(card.suit, '')}</div>
    <div class="corner-b"><span class="r">${card.rank}</span></div>
  </div>`;
}

// --- Game thumbnails ------------------------------------------------------------

const ART = {
  crash: { bg: ['#ff6a3d', '#c3247a'], glyph: '<path d="M40 300 C 140 290 200 220 250 90" stroke="#fff" stroke-width="14" fill="none" stroke-linecap="round"/><path d="M228 98 l30 -18 l2 34z" fill="#fff"/><circle cx="250" cy="90" r="18" fill="#ffd166"/>' },
  plinko: {
    bg: ['#ff4fa0', '#7b2ff7'],
    glyph: Array.from({ length: 5 }, (_, r) => Array.from({ length: r + 3 }, (_, c) => `<circle cx="${150 - (r + 2) * 22 + c * 44}" cy="${110 + r * 38}" r="7" fill="#fff" opacity=".9"/>`).join('')).join('') + '<circle cx="150" cy="78" r="14" fill="#ffd166"/>',
  },
  mines: { bg: ['#1fb6ff', '#0b5bd3'], glyph: '<g transform="translate(150 190)"><path d="M0 -70 L60 -10 L0 70 L-60 -10z" fill="#7cf0ff"/><path d="M0 -70 L60 -10 L0 0z" fill="#b8f8ff"/><path d="M-60 -10 L0 0 L0 70z" fill="#38c8ee"/></g>' },
  dice: { bg: ['#3ddc84', '#0f8f4e'], glyph: '<g transform="translate(150 195) rotate(-12)"><rect x="-70" y="-70" width="140" height="140" rx="28" fill="#fff"/><circle cx="-35" cy="-35" r="13" fill="#0f8f4e"/><circle cx="35" cy="35" r="13" fill="#0f8f4e"/><circle cx="0" cy="0" r="13" fill="#0f8f4e"/><circle cx="35" cy="-35" r="13" fill="#0f8f4e"/><circle cx="-35" cy="35" r="13" fill="#0f8f4e"/></g>' },
  limbo: { bg: ['#ffb02e', '#e8590c'], glyph: '<text x="150" y="225" text-anchor="middle" font-size="96" font-weight="900" fill="#fff" font-style="italic">2.00×</text>' },
  keno: {
    bg: ['#7c4dff', '#3d1fa3'],
    glyph: Array.from({ length: 16 }, (_, i) => `<rect x="${72 + (i % 4) * 42}" y="${118 + Math.floor(i / 4) * 42}" width="34" height="34" rx="7" fill="${[1, 6, 8, 11, 13].includes(i) ? '#ffd166' : 'rgba(255,255,255,.25)'}"/>`).join(''),
  },
  wheel: {
    bg: ['#00c2a8', '#05706a'],
    glyph:
      '<g transform="translate(150 190)">' +
      Array.from({ length: 10 }, (_, i) => {
        const a1 = (i / 10) * Math.PI * 2;
        const a2 = ((i + 1) / 10) * Math.PI * 2;
        const colors = ['#ffd166', '#fff', '#ff6b6b', '#fff', '#4dabf7'];
        return `<path d="M0 0 L${80 * Math.cos(a1)} ${80 * Math.sin(a1)} A80 80 0 0 1 ${80 * Math.cos(a2)} ${80 * Math.sin(a2)}z" fill="${colors[i % 5]}" opacity=".95"/>`;
      }).join('') +
      '<circle r="22" fill="#05706a"/><path d="M0 -102 l-12 -22 h24z" fill="#fff"/></g>',
  },
  hilo: { bg: ['#ff5f6d', '#b8205a'], glyph: '<g transform="translate(150 195) rotate(-8)"><rect x="-55" y="-78" width="110" height="156" rx="12" fill="#fff"/><text x="0" y="22" text-anchor="middle" font-size="72" font-weight="900" fill="#e0283c">A</text></g><path d="M240 120 l20 24 h-40z M240 280 l20 -24 h-40z" fill="#fff"/>' },
  blackjack: { bg: ['#2d3436', '#0b0f12'], glyph: '<g transform="translate(120 200) rotate(-12)"><rect x="-55" y="-78" width="110" height="156" rx="12" fill="#fff"/><text x="0" y="20" text-anchor="middle" font-size="64" font-weight="900" fill="#111">A</text></g><g transform="translate(185 195) rotate(10)"><rect x="-55" y="-78" width="110" height="156" rx="12" fill="#fff"/><text x="0" y="20" text-anchor="middle" font-size="64" font-weight="900" fill="#e0283c">K</text></g>' },
  baccarat: { bg: ['#d4a017', '#7a4f00'], glyph: '<g transform="translate(150 195)"><circle r="70" fill="#fff" opacity=".18"/><text x="0" y="-8" text-anchor="middle" font-size="40" font-weight="900" fill="#fff">P · B</text><text x="0" y="40" text-anchor="middle" font-size="30" font-weight="800" fill="#fff" opacity=".85">TIE</text></g>' },
  roulette: {
    bg: ['#1e9e5a', '#0c5130'],
    glyph:
      '<g transform="translate(150 190)">' +
      Array.from({ length: 18 }, (_, i) => {
        const a1 = (i / 18) * Math.PI * 2;
        const a2 = ((i + 1) / 18) * Math.PI * 2;
        return `<path d="M0 0 L${85 * Math.cos(a1)} ${85 * Math.sin(a1)} A85 85 0 0 1 ${85 * Math.cos(a2)} ${85 * Math.sin(a2)}z" fill="${i === 0 ? '#22d36b' : i % 2 ? '#e0283c' : '#1b1b1b'}"/>`;
      }).join('') +
      '<circle r="48" fill="#7a4f12"/><circle r="12" fill="#f5d27a"/><circle cx="58" cy="-40" r="8" fill="#fff"/></g>',
  },
  slots: { bg: ['#ff2fd1', '#5b00b8'], glyph: '<g transform="translate(150 195)"><rect x="-105" y="-60" width="210" height="120" rx="16" fill="#1b0b3a"/><text x="-66" y="22" text-anchor="middle" font-size="60" font-weight="900" fill="#ffd166">7</text><text x="0" y="22" text-anchor="middle" font-size="60" font-weight="900" fill="#ffd166">7</text><text x="66" y="22" text-anchor="middle" font-size="60" font-weight="900" fill="#ffd166">7</text></g>' },
  videopoker: { bg: ['#4361ee', '#1a237e'], glyph: [0, 1, 2, 3, 4].map((i) => `<rect x="${42 + i * 46}" y="140" width="40" height="60" rx="6" fill="#fff"/><text x="${62 + i * 46}" y="180" text-anchor="middle" font-size="22" font-weight="900" fill="${i % 2 ? '#e0283c' : '#111'}">${'AKQJT'[i]}</text>`).join('') },
  tower: { bg: ['#ff8a00', '#9c1f00'], glyph: Array.from({ length: 5 }, (_, r) => Array.from({ length: 3 }, (_, c) => `<rect x="${78 + c * 50}" y="${100 + r * 40}" width="42" height="32" rx="6" fill="${r === 4 - c ? '#7cf06a' : 'rgba(255,255,255,.22)'}"/>`).join('')).join('') },
  coinflip: { bg: ['#f7b733', '#c27c0e'], glyph: '<g transform="translate(150 195)"><ellipse rx="78" ry="82" fill="#ffe08a"/><ellipse rx="62" ry="66" fill="none" stroke="#c27c0e" stroke-width="6"/><text y="24" text-anchor="middle" font-size="70" font-weight="900" fill="#c27c0e">$</text></g>' },
};

export function gameArt(slug, name) {
  const a = ART[slug] || gameThumbs[slug] || { bg: ['#3a4b5c', '#1d2b38'], glyph: '' };
  const id = `g-${slug}`;
  return `<svg class="art" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${name}">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a.bg[0]}"/><stop offset="1" stop-color="${a.bg[1]}"/></linearGradient>
    <radialGradient id="${id}-v" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></radialGradient></defs>
    <rect width="300" height="400" fill="url(#${id})"/>
    <rect width="300" height="400" fill="url(#${id}-v)"/>
    ${a.glyph}
    <text x="150" y="352" text-anchor="middle" font-size="${Math.min(34, Math.floor(470 / name.length))}" font-weight="900" fill="#fff" font-style="italic" letter-spacing="1" style="text-transform:uppercase">${name.toUpperCase()}</text>
    <text x="150" y="380" text-anchor="middle" font-size="13" font-weight="800" fill="#fff" opacity=".7" letter-spacing="3">${gameSubtitle[slug] || SUBTITLE.originals}</text>
  </svg>`;
}
