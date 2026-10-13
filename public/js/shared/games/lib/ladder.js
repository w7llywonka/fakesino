import { fail, int, oneOf, round2h } from '../util.js';
import { shuffleSelect } from '../../fair.js';

// Hazard ladder shared by Chicken and Pump: N steps hide `hazards` dangers
// (chosen without replacement), you advance one step at a time and may cash
// out after any safe step. Multiplier after k safe steps:
//   round half up (0.98 × Π_{i<k} (N − i) / (N − B − i))
// which is exactly 0.98 ÷ P(first k steps safe).
export function makeLadder({ N, hazards, floats, edge = 0.02, stepAction }) {
  const DIFFICULTIES = Object.keys(hazards);
  const maxSteps = (d) => N - hazards[d];

  function multiplierFor(d, k) {
    if (k <= 0) return 1;
    const B = hazards[d];
    let m = 1 - edge;
    for (let i = 0; i < k; i++) m *= (N - i) / (N - B - i);
    return round2h(m);
  }

  const ladder = (d) => Array.from({ length: maxSteps(d) }, (_, i) => multiplierFor(d, i + 1));

  function normalize(params = {}) {
    const difficulty = oneOf(params.difficulty ?? DIFFICULTIES[0], 'difficulty', DIFFICULTIES);
    const autoTarget = params.autoTarget == null || params.autoTarget === '' ? null : int(Number(params.autoTarget), 'target', 1, maxSteps(difficulty));
    return { difficulty, autoTarget };
  }

  function start(rng, params) {
    const order = shuffleSelect(rng.take(floats), Array.from({ length: N }, (_, i) => i + 1));
    const dangers = order.slice(0, hazards[params.difficulty]).sort((a, b) => a - b);
    const state = { difficulty: params.difficulty, dangers, firstDanger: dangers[0], progress: 0, wager: 1, payout: 0, multiplier: 1, done: false, lost: false };
    if (params.autoTarget) {
      while (!state.done && state.progress < params.autoTarget) step(state);
      if (!state.done) cashout(state);
    }
    return state;
  }

  function step(state) {
    const next = state.progress + 1;
    if (next >= state.firstDanger) {
      state.progress = next;
      state.done = true;
      state.lost = true;
      state.multiplier = 0;
      state.payout = 0;
      return;
    }
    state.progress = next;
    state.multiplier = multiplierFor(state.difficulty, next);
    if (next === maxSteps(state.difficulty)) cashout(state);
  }

  function cashout(state) {
    if (!state.progress) fail('Take at least one step first');
    state.done = true;
    state.payout = state.multiplier;
  }

  return {
    DIFFICULTIES,
    N,
    hazards,
    maxSteps,
    multiplierFor,
    ladder,
    normalize,
    stateful: true,
    start,
    actions: (state) => (state.done ? [] : state.progress ? [stepAction, 'cashout'] : [stepAction]),
    cost: () => 0,
    act(state, action) {
      if (state.done) fail('Round is over');
      if (action === stepAction) step(state);
      else if (action === 'cashout') cashout(state);
      else fail('Unknown action');
      return state;
    },
    view: (state) => ({
      difficulty: state.difficulty,
      progress: state.progress,
      multiplier: state.multiplier,
      nextMultiplier: state.done ? null : multiplierFor(state.difficulty, state.progress + 1),
      done: state.done,
      lost: state.lost,
      // Hazards stay hidden until the round ends.
      dangers: state.done ? state.dangers : null,
    }),
    // Verifier: the full hazard layout for a seed.
    reveal: (rng, params) => {
      const s = start(rng, { ...params, autoTarget: null });
      return { title: 'Hazard positions', result: { ...s, multiplier: 0, dangers: s.dangers, progress: 0, done: true } };
    },
  };
}
