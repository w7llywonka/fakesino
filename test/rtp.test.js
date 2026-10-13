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
import * as flip from '../public/js/shared/games/coinflip.js';

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

test('dragon tower multipliers give ~98% (published round-half-up ladder)', () => {
  for (const [d, { cols, safe }] of Object.entries(tower.DIFFICULTIES))
    for (let level = 1; level <= tower.ROWS; level++) {
      const ev = (safe / cols) ** level * tower.multiplierFor(d, level);
      assert.ok(ev <= 0.985 && ev > 0.975, `tower ${d}/${level}: ${ev}`);
    }
  assert.deepEqual(Array.from({ length: 9 }, (_, k) => tower.multiplierFor('easy', k + 1)), [1.31, 1.74, 2.32, 3.1, 4.13, 5.51, 7.34, 9.79, 13.05]);
  assert.equal(tower.multiplierFor('expert', 7), 2143.26);
  assert.equal(tower.multiplierFor('master', 9), 256901.12);
});

test('flip ladder is 0.98 × 2^n, exactly the published values', () => {
  for (let n = 1; n <= flip.MAX_FLIPS; n++) near(0.5 ** n * flip.multiplierFor(n), 0.98, 1e-9, `flip ${n}`);
  assert.equal(flip.multiplierFor(20), 1027604.48);
});

