import test from 'node:test';
import assert from 'node:assert/strict';
import { SPORTS, LEAGUES, fixturesForSlot, parseMatchId, simulate, stateAt, markets, settleLeg, oddsFor, formatOdds, MARGIN, FLOAT_COUNT } from '../public/js/shared/sports.js';

// Deterministic PRNG for Monte Carlo checks (mulberry32).
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('fixtures are deterministic, distinct teams, and parse back from their id', () => {
  for (const league of LEAGUES) {
    const a = fixturesForSlot(league, 12345);
    assert.deepEqual(a, fixturesForSlot(league, 12345));
    const teams = a.flatMap((m) => [m.home, m.away]);
    assert.equal(new Set(teams).size, teams.length, league.id);
    for (const m of a) assert.deepEqual(parseMatchId(m.id), m);
  }
  assert.equal(parseMatchId('nope.1.0'), null);
  assert.equal(parseMatchId('pdl.1.9'), null);
});

test('simulated results match the pre-match prices for every sport', () => {
  const N = 30000;
  for (const league of LEAGUES.filter((l, i, arr) => arr.findIndex((x) => x.sport === l.sport) === i)) {
    const match = fixturesForSlot(league, 777)[0];
    const mkts = markets(match);
    const counts = {};
    const r = rng(42);
    for (let i = 0; i < N; i++) {
      const fl = Array.from({ length: FLOAT_COUNT }, r);
      const sim = simulate(match, fl);
      for (const m of mkts) for (const o of m.outcomes) if (settleLeg(match, sim.final, m.key, o.key) === 'won') counts[`${m.key}:${o.key}`] = (counts[`${m.key}:${o.key}`] || 0) + 1;
    }
    for (const m of mkts) {
      const sum = m.outcomes.reduce((a, o) => a + o.p, 0);
      if (m.key !== 'handicap') assert.ok(Math.abs(sum - (m.key === 'dc' ? 2 : 1)) < 1e-6, `${match.sport} ${m.key} sums to ${sum}`);
      for (const o of m.outcomes) {
        const freq = (counts[`${m.key}:${o.key}`] || 0) / N;
        // Normal approximations (basketball ties) get a little more room.
        const tol = match.sport === 'basketball' ? 0.02 : 0.012;
        assert.ok(Math.abs(freq - o.p) < tol, `${match.sport} ${m.key}:${o.key} model ${o.p.toFixed(4)} vs simulated ${freq.toFixed(4)}`);
      }
    }
  }
});

test('odds carry the margin and live states never leak the future', () => {
  assert.equal(oddsFor(0.5), Math.floor(100 / (0.5 * (1 + MARGIN))) / 100);
  assert.equal(oddsFor(0.995), null);
  assert.equal(formatOdds(2.5, 'fractional'), '3/2');
  assert.equal(formatOdds(2.5, 'american'), '+150');
  assert.equal(formatOdds(1.5, 'american'), '-200');
  const r = rng(7);
  for (const league of LEAGUES) {
    const match = fixturesForSlot(league, 99)[0];
    const sim = simulate(match, Array.from({ length: FLOAT_COUNT }, r));
    const s = SPORTS[match.sport];
    let prev = null;
    for (let t = 0; t < sim.durationMs; t += sim.durationMs / 50) {
      const st = stateAt(match, sim, t);
      assert.equal(st.status, 'live');
      if (prev) assert.ok(st.score.home >= prev.score.home && st.score.away >= prev.score.away, `${league.id} score never goes backwards`);
      if (s.model === 'goals') assert.ok(st.events.every((e) => e.t <= t / s.durationMs));
      for (const m of markets(match, st)) for (const o of m.outcomes) assert.ok(o.p >= -1e-9 && o.p <= 1 + 1e-9);
      prev = st;
    }
    const end = stateAt(match, sim, sim.durationMs);
    assert.equal(end.status, 'ended');
    assert.deepEqual(end.score, sim.final);
    assert.equal(stateAt(match, sim, -1).status, 'upcoming');
  }
});
