import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GAME_EN } from '../public/js/i18n/game-en.js';
import { ROWS, LANG_ORDER } from '../public/js/i18n-strings.js';
import { CATALOG } from '../server/catalog.js';

const helpSrc = fs.readFileSync(new URL('../public/js/ui/help.js', import.meta.url), 'utf8');
const FAQ_COUNT = (helpSrc.match(/^\s{2}\['/gm) || []).length;

test('game text list matches the catalogue', () => {
  const now = [];
  for (const g of Object.values(CATALOG)) {
    now.push(g.desc);
    for (const h of g.howTo || []) now.push(h);
    for (const [, d] of g.hotkeys || []) now.push(d);
  }
  assert.deepEqual(GAME_EN, [...new Set(now)], 'regenerate public/js/i18n/game-en.js and the language packs');
});

for (const lang of LANG_ORDER) {
  test(`language pack ${lang} is complete`, async () => {
    const pack = await import(`../public/js/i18n/${lang}.js`);
    assert.equal(pack.GAME.length, GAME_EN.length);
    assert.ok(pack.GAME.every((s) => typeof s === 'string' && s.trim()));
    assert.equal(pack.FAQ.length, FAQ_COUNT);
    for (const [c, q, a] of pack.FAQ) assert.ok(c && q && a);
    // Links in help answers survive translation.
    const links = (x) => (x.match(/href="[^"]+"/g) || []).sort().join();
    const en = [...helpSrc.matchAll(/^\s{2}\['[^']*', '[^']*', ['`](.*)['`]\],$/gm)].map((m) => m[1]);
    pack.FAQ.forEach(([, , a], i) => en[i] && assert.equal(links(a), links(en[i]), `${lang} FAQ ${i}`));
  });
}

test('short UI strings have a translation for every language', () => {
  for (const r of ROWS) assert.equal(r.length, LANG_ORDER.length + 1, r[0]);
});
