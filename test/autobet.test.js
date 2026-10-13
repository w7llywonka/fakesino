import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRunner, PRESETS } from '../public/js/shared/autobet.js';

const preset = (id) => PRESETS.find((p) => p.id === id);
const play = (strategy, base, results) => {
  const r = createRunner(strategy, base);
  return results.map((w) => r.record({ profit: w === 'W' ? 1 : w === 'L' ? -1 : 0 }).amount);
};

test('martingale doubles after each loss and resets on a win', () => {
  assert.deepEqual(play(preset('martingale'), { amount: 1 }, 'LLLWL'.split('')), [2, 4, 8, 1, 2]);
});

test('delayed martingale waits for a third loss in a row', () => {
  assert.deepEqual(play(preset('delayed-martingale'), { amount: 1 }, 'LLLLWLL'.split('')), [1, 1, 2, 4, 1, 1, 1]);
});

test('paroli doubles on wins and resets after three wins or any loss', () => {
  assert.deepEqual(play(preset('paroli'), { amount: 1 }, 'WWWWLW'.split('')), [2, 4, 1, 2, 1, 2]);
});

test("d'alembert adds a unit on loss, removes one on win, never below base", () => {
  assert.deepEqual(play(preset('dalembert'), { amount: 1 }, 'LLWWWL'.split('')), [2, 3, 2, 1, 1, 2]);
});

test('pushes change no streaks; profit conditions and stop', () => {
  const s = {
    blocks: [
      { type: 'bet', trigger: 'firstStreakOf', n: 2, event: 'wins', action: 'addToBet', value: 5 },
      { type: 'profit', cmp: 'gte', amount: 3, action: 'stop' },
    ],
  };
  const r = createRunner(s, { amount: 1 });
  assert.equal(r.record({ profit: 1 }).amount, 1);
  assert.equal(r.record({ profit: 0 }).amount, 1, 'a push keeps the streak at 1');
  const third = r.record({ profit: 1 });
  assert.equal(third.amount, 6, 'second win in a row fires once');
  assert.equal(third.stop, false);
  assert.equal(r.record({ profit: 1 }).stop, true, 'profit 3 reached');
});

test('win chance actions are relative or absolute', () => {
  const s = {
    blocks: [
      { type: 'bet', trigger: 'every', n: 1, event: 'losses', action: 'increaseWinChancePct', value: 10 },
      { type: 'bet', trigger: 'every', n: 1, event: 'wins', action: 'addToWinChance', value: 5 },
      { type: 'bet', trigger: 'every', n: 2, event: 'bets', action: 'switchOverUnder' },
    ],
  };
  const r = createRunner(s, { amount: 1, chance: 30 });
  assert.ok(Math.abs(r.record({ profit: -1 }).chance - 33) < 1e-9);
  const second = r.record({ profit: 1 });
  assert.ok(Math.abs(second.chance - 38) < 1e-9);
  assert.equal(second.switchOverUnder, true);
});
