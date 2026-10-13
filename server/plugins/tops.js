import { toUsd } from '../../public/js/shared/currencies.js';
import { CATALOG } from '../catalog.js';
import { badRequest } from '../http.js';

const KEEP = 100; // per game and list
const DAY = 86400000;
const LUCKY_MIN_USD = 0.1;

// Big Wins (largest payouts) and Lucky Wins (highest multipliers) per game.
// All-time lists are kept in the store; period views also scan recent bets.
export default function register({ router, store, engine }) {
  const tops = (store.data.tops ||= {});
  const forGame = (slug) => (tops[slug] ||= { big: [], lucky: [] });
  const score = { big: (e) => e.payoutUsd, lucky: (e) => e.multiplier };

  const entryOf = (bet) => ({
    id: bet.id,
    userId: bet.userId,
    username: bet.username,
    currency: bet.currency,
    amount: bet.amount,
    payout: bet.payout,
    multiplier: bet.multiplier,
    amountUsd: bet.amountUsd,
    payoutUsd: toUsd(bet.currency, bet.payout),
    createdAt: bet.createdAt,
  });
  const qualifies = (type, bet) => bet.payout > bet.amount && (type === 'big' || bet.amountUsd >= LUCKY_MIN_USD);

  function insert(list, entry, by) {
    if (list.length >= KEEP && by(entry) <= by(list[list.length - 1])) return;
    let i = list.findIndex((e) => by(entry) > by(e));
    if (i < 0) i = list.length;
    list.splice(i, 0, entry);
    if (list.length > KEEP) list.length = KEEP;
  }

  engine.onBet((bet) => {
    const t = forGame(bet.game);
    for (const type of ['big', 'lucky']) if (qualifies(type, bet)) insert(t[type], entryOf(bet), score[type]);
  });

  function view(e) {
    const hidden = store.data.users[e.userId]?.settings?.privateMode;
    const { userId, ...rest } = e;
    return { ...rest, username: hidden ? null : e.username, hidden: !!hidden };
  }

  function top(slug, type, period) {
    const by = score[type];
    let list = forGame(slug)[type];
    if (period !== 'all') {
      const since = Date.now() - (period === '60d' ? 60 : 30) * DAY;
      const seen = new Set();
      const merged = [];
      for (const e of list) if (e.createdAt >= since && !seen.has(e.id)) seen.add(e.id) && merged.push(e);
      const bets = store.data.bets;
      for (let i = bets.length - 1; i >= 0 && bets[i].createdAt >= since; i--) {
        const b = bets[i];
        if (b.game === slug && qualifies(type, b) && !seen.has(b.id)) {
          seen.add(b.id);
          merged.push(entryOf(b));
        }
      }
      list = merged.sort((a, b) => by(b) - by(a));
    }
    return list.slice(0, 10).map(view);
  }

  router.get('/api/games/:slug/top', (ctx) => {
    const slug = ctx.params.slug;
    if (!CATALOG[slug]) throw badRequest('Unknown game');
    const type = ctx.query.get('type') === 'lucky' ? 'lucky' : 'big';
    const period = ['30d', '60d', 'all'].includes(ctx.query.get('period')) ? ctx.query.get('period') : type === 'lucky' ? '60d' : '30d';
    return { type, period, wins: top(slug, type, period) };
  });
}
