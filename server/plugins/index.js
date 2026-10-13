import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

// Server plugins: each server/plugins/<name>.js default-exports
// register(ctx) and may return { close() }. Multiplayer games and site
// features live here so they plug in without editing app.js.
export const PLUGINS = [];
for (const file of fs.readdirSync(DIR).sort()) {
  if (!file.endsWith('.js') || file === 'index.js') continue;
  const mod = await import(pathToFileURL(path.join(DIR, file)).href);
  if (typeof mod.default === 'function') PLUGINS.push({ name: file.slice(0, -3), register: mod.default });
}