test('precision helpers keep exact cents', () => {
  assert.equal(mines.multiplierFor(8, 15), 23794.65);
  assert.equal(mines.multiplierFor(14, 10), 294188.4);
  assert.equal(mines.multiplierFor(19, 5), 8766.45);
  assert.equal(dice.multiplierFor({ target: 50.5, condition: 'over' }), 2);
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

// ---- Newer originals ----
import * as chicken from '../public/js/shared/games/chicken.js';
import * as pump from '../public/js/shared/games/pump.js';
import * as diamonds from '../public/js/shared/games/diamonds.js';
import * as rps from '../public/js/shared/games/rps.js';
import * as moles from '../public/js/shared/games/moles.js';
import * as darts from '../public/js/shared/games/darts.js';
import * as tarot from '../public/js/shared/games/tarot.js';
import * as blitz from '../public/js/shared/games/blitz.js';
import * as lava from '../public/js/shared/games/lava.js';

test('chicken and pump ladders are 0.98 ÷ P(safe), rounded half up', () => {
  for (const [game, N] of [[chicken, 20], [pump, 25]])
    for (const d of game.DIFFICULTIES) {
      const B = { easy: 1, medium: 3, hard: 5, expert: 10 }[d];
      game.ladder(d).forEach((m, i) => {
        const p = C(N - B, i + 1) / C(N, i + 1);
        assert.ok(Math.abs(p * m - 0.98) <= p * 0.005 + 1e-12, `${d} step ${i + 1}: ${m}`);
      });
    }
  assert.deepEqual(chicken.DIFFICULTIES.map((d) => chicken.ladder(d).at(-1)), [19.6, 1117.2, 15193.92, 181060.88]);
  assert.deepEqual(pump.DIFFICULTIES.map((d) => pump.ladder(d).at(-1)), [24.5, 2254, 52067.4, 3203384.8]);
  assert.deepEqual(chicken.ladder('easy').slice(0, 3), [1.03, 1.09, 1.15]);
});

test('diamonds: paytable ways cover 7^5 and return 98.29%', () => {
  assert.equal(diamonds.PAYTABLE.reduce((a, r) => a + r.ways, 0), 7 ** 5);
  // Count every outcome rather than trusting the ways column.
  const counts = {};
  for (let i = 0; i < 7 ** 5; i++) {
    const gems = Array.from({ length: 5 }, (_, k) => diamonds.GEMS[Math.floor(i / 7 ** k) % 7]);
    const key = diamonds.classify(gems).row.key;
    counts[key] = (counts[key] || 0) + 1;
  }
  for (const r of diamonds.PAYTABLE) assert.equal(counts[r.key], r.ways, r.key);
  near(diamonds.PAYTABLE.reduce((a, r) => a + r.pays * r.ways, 0) / 7 ** 5, 0.9829, 0.0001, 'diamonds');
});

test('rock paper scissors pays 0.98 × 2^wins (draws replay)', () => {
  for (let w = 1; w <= rps.MAX_WINS; w++) near(rps.multiplierFor(w) / 2 ** w, 0.98, 0.005 / 2 ** w + 1e-12, `rps ${w}`);
  assert.equal(rps.multiplierFor(20), 1027604.48);
  assert.equal(rps.judge('rock', 'scissors'), 'win');
  assert.equal(rps.judge('rock', 'paper'), 'loss');
  assert.equal(rps.judge('paper', 'paper'), 'draw');
});

test('moles ladder is floor2(0.98 × (7/m)^h)', () => {
  for (let m = 1; m <= 6; m++)
    for (let h = 1; h <= moles.maxHits(m); h++) {
      const ev = (m / 7) ** h * moles.multiplierFor(m, h);
      assert.ok(ev <= 0.98 + 1e-9 && ev > 0.97, `moles ${m}/${h}: ${ev}`);
    }
  assert.equal(moles.multiplierFor(1, 8), 5649504.98);
  assert.equal(moles.multiplierFor(3, 9), 2009.17);
});

test('darts and tarot return exactly 98% on every difficulty', () => {
  for (const d of darts.DIFFICULTIES) {
    const { mult, prob } = darts.TABLES[d];
    near(prob.reduce((a, b) => a + b, 0), 100, 1e-6, `darts ${d} probabilities`);
    // Easy's thirds are published to 4 decimals.
    near(mult.reduce((a, m, i) => a + (m * prob[i]) / 100, 0), 0.98, 1e-5, `darts ${d}`);
  }
  for (const d of tarot.DIFFICULTIES) {
    const t = tarot.TABLES[d];
    const e = (rows) => rows.reduce((a, [m, p]) => a + (m * p) / 100, 0);
    for (const k of ['minor', 'major']) near(t[k].reduce((a, [, p]) => a + p, 0), 100, 1e-9, `tarot ${d} ${k}`);
    near(e(t.minor) ** 2 * e(t.major), 0.98, 1e-9, `tarot ${d}`);
  }
});

test('blitz multipliers are 0.98 ÷ P(all cards unique)', () => {
  for (let n = blitz.MIN_TARGET; n <= blitz.MAX_TARGET; n++) near(blitz.chanceFor(n) * blitz.multiplierFor(n), 0.98, blitz.chanceFor(n) * 0.005 + 1e-12, `blitz ${n}`);
  assert.equal(blitz.multiplierFor(5), 1.19);
  assert.equal(blitz.multiplierFor(36), 15181603.62);
});

test('floor is lava: each round pays 0.98 ÷ P(survive), levels compound', () => {
  for (const [d, { drop, rounds }] of Object.entries(lava.DIFFICULTIES)) {
    let p = 1;
    for (let level = 1; level <= lava.LEVELS; level++)
      for (let r = 1; r <= rounds; r++) {
        p *= (lava.TILES - r * drop) / (lava.TILES - (r - 1) * drop);
        const ev = p * lava.multiplierFor(d, level, r);
        assert.ok(ev <= 0.98 + 1e-9 && ev > 0.975, `lava ${d} L${level}R${r}: ${ev}`);
      }
  }
  assert.deepEqual(Object.keys(lava.DIFFICULTIES).map((d) => lava.multiplierFor(d, 3, lava.DIFFICULTIES[d].rounds)), [336.14, 922.36, 4270.22, 115296.02]);
});

test('dice range modes pay 99% of the true odds on 10,001 rolls', () => {
  const cases = [
    { condition: 'between', low: 25, high: 75 },
    { condition: 'between', low: 0, high: 0.01 },
    { condition: 'outside', low: 10, high: 90 },
    { condition: 'outside', low: 49, high: 51 },
    { condition: 'between2', low: 10, high: 20, low2: 20, high2: 35.55 },
  ];
  for (const p of cases) {
    const n = dice.normalize(p);
    let count = 0;
    for (let k = 0; k <= 10000; k++) if (dice.wins(n, k / 100)) count++;
    const ev = (count / 10001) * dice.multiplierFor(n);
    assert.ok(ev <= 0.99 && ev > 0.989, `${JSON.stringify(p)}: ${ev}`);
  }
  assert.throws(() => dice.normalize({ condition: 'between2', low: 10, high: 60, low2: 50, high2: 70 }), /overlap/);
  assert.throws(() => dice.normalize({ condition: 'outside', low: 1, high: 2 }), /Win chance/);
  assert.deepEqual(dice.normalize({ condition: 'over', target: 50.5, low: 3 }), { target: 50.5, condition: 'over' });
});
