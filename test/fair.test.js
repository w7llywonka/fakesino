import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRng, sha256, rotateSeeds, initialSeeds, takeNonce } from '../server/fair.js';
import { createArrayRng, bytesToFloat, crashPointFromHex, slidePointFromHex, crashMultiplierAt, crashTimeFor, shuffleSelect } from '../public/js/shared/fair.js';
import { crashPointForHash } from '../server/crash.js';
import * as vp from '../public/js/shared/games/videopoker.js';
import * as vp1 from '../public/js/shared/games/legacy/videopoker.v1.js';
import * as tower from '../public/js/shared/games/tower.js';
import * as tower1 from '../public/js/shared/games/legacy/tower.v1.js';
import * as flip from '../public/js/shared/games/coinflip.js';
import * as flip1 from '../public/js/shared/games/legacy/coinflip.v1.js';

const seed = { serverSeed: 'a'.repeat(64), clientSeed: 'client', nonce: 7 };

test('floats are derived from HMAC-SHA256(serverSeed, clientSeed:nonce:round)', () => {
  const rng = createRng(seed);
  const digest = crypto.createHmac('sha256', seed.serverSeed).update('client:7:0').digest();
  for (let i = 0; i < 8; i++) assert.equal(rng.next(), bytesToFloat(digest, i * 4));
  const digest1 = crypto.createHmac('sha256', seed.serverSeed).update('client:7:1').digest();
  assert.equal(rng.next(), bytesToFloat(digest1, 0), 'float 8 comes from round 1');
});

test('streams can resume at any cursor', () => {
  const full = createRng(seed).take(30);
  const resumed = createRng(seed, 13).take(17);
  assert.deepEqual(resumed, full.slice(13));
  assert.deepEqual(createArrayRng(full, 5).take(3), full.slice(5, 8));
});

test('floats are uniform in [0, 1)', () => {
  const rng = createRng({ ...seed, nonce: 1 });
  const buckets = new Array(10).fill(0);
  const n = 40000;
  for (let i = 0; i < n; i++) {
    const f = rng.next();
    assert.ok(f >= 0 && f < 1);
    buckets[Math.floor(f * 10)]++;
  }
  for (const b of buckets) assert.ok(Math.abs(b - n / 10) < n * 0.01, `bucket ${b}`);
});

test('nonce increments and rotation reveals the committed seed', () => {
  const user = { seeds: initialSeeds(), seedHistory: [] };
  const committed = user.seeds.serverSeedHash;
  const next = user.seeds.nextServerSeedHash;
  assert.equal(takeNonce(user).nonce, 0);
  assert.equal(takeNonce(user).nonce, 1);
  const revealed = rotateSeeds(user, 'mine');
  assert.equal(sha256(revealed.serverSeed), committed);
  assert.equal(revealed.nonce, 2);
  assert.equal(user.seeds.serverSeedHash, next, 'the announced next seed becomes active');
  assert.equal(user.seeds.clientSeed, 'mine');
  assert.equal(user.seeds.nonce, 0);
});

test('shuffleSelect picks without replacement', () => {
  const rng = createRng(seed);
  const order = shuffleSelect(rng.take(25), Array.from({ length: 25 }, (_, i) => i));
  assert.equal(new Set(order).size, 25);
});

test('crash point distribution matches P(crash >= m) = 0.99 / m', () => {
  const salt = 'salt';
  let h = 'seed';
  const n = 20000;
  const points = [];
  for (let i = 0; i < n; i++) {
    h = sha256(h);
    points.push(crashPointForHash(h, salt));
  }
  for (const m of [1.5, 2, 5, 10]) {
    const p = points.filter((c) => c >= m).length / n;
    assert.ok(Math.abs(p - 0.99 / m) < 0.02, `P(>= ${m}) = ${p}`);
  }
  assert.ok(points.every((p) => p >= 1));
  assert.equal(crashPointFromHex('0000000000000'), 1);
});

test('crash growth curve and its inverse agree', () => {
  for (const m of [1.01, 2, 10, 100]) {
    const t = crashTimeFor(m);
    assert.ok(Math.abs(crashMultiplierAt(t + 1) - m) <= 0.01 + 1e-9);
  }
  assert.equal(crashMultiplierAt(0), 1);
});

// Published test vector: seeds 'server seed' / 'client seed', nonce 1.
const vector = { serverSeed: 'server seed', clientSeed: 'client seed', nonce: 1 };
const short = (cards) => cards.map((c) => `${c.rank}${c.suit[0]}`).join(' ');

test('video poker v2 deals the published test vector; v1 bets still replay', () => {
  const s = vp.start(createRng(vector));
  assert.equal(short(s.hand), 'Js 10d 5h Kc 9d');
  assert.equal(short(s.reserve), 'Kh 10h 9c Ah 3h');
  assert.equal(vp.paysFor('straight_flush'), 60);
  assert.equal(vp.paysFor('four_kind'), 22);
  // The frozen v1 module still produces the original (different) deal.
  const old = vp1.start(createRng(vector));
  assert.notEqual(short(old.hand), short(s.hand));
  assert.equal(vp1.paysFor('straight_flush'), 50);
});

test('dragon tower v2 lays eggs per the published test vector', () => {
  assert.deepEqual(tower.layout(createRng(vector), 'easy'), [[0, 1, 2], [1, 2, 3], [1, 2, 3], [0, 1, 3], [0, 2, 3], [1, 2, 3], [0, 1, 3], [0, 2, 3], [0, 2, 3]]);
  assert.equal(tower1.multiplierFor('easy', 1), 1.3066, 'v1 kept its old ladder');
});

test('flip v2: a float of 0.5 lands tails; auto calls stop at the first miss', () => {
  const s = flip.start(createArrayRng([0.5, 0.9, 0.9, ...Array(17).fill(0.1)]), { autoSides: ['tails', 'heads', 'heads', 'heads'] });
  assert.deepEqual(s.calls.map((c) => c.result), ['tails', 'heads', 'heads', 'tails']);
  assert.equal(s.lost, true);
  const won = flip.start(createArrayRng(Array(20).fill(0.9)), { autoSides: ['heads', 'heads', 'heads'] });
  assert.equal(won.payout, 7.84);
  assert.equal(flip1.outcome(createArrayRng([0.2]), { side: 'heads' }).win, true, 'v1 single flip still replays');
});

test('crash v2 and slide formulas match the published shape', () => {
  // int = 0 → 2^32 × 0.99, the maximum; int = 2^32 - 1 → 1.00x.
  assert.equal(crashPointFromHex('00000000', 2), Math.floor(2 ** 32 * 0.99 * 100) / 100);
  assert.equal(crashPointFromHex('ffffffff', 2), 1);
  assert.equal(slidePointFromHex('ffffffff'), 1);
  let h = 'seed';
  const n = 20000;
  const pts = [];
  for (let i = 0; i < n; i++) {
    h = sha256(h);
    pts.push(crashPointFromHex(crypto.createHmac('sha256', h).update('salt').digest('hex'), 2));
  }
  for (const m of [2, 10]) assert.ok(Math.abs(pts.filter((c) => c >= m).length / n - 0.99 / m) < 0.02);
});
