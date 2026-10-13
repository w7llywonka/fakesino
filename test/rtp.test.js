import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combinations as C } from '../public/js/shared/games/util.js';
import * as plinko from '../public/js/shared/games/plinko.js';
import * as keno from '../public/js/shared/games/keno.js';
import * as wheel from '../public/js/shared/games/wheel.js';
import * as dice from '../public/js/shared/games/dice.js';
import * as limbo from '../public/js/shared/games/limbo.js';
import * as mines from '../public/js/shared/games/mines.js';
import * as tower from '../public/js/shared/games/tower.js';
import * as slots from '../public/js/shared/games/slots.js';
import * as roulette from '../public/js/shared/games/roulette.js';
import * as hilo from '../public/js/shared/games/hilo.js';

const near = (actual, expected, tol, label) => assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${actual.toFixed(5)} vs ${expected}`);

test('plinko tables are symmetric and return ~99%', () => {
  for (const risk of plinko.RISKS)
    for (const rows of plinko.ROWS) {
      const t = plinko.TABLES[risk][rows];
      assert.equal(t.length, rows + 1);
      assert.deepEqual(t, [...t].reverse());
      let ev = 0;
      for (let k = 0; k <= rows; k++) ev += (t[k] * C(rows, k)) / 2 ** rows;
      near(ev, 0.99, 0.0025, `plinko ${risk}/${rows}`);
    }
});

test('keno tables return ~99% (hypergeometric)', () => {
  for (const risk of keno.RISKS)
    for (let p = 1; p <= 10; p++) {
      const t = keno.TABLES[risk][p];
      assert.equal(t.length, p + 1);
      let ev = 0;
      for (let h = 0; h <= p; h++) ev += (t[h] * C(p, h) * C(40 - p, 10 - h)) / C(40, 10);
      near(ev, 0.99, 0.004, `keno ${risk}/${p}`);
    }
});

test('wheel tables return exactly 99%', () => {
  for (const risk of wheel.RISKS)
    for (const n of wheel.SEGMENTS) {
      const t = wheel.table(risk, n);
      assert.equal(t.length, n);
      near(t.reduce((a, b) => a + b, 0) / n, 0.99, 1e-9, `wheel ${risk}/${n}`);
    }
});

test('dice and limbo pay 99% of fair odds', () => {
  for (const t of [2, 25, 50.5, 97]) {
    const p = { target: t, condition: 'over' };
    // 10,001 discrete rolls; win when roll > target
    const winning = 10000 - Math.round(t * 100);
    near((dice.multiplierFor(p) * winning) / 10001, 0.99, 0.0015, `dice over ${t}`);
  }
  for (const target of [1.01, 2, 10, 1000]) near((limbo.winChance(target) / 100) * target, 0.99, 1e-9, `limbo ${target}`);
});

test('mines multipliers give 99% for every mines/reveal combination', () => {
  for (let m = 1; m <= 24; m++)
    for (let k = 1; k <= 25 - m; k++) {
      const pSurvive = C(25 - m, k) / C(25, k);
      const ev = pSurvive * mines.multiplierFor(m, k);
      assert.ok(ev <= 0.99 + 1e-9 && ev > 0.98, `mines ${m}/${k}: ${ev}`);
    }
});

test('dragon tower multipliers give 98%', () => {
  for (const [d, { cols, safe }] of Object.entries(tower.DIFFICULTIES))
    for (let level = 1; level <= tower.ROWS; level++) {
      const ev = (safe / cols) ** level * tower.multiplierFor(d, level);
      assert.ok(ev <= 0.98 + 1e-9 && ev > 0.975, `tower ${d}/${level}: ${ev}`);
    }
});

test('hilo steps pay 99% of fair odds', () => {
  for (const rank of ['A', '5', 'K']) {
    const card = { rank, suit: 'spades' };
    for (const g of hilo.options(card)) near(hilo.probability(card, g) * hilo.stepMultiplier(card, g), 0.99, 1e-9, `hilo ${rank} ${g}`);
  }
});

test('every roulette bet returns 36/37', () => {
  assert.equal(Object.keys(roulette.BETS).length, 157);
  for (const key of Object.keys(roulette.BETS)) near((roulette.BETS[key].numbers.length / 37) * roulette.payoutFor(key), 36 / 37, 1e-9, key);
});

test('slot RTP is ~96.3% (exact line + scatter + free-spin calculation)', () => {
  const freq = slots.REELS.map((reel) => {
    const f = {};
    for (const s of reel) f[s] = (f[s] || 0) + 1 / reel.length;
    return f;
  });
  let lineEv = 0;
  const line = [];
  (function rec(i, p) {
    if (i === 5) {
      lineEv += p * (slots.evaluateLine(line)?.pay || 0);
      return;
    }
    for (const [s, q] of Object.entries(freq[i])) {
      line[i] = s;
      rec(i + 1, p * q);
    }
  })(0, 1);
  // Each reel shows at most one scatter (they are spaced apart), so P(scatter visible) = 3 × frequency.
  let dist = [1];
  for (const f of freq) {
    const p = 3 * (f.scatter || 0);
    const next = new Array(dist.length + 1).fill(0);
    dist.forEach((d, k) => {
      next[k] += d * (1 - p);
      next[k + 1] += d * p;
    });
    dist = next;
  }
  const scatterEv = dist.reduce((a, d, k) => a + d * slots.SCATTER_PAYS[Math.min(5, k)], 0);
  const pTrigger = dist.slice(3).reduce((a, b) => a + b, 0);
  const base = lineEv + scatterEv;
  const spins = slots.FREE_SPINS / (1 - slots.FREE_SPINS * pTrigger);
  const rtp = base + pTrigger * spins * slots.FREE_SPIN_MULTIPLIER * base;
  near(rtp, 0.963, 0.006, 'slots');
});
