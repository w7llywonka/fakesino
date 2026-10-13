import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/js/shared/games');

// Every shared rules module that exports META is a game, so adding a game is
// adding a file. The same modules run in the browser for verification.
export const CATALOG = {};
for (const file of fs.readdirSync(DIR).sort()) {
  if (!file.endsWith('.js')) continue;
  const mod = await import(pathToFileURL(path.join(DIR, file)).href);
  if (!mod.META?.slug) continue;
  CATALOG[mod.META.slug] = { ...mod.META, module: mod, rulesVersion: mod.RULES_VERSION ?? 1 };
}

// Games the bet engine plays (instant, chip and multi-step). Multiplayer games
// such as Crash run their own round loops.
export const GAMES = Object.fromEntries(Object.entries(CATALOG).filter(([, g]) => g.kind !== 'multiplayer'));

export function publicCatalog() {
  return Object.values(CATALOG)
    .map(({ module, ...meta }) => ({ kind: module.stateful ? 'stateful' : module.chipGame ? 'chips' : 'instant', ...meta }))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}
