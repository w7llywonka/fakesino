import { credit } from '../accounts.js';
import { CATALOG } from '../catalog.js';

const WEEK = 7 * 86400000;
// Weekly rotation: first bet on the game with at least `minBetUsd` that hits
// `minMultiplier` wins `prizeUsd` of play money.
const TEMPLATES = [
  ['dice', 1000, 0.2, 25],
  ['limbo', 5000, 0.2, 50],
  ['plinko', 500, 0.2, 20],
  ['mines', 1000, 0.2, 25],
  ['keno', 500, 0.2, 20],
  ['wheel', 49.5, 0.5, 10],
  ['tower', 1000, 0.2, 25],
  ['crash', 1000, 0.2, 25],
  ['hilo', 500, 0.2, 20],
  ['slots', 500, 0.2, 20],
  ['roulette', 36, 1, 5],
  ['coinflip', 250.88, 0.2, 15],
  ['chicken', 1000, 0.2, 25],
  ['pump', 1000, 0.2, 25],
  ['slide', 1000, 0.2, 25],
  ['darts', 63, 0.2, 10],
];

// Weeks start on Monday 00:00 UTC.
function weekStart(now = Date.now()) {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

export default function register({ router, store, live, engine, payments, notify }) {
  const data = (store.data.challenges ||= { list: [], seq: 0 });

  function rotate(now = Date.now()) {
    const start = weekStart(now);
    let changed = false;
    for (const c of data.list) {
      if (c.status === 'active' && now >= c.endsAt) {
        c.status = 'finished';
        changed = true;
      }
    }
    if (!data.list.some((c) => c.startsAt === start)) {
      for (const [game, minMultiplier, minBetUsd, prizeUsd] of TEMPLATES) {
        if (!CATALOG[game]) continue;
        data.list.push({ id: ++data.seq, game, minMultiplier, minBetUsd, prizeUsd, startsAt: start, endsAt: start + WEEK, status: 'active', winner: null, betId: null });
      }
      changed = true;
    }
    // Keep the last eight weeks.
    const cutoff = start - 8 * WEEK;
    data.list = data.list.filter((c) => c.startsAt >= cutoff);
    if (changed) store.save();
  }
  rotate();
  const timer = setInterval(() => rotate(), 3600000);
  timer.unref?.();

  engine.onBet((bet, user) => {
    const now = Date.now();
    for (const c of data.list) {
      if (c.status !== 'active' || c.game !== bet.game || now < c.startsAt || now >= c.endsAt) continue;
      if (bet.amountUsd + 1e-9 < c.minBetUsd || bet.multiplier < c.minMultiplier || !(bet.payout > 0)) continue;
      c.status = 'finished';
      c.winner = { userId: user.id, name: user.username };
      c.betId = bet.id;
      c.finishedAt = now;
      credit(user, 'USD', c.prizeUsd);
      payments.addTx(user, { type: 'bonus', method: 'challenge', status: 'completed', currency: 'USD', amount: c.prizeUsd, details: { challengeId: c.id, game: c.game, betId: bet.id } });
      store.save();
      live.toUser(user.id, 'balance', { currency: 'USD', amount: user.balances.USD });
      live.channel('challenges', 'won', view(c), user.id);
      notify(user.id, { kind: 'challenge', category: 'rewards', title: `${CATALOG[c.game]?.name || c.game} challenge completed`, message: `You were first to hit ${c.minMultiplier}× and won $${c.prizeUsd} play money.`, link: '/challenges' });
      live.channel('challenges', 'finished', view(c));
    }
  });

  function view(c, viewer = null) {
    const winner = c.winner && store.data.users[c.winner.userId];
    const hidden = winner?.settings?.privateMode;
    return {
      id: c.id,
      game: c.game,
      minMultiplier: c.minMultiplier,
      minBetUsd: c.minBetUsd,
      prizeUsd: c.prizeUsd,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      finishedAt: c.finishedAt || null,
      status: c.status,
      winner: c.winner ? { name: hidden ? null : c.winner.name, hidden: !!hidden, me: !!viewer && viewer.id === c.winner.userId } : null,
      betId: c.betId,
    };
  }

  router.get('/api/challenges', (ctx) => {
    rotate();
    const status = ctx.query.get('status') || 'active';
    const game = ctx.query.get('game');
    let list = data.list;
    if (game) list = list.filter((c) => c.game === game);
    if (status === 'mine') list = ctx.user ? list.filter((c) => c.winner?.userId === ctx.user.id) : [];
    else list = list.filter((c) => c.status === status);
    list = [...list].sort((a, b) => (status === 'active' ? a.minMultiplier - b.minMultiplier : (b.finishedAt || b.endsAt) - (a.finishedAt || a.endsAt)));
    return { challenges: list.slice(0, 60).map((c) => view(c, ctx.user)) };
  });

  return { close: () => clearInterval(timer), rotate, data };
}
