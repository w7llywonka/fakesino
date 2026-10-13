import { credit } from '../accounts.js';
import { CURRENCIES, roundDown } from '../../public/js/shared/currencies.js';

// Daily wager race (play money): each UTC day, the 10 players who wager the
// most share the prize pool. Prizes are paid automatically when the day ends.
export const PRIZES = [800, 400, 250, 150, 100, 90, 80, 60, 40, 30];
const DAY = 86400000;
const KEEP_DAYS = 7;

const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const dayEnd = (key) => Date.parse(`${key}T00:00:00Z`) + DAY;

export default function register({ router, store, live, engine, payments, notify }) {
  const data = (store.data.race ||= { days: {}, results: {} }); // days[key][userId] = { usd, bets }

  engine.onBet((bet, user) => {
    const day = (data.days[dayKey(bet.createdAt)] ||= {});
    const e = (day[user.id] ||= { usd: 0, bets: 0 });
    e.usd += bet.amountUsd || 0;
    e.bets++;
  });

  const nameOf = (u) => (u && !u.settings?.privateMode && !u.settings?.hideRaceStats ? u.username : null);
  function standings(key) {
    return Object.entries(data.days[key] || {})
      .filter(([id]) => store.data.users[id])
      .sort((a, b) => b[1].usd - a[1].usd)
      .map(([id, e], i) => ({ userId: Number(id), rank: i + 1, wageredUsd: Math.round(e.usd * 100) / 100, bets: e.bets, prizeUsd: PRIZES[i] || 0 }));
  }
  const publicRow = (r) => ({ rank: r.rank, username: nameOf(store.data.users[r.userId]), wageredUsd: r.wageredUsd, bets: r.bets, prizeUsd: r.prizeUsd });

  // Pay every finished day that hasn't been paid yet.
  function settle(now = Date.now()) {
    const today = dayKey(now);
    let changed = false;
    for (const key of Object.keys(data.days)) {
      if (key >= today || data.results[key]) continue;
      const rows = standings(key).slice(0, PRIZES.length);
      for (const r of rows) {
        const u = store.data.users[r.userId];
        const currency = u.currency && CURRENCIES[u.currency] ? u.currency : 'USD';
        const amount = roundDown(currency, r.prizeUsd / CURRENCIES[currency].usd);
        if (!(amount > 0)) continue;
        credit(u, currency, amount);
        payments.addTx(u, { type: 'bonus', method: 'race', status: 'completed', currency, amount, details: { race: key, rank: r.rank, usd: r.prizeUsd } });
        live.toUser(u.id, 'balance', { currency, amount: u.balances[currency] });
        notify(u.id, { kind: 'race', category: 'rewards', title: `Daily Race: #${r.rank}`, message: `You finished #${r.rank} in the ${key} race and won $${r.prizeUsd} of play money.`, link: '/leaderboard' });
      }
      data.results[key] = rows.map(publicRow);
      changed = true;
    }
    // Keep a week of history.
    const cutoff = dayKey(now - KEEP_DAYS * DAY);
    for (const key of Object.keys(data.days)) if (key < cutoff && data.results[key]) delete data.days[key];
    for (const key of Object.keys(data.results)) if (key < cutoff) delete data.results[key];
    if (changed) store.save();
  }
  settle();
  const timer = setInterval(() => settle(), 60000);
  timer.unref?.();

  router.get('/api/race', (ctx) => {
    settle();
    const key = dayKey();
    const rows = standings(key);
    const mine = ctx.user ? rows.find((r) => r.userId === ctx.user.id) : null;
    const prev = Object.keys(data.results).sort().pop();
    return {
      id: key,
      endsAt: dayEnd(key),
      poolUsd: PRIZES.reduce((a, b) => a + b, 0),
      prizes: PRIZES,
      leaders: rows.slice(0, 10).map(publicRow),
      me: ctx.user ? (mine ? { rank: mine.rank, wageredUsd: mine.wageredUsd, prizeUsd: mine.prizeUsd } : { rank: null, wageredUsd: 0, prizeUsd: 0 }) : null,
      previous: prev ? { id: prev, leaders: data.results[prev] } : null,
    };
  });

  return { close: () => clearInterval(timer), settle, standings };
}
