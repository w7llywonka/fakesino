import { el } from '../dom.js';

// Shared plumbing for step-by-step games (bet → action… → cashout): request
// bookkeeping, restoring an unfinished round, and the multiplier ladder strip.

export function createRound(ctx, slug) {
  const { api } = ctx;
  const round = {
    game: null, // active round as the server reports it ({ amount, currency, params, state, actions })
    busy: false,
    get live() {
      return !!round.game && !round.game.state.done;
    },
    // Start a round. Resolves to the response, or to { restored } when an
    // unfinished round already exists on the server.
    async start(amount, params) {
      const res = await round.request(() => api.post(`/api/games/${slug}/bet`, { amount, currency: ctx.currency(), params }), true);
      return res;
    },
    act(action, data) {
      return round.request(() => api.post(`/api/games/${slug}/action`, data === undefined ? { action } : { action, data }));
    },
    async request(fn, starting = false) {
      round.busy = true;
      try {
        const res = await fn();
        round.game = res.bet ? null : res.game;
        return res;
      } catch (err) {
        if (starting && err.code === 'game_active' && err.data?.game) {
          round.game = err.data.game;
          return { restored: err.data.game };
        }
        if (err.code === 'no_game') round.game = null;
        throw err;
      } finally {
        round.busy = false;
      }
    },
    async resume() {
      if (!ctx.isAuthed() || round.game || round.busy) return null;
      try {
        const { game } = await api.get(`/api/games/${slug}/active`);
        if (game && !round.game) round.game = game;
        return game || null;
      } catch {
        return null;
      }
    },
  };
  return round;
}

// Horizontal multiplier ladder. steps: [{ m: multiplier, sub?: string }].
export function ladderStrip(fmt, steps, { label = (s) => fmt.multiplier(s.m) } = {}) {
  const root = el('<div class="ladder-strip" role="list"></div>');
  function build(list) {
    root.innerHTML = list.map((s, i) => `<div class="ladder-step" role="listitem" data-i="${i + 1}"><div class="m">${label(s)}</div>${s.sub ? `<div class="c">${s.sub}</div>` : ''}</div>`).join('');
  }
  build(steps);
  return {
    el: root,
    build,
    // `done` steps completed; `live` highlights the next one.
    update(done = 0, { live = false, lost = false, smooth = true } = {}) {
      root.querySelectorAll('.ladder-step').forEach((step) => {
        const i = Number(step.dataset.i);
        step.classList.toggle('done', i <= done);
        step.classList.toggle('next', live && i === done + 1);
        step.classList.toggle('lost', lost && i === done + 1);
      });
      const focus = root.querySelector(`.ladder-step[data-i="${Math.max(1, live || lost ? done + 1 : done)}"]`);
      if (focus) root.scrollTo({ left: focus.offsetLeft - root.clientWidth / 2 + focus.clientWidth / 2, behavior: smooth ? 'smooth' : 'auto' });
    },
  };
}

// Promise-based delay that is cancelled when the game unmounts.
export function timers() {
  const set = new Set();
  return {
    wait: (ms) =>
      new Promise((resolve) => {
        const t = setTimeout(() => {
          set.delete(t);
          resolve();
        }, ms);
        set.add(t);
      }),
    clear() {
      set.forEach(clearTimeout);
      set.clear();
    },
  };
}

export const chanceLabel = (p) => (p >= 0.0001 ? `${+(p * 100).toFixed(2)}%` : `${(p * 100).toExponential(1)}%`);
