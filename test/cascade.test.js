import test from 'node:test';
import assert from 'node:assert/strict';
import { outcome, COLS, ROWS, MIN_MATCH, PAYS, MAX_WIN, tierFor } from '../public/js/shared/games/cascade.js';

function rng(seed) {
  return {
    next: () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

test('cascade: tumbles remove every winning symbol and refill each column', () => {
  const r = rng(5);
  let checked = 0;
  for (let i = 0; i < 4000 && checked < 200; i++) {
    const o = outcome(r);
    for (const spin of o.spins)
      for (let k = 0; k + 1 < spin.steps.length; k++) {
        const { grid, wins } = spin.steps[k];
        const next = spin.steps[k + 1].grid;
        assert.ok(wins.length > 0);
        const gone = new Set(wins.map((w) => w.symbol));
        for (const w of wins) {
          assert.ok(w.count >= MIN_MATCH);
          assert.equal(w.pay, PAYS[w.symbol][tierFor(w.count)]);
        }
        for (let c = 0; c < COLS; c++) {
          assert.equal(next[c].length, ROWS);
          // Survivors keep their order at the bottom of the column.
          const kept = grid[c].filter((x) => !gone.has(x.s)).map((x) => x.s);
          assert.deepEqual(next[c].slice(ROWS - kept.length).map((x) => x.s), kept);
        }
        checked++;
      }
  }
  assert.ok(checked >= 100);
});

test('cascade: orbs only in free spins, which multiply that spin, and the max win is capped', () => {
  const r = rng(9);
  let freeRounds = 0;
  for (let i = 0; i < 20000; i++) {
    const o = outcome(r);
    assert.ok(o.multiplier <= MAX_WIN);
    const base = o.spins[0];
    assert.ok(base.steps.every((s) => s.grid.every((col) => col.every((x) => x.s !== 'orb'))));
    if (base.stars >= 4) {
      freeRounds++;
      assert.ok(o.spins.length > 1 && o.spins.slice(1).every((s) => s.free));
    } else assert.equal(o.spins.length, 1);
    for (const s of o.spins.slice(1)) {
      const expect = (s.orbSum > 0 && s.tumbleWin > 0 ? s.tumbleWin * s.orbSum : s.tumbleWin) + s.starPay;
      assert.ok(Math.abs(s.win - expect) < 1e-9);
    }
  }
  assert.ok(freeRounds > 20);
});

test('cascade: return to player is in the expected range (coarse Monte Carlo)', () => {
  const r = rng(77);
  const N = 120000;
  let total = 0;
  for (let i = 0; i < N; i++) total += outcome(r).multiplier;
  const rtp = (total / N) * 100;
  assert.ok(rtp > 88 && rtp < 106, `RTP ${rtp.toFixed(2)}%`);
});
