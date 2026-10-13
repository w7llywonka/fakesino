import { registerGameArt } from '../icons.js';

// The game catalogue comes from the server (/api/config → META of every shared
// rules module), so adding a game needs no change here. Arrays/maps are filled
// in place at boot, so modules that imported them keep live references.
export const GAMES = [];
export const bySlug = {};

export const CATEGORIES = [
  { key: 'originals', name: 'Fakesino Originals', icon: 'fire' },
  { key: 'table', name: 'Table Games', icon: 'blackjack' },
  { key: 'slots', name: 'Slots', icon: 'slots' },
  { key: 'live', name: 'Live Casino', icon: 'liveroulette' },
];

export function initRegistry(games) {
  GAMES.splice(0, GAMES.length, ...games);
  for (const k of Object.keys(bySlug)) delete bySlug[k];
  for (const g of games) {
    bySlug[g.slug] = g;
    registerGameArt(g);
  }
}

export function loadGame(slug) {
  return import(`./${slug}.js`);
}
