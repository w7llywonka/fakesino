import crypto from 'node:crypto';
import { HttpError, badRequest } from '../http.js';
import { parseCurrency, parseAmount, credit, debit, assertNotOnBreak, recordWagerStats } from '../accounts.js';
import { assertStake, capPayout } from '../limits.js';
import { roundDown, toUsd } from '../../public/js/shared/currencies.js';
import { bytesToFloat } from '../../public/js/shared/fair.js';
import { amountText } from '../notify.js';
import { SPORTS, LEAGUES, FLOAT_COUNT, fixturesForSlot, parseMatchId, simulate, stateAt, markets, settleLeg } from '../../public/js/shared/sports.js';

// Play-money sportsbook: fictional leagues, simulated matches (seeded and
// verifiable), singles and multis, live betting and cash out.
const HORIZON_MS = 75 * 60000; // how far ahead fixtures are listed
const MAX_LEGS = 15;
const MAX_TOTAL_ODDS = 1000;
const CASHOUT_MARGIN = 0.05;
const SETTLE_MS = 1000;
const KEEP_SETTLED = 5000;

export default function register({ router, store, live, notify, authed, publicUser }) {
  const data = (store.data.sports ||= { secret: crypto.randomBytes(32).toString('hex'), bets: [] });
  const sims = new Map();

  const seedOf = (id) => crypto.createHmac('sha256', data.secret).update(id).digest('hex');
  const hashOf = (seed) => crypto.createHash('sha256').update(seed).digest('hex');
  function simOf(match) {
    let s = sims.get(match.id);
    if (!s) {
      const seed = seedOf(match.id);
      const fl = [];
      for (let r = 0; fl.length < FLOAT_COUNT; r++) {
        const buf = crypto.createHmac('sha256', seed).update(`sports:${r}`).digest();
        for (let i = 0; i < 8 && fl.length < FLOAT_COUNT; i++) fl.push(bytesToFloat(buf, i * 4));
      }
      s = { seed, seedHash: hashOf(seed), sim: simulate(match, fl) };
      if (sims.size > 4000) sims.clear();
      sims.set(match.id, s);
    }
    return s;
  }

  function view(match, now = Date.now(), { full = false } = {}) {
    const { seed, seedHash, sim } = simOf(match);
    const st = stateAt(match, sim, now - match.kickoff);
    const mk = markets(match, st);
    const out = {
      ...match,
      sportName: SPORTS[match.sport].name,
      status: st.status,
      clock: st.clock || null,
      period: st.period || null,
      score: st.score,
      periods: st.periods || null,
      events: full ? st.events || null : undefined,
      seedHash,
      seed: st.status === 'ended' ? seed : null,
      endsAt: st.status === 'ended' ? match.kickoff + sim.durationMs : null,
      marketCount: mk.length,
      markets: full ? mk.map(publicMarket) : mk.slice(0, 1).map(publicMarket),
    };
    return out;
  }
  const publicMarket = (m) => ({ key: m.key, name: m.name, line: m.line ?? null, outcomes: m.outcomes.map((o) => ({ key: o.key, name: o.name, odds: o.odds })) });

  // Fixtures from `from` to `to` (kick-off times), every league or one sport.
  function fixtures(from, to, sport = null) {
    const out = [];
    for (const l of LEAGUES) {
      if (sport && l.sport !== sport) continue;
      const first = Math.ceil((from - l.offsetMs) / l.slotMs);
      const last = Math.floor((to - l.offsetMs) / l.slotMs);
      for (let n = first; n <= last; n++) out.push(...fixturesForSlot(l, n));
    }
    return out.sort((a, b) => a.kickoff - b.kickoff || a.id.localeCompare(b.id));
  }
  const longest = Math.max(...Object.values(SPORTS).map((s) => s.durationMs)) * 1.5;

  function lobby(sport, now = Date.now()) {
    const all = fixtures(now - longest, now + HORIZON_MS, sport);
    const liveList = [];
    const upcoming = [];
    for (const m of all) {
      const v = view(m, now);
      if (v.status === 'live') liveList.push(v);
      else if (v.status === 'upcoming') upcoming.push(v);
    }
    return { live: liveList, upcoming: upcoming.slice(0, sport ? 60 : 40), serverTime: now };
  }

  router.get('/api/sports', () => {
    const now = Date.now();
    const lb = lobby(null, now);
    return {
      sports: Object.entries(SPORTS).map(([key, s]) => ({
        key,
        name: s.name,
        live: lb.live.filter((m) => m.sport === key).length,
        leagues: LEAGUES.filter((l) => l.sport === key).map((l) => ({ id: l.id, name: l.name, region: l.region })),
      })),
    };
  });
  router.get('/api/sports/lobby', (ctx) => {
    const sport = ctx.query.get('sport');
    if (sport && !SPORTS[sport]) throw new HttpError(404, 'Unknown sport');
    return lobby(sport || null);
  });
  router.get('/api/sports/match/:id', (ctx) => {
    const m = parseMatchId(ctx.params.id);
    if (!m) throw new HttpError(404, 'Match not found');
    return { match: view(m, Date.now(), { full: true }), serverTime: Date.now() };
  });

  // ---- betting ----
  function currentPrice(sel, now) {
    const m = parseMatchId(sel.matchId);
    if (!m) throw badRequest('That match no longer exists', { code: 'market_closed' });
    const { sim } = simOf(m);
    const st = stateAt(m, sim, now - m.kickoff);
    if (st.status === 'ended') return { match: m, state: st, outcome: null };
    const mk = markets(m, st).find((x) => x.key === sel.market);
    const o = mk?.outcomes.find((x) => x.key === sel.outcome);
    return { match: m, state: st, market: mk, outcome: o && o.odds ? o : null };
  }

  function publicBet(b) {
    const { userId, ...rest } = b;
    return { ...rest, cashout: b.status === 'open' ? cashoutValue(b) : null };
  }

  function cashoutValue(b, now = Date.now()) {
    let value = b.stake;
    for (const leg of b.legs) {
      if (leg.status === 'lost') return null;
      if (leg.status === 'won') {
        value *= leg.odds;
        continue;
      }
      const c = currentPrice(leg, now);
      if (!c.outcome) return null; // suspended or settling
      value *= leg.odds * c.outcome.p;
    }
    const offer = roundDown(b.currency, Math.min(value * (1 - CASHOUT_MARGIN), b.stake * b.odds));
    return offer > 0 ? offer : null;
  }

  router.post(
    '/api/sports/bet',
    authed((ctx) => {
      const user = ctx.user;
      assertNotOnBreak(user);
      const sels = Array.isArray(ctx.body.selections) ? ctx.body.selections : [];
      if (!sels.length) throw badRequest('Add a selection to your bet slip');
      if (sels.length > MAX_LEGS) throw badRequest(`A multi can have up to ${MAX_LEGS} selections`);
      if (new Set(sels.map((s) => s.matchId)).size !== sels.length) throw badRequest('Selections from the same match can’t be combined in a multi', { code: 'same_match' });
      const accept = ['any', 'higher', 'none'].includes(ctx.body.acceptOdds) ? ctx.body.acceptOdds : 'higher';
      const now = Date.now();
      const legs = [];
      const changed = [];
      for (const s of sels) {
        const c = currentPrice(s, now);
        if (!c.outcome) throw badRequest(`${c.match.home} vs ${c.match.away}: this market is closed or suspended`, { code: 'market_closed', matchId: s.matchId });
        const asked = Number(s.odds);
        const odds = c.outcome.odds;
        const ok = accept === 'any' || (accept === 'higher' ? odds >= asked - 1e-9 : Math.abs(odds - asked) < 1e-9);
        if (!ok) changed.push({ matchId: s.matchId, market: s.market, outcome: s.outcome, odds });
        legs.push({
          matchId: c.match.id,
          sport: c.match.sport,
          league: c.match.leagueName,
          home: c.match.home,
          away: c.match.away,
          kickoff: c.match.kickoff,
          market: c.market.key,
          marketName: c.market.name,
          outcome: c.outcome.key,
          outcomeName: c.outcome.name,
          odds,
          live: c.state.status === 'live',
          status: 'open',
        });
      }
      if (changed.length) throw new HttpError(409, 'Odds have changed. Review your bet slip.', { code: 'odds_changed', changes: changed });
      const odds = Math.round(legs.reduce((a, l) => a * l.odds, 1) * 100) / 100;
      if (odds > MAX_TOTAL_ODDS) throw badRequest(`Total odds can’t exceed ${MAX_TOTAL_ODDS}`);
      const currency = parseCurrency(user, ctx.body.currency);
      const stake = parseAmount(currency, ctx.body.stake);
      if (!(stake > 0)) throw badRequest('Enter a stake', { field: 'stake' });
      assertStake(currency, stake, odds);
      debit(user, currency, stake);
      const bet = {
        id: store.nextId('sbet'),
        userId: user.id,
        type: legs.length > 1 ? 'multi' : 'single',
        legs,
        odds,
        stake,
        currency,
        potential: roundDown(currency, stake * odds),
        status: 'open',
        payout: 0,
        createdAt: now,
        settledAt: null,
      };
      data.bets.push(bet);
      store.save();
      live.toUser(user.id, 'balance', { currency, amount: user.balances[currency] });
      return { bet: publicBet(bet), user: publicUser(user) };
    }),
  );

  router.get(
    '/api/sports/bets',
    authed((ctx) => {
      const status = ctx.query.get('status') === 'settled' ? 'settled' : 'active';
      const limit = Math.min(100, Number(ctx.query.get('limit')) || 50);
      const out = [];
      for (let i = data.bets.length - 1; i >= 0 && out.length < limit; i--) {
        const b = data.bets[i];
        if (b.userId !== ctx.user.id) continue;
        if ((status === 'active') !== (b.status === 'open')) continue;
        out.push(publicBet(b));
      }
      return { bets: out };
    }),
  );

  router.post(
    '/api/sports/cashout',
    authed((ctx) => {
      const b = data.bets.find((x) => x.id === Number(ctx.body.id) && x.userId === ctx.user.id);
      if (!b) throw new HttpError(404, 'Bet not found');
      if (b.status !== 'open') throw badRequest('This bet is already settled');
      const offer = cashoutValue(b);
      if (offer == null) throw badRequest('Cash out is unavailable right now', { code: 'cashout_unavailable' });
      if (ctx.body.amount != null && offer < Number(ctx.body.amount) * 0.99) throw new HttpError(409, 'The cash out value changed', { code: 'cashout_changed', cashout: offer });
      settleBet(b, 'cashout', offer);
      return { bet: publicBet(b), user: publicUser(ctx.user) };
    }),
  );

  function settleBet(b, status, payout) {
    const user = store.data.users[b.userId];
    b.status = status;
    b.payout = payout;
    b.settledAt = Date.now();
    if (user) {
      if (payout > 0) credit(user, b.currency, payout);
      recordWagerStats(user, { game: 'sports', currency: b.currency, amount: b.stake, payout, edge: 0.05 });
      live.toUser(user.id, 'balance', { currency: b.currency, amount: user.balances[b.currency] });
      live.toUser(user.id, 'sports:bet', publicBet(b));
      if (status === 'won') notify(user.id, { kind: 'sports', category: 'bets', title: 'Bet won', message: `${b.type === 'multi' ? `${b.legs.length}-fold multi` : `${b.legs[0].home} vs ${b.legs[0].away}`} paid ${amountText(payout, b.currency)}.`, link: '/sports/my-bets?tab=settled' });
    }
    store.save();
  }

  function settle(now = Date.now()) {
    for (const b of data.bets) {
      if (b.status !== 'open') continue;
      for (const leg of b.legs) {
        if (leg.status !== 'open') continue;
        const m = parseMatchId(leg.matchId);
        const { sim } = simOf(m);
        if (now - m.kickoff < sim.durationMs) continue;
        leg.status = settleLeg(m, sim.final, leg.market, leg.outcome);
        leg.result = { ...sim.final };
      }
      if (b.legs.some((l) => l.status === 'lost')) settleBet(b, 'lost', 0);
      else if (b.legs.every((l) => l.status === 'won')) settleBet(b, 'won', capPayout(b.currency, b.stake, b.potential));
    }
    // Trim old settled bets.
    if (data.bets.length > KEEP_SETTLED * 2) {
      const open = data.bets.filter((b) => b.status === 'open');
      const done = data.bets.filter((b) => b.status !== 'open').slice(-KEEP_SETTLED);
      data.bets = [...done, ...open].sort((a, b) => a.id - b.id);
    }
  }
  const timer = setInterval(() => settle(), SETTLE_MS);
  timer.unref?.();

  return { close: () => clearInterval(timer), settle, view, simOf, toUsd };
}
