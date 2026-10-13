import crypto from 'node:crypto';
import { assertStake, capPayout } from './limits.js';
import { CURRENCIES, roundDown, toUsd } from '../public/js/shared/currencies.js';
import { GameRuleError } from '../public/js/shared/games/util.js';
import { GAMES, CATALOG } from './catalog.js';
import { createRng, takeNonce, revealedSeed } from './fair.js';
import { HttpError, badRequest } from './http.js';
import { parseCurrency, parseAmount, credit, debit, recordWagerStats, assertNotOnBreak } from './accounts.js';

export { GAMES, CATALOG } from './catalog.js';

function rules(fn) {
  try {
    return fn();
  } catch (err) {
    if (err instanceof GameRuleError) throw new HttpError(400, err.message);
    throw err;
  }
}

export function createEngine({ store, live }) {
  function getGame(slug) {
    const g = GAMES[slug];
    if (!g) throw new HttpError(404, 'Unknown game');
    return g;
  }

  function publicBet(bet) {
    const { userId, seed, ...rest } = bet;
    const user = store.data.users[userId];
    const hidden = user?.settings?.privateMode;
    return { ...rest, username: hidden ? null : bet.username, hidden: !!hidden };
  }

  // Plugins (top wins, challenges, presence) observe every settled bet.
  const betListeners = [];
  const onBet = (fn) => betListeners.push(fn);

  function recordBet(user, { game, currency, amount, payout, params, result, seed, meta = {} }) {
    // The game's own multiplier, not payout ÷ stake: payouts are rounded down
    // to the currency's precision, which would understate small bets.
    const exact = result && result.payout == null && Number.isFinite(result.multiplier) ? result.multiplier : null;
    const multiplier = Math.round((exact ?? (amount > 0 ? payout / amount : 0)) * 10000) / 10000;
    const bet = {
      id: store.nextId('bet'),
      game,
      userId: user.id,
      username: user.username,
      currency,
      amount,
      payout,
      multiplier,
      profit: Math.round((payout - amount) * 10 ** CURRENCIES[currency].decimals) / 10 ** CURRENCIES[currency].decimals,
      amountUsd: toUsd(currency, amount),
      createdAt: Date.now(),
      params,
      result,
      seed,
      rulesVersion: CATALOG[game]?.rulesVersion ?? 1,
      ...meta,
    };
    recordWagerStats(user, { game, currency, amount, payout, edge: CATALOG[game]?.edge ?? 0.01 });
    store.addBet(bet);
    live.broadcastOwned('bet', publicBet(bet), user.id);
    for (const fn of betListeners) {
      try {
        fn(bet, user);
      } catch (err) {
        console.error('[bet listener]', err);
      }
    }
    return bet;
  }

  function myBet(bet) {
    const { userId, ...rest } = bet;
    return rest;
  }

  function wagerFor(user, g, body, params) {
    const currency = parseCurrency(user, body.currency);
    if (g.module.chipGame) {
      // Chip games: the stake is the sum of chips, each rounded to the currency.
      const chips = {};
      let total = 0;
      for (const [k, v] of Object.entries(params.chips)) {
        const a = roundDown(currency, v);
        if (a > 0) {
          chips[k] = a;
          total += a;
        }
      }
      params.chips = chips;
      const amount = roundDown(currency, total);
      assertStake(currency, amount);
      return { currency, amount };
    }
    const amount = parseAmount(currency, body.amount ?? 0);
    assertStake(currency, amount, g.module.maxMultiplier ? g.module.maxMultiplier(params) : null);
    return { currency, amount };
  }

  function playInstant(user, slug, body) {
    const g = getGame(slug);
    assertNotOnBreak(user);
    if (g.module.stateful) return startStateful(user, slug, body);
    const params = rules(() => g.module.normalize(body.params || {}));
    const { currency, amount } = wagerFor(user, g, body, params);
    debit(user, currency, amount);
    const seed = takeNonce(user);
    const rng = createRng(seed);
    const result = rules(() => g.module.outcome(rng, params));
    const payout = capPayout(currency, amount, roundDown(currency, result.payout != null ? result.payout : amount * result.multiplier));
    credit(user, currency, payout);
    const bet = recordBet(user, {
      game: slug,
      currency,
      amount,
      payout,
      params,
      result,
      seed: { serverSeedHash: seed.serverSeedHash, clientSeed: seed.clientSeed, nonce: seed.nonce },
    });
    store.save();
    return { bet: myBet(bet), balance: { currency, amount: user.balances[currency] } };
  }

  // --- Stateful games -----------------------------------------------------------

  function activeView(g, game) {
    return {
      id: game.id,
      amount: game.amount,
      currency: game.currency,
      wager: game.state.wager,
      params: game.params,
      state: g.module.view(game.state),
      actions: g.module.actions(game.state),
    };
  }

  function finishStateful(user, slug, game) {
    const g = GAMES[slug];
    const { state, base, currency } = game;
    const amount = roundDown(currency, base * state.wager);
    const payout = capPayout(currency, amount, roundDown(currency, base * state.payout));
    credit(user, currency, payout);
    delete user.active[slug];
    const bet = recordBet(user, {
      game: slug,
      currency,
      amount,
      payout,
      params: game.params,
      result: { ...g.module.view(state), multiplier: state.wager ? state.payout / state.wager : 0 },
      seed: { serverSeedHash: game.seed.serverSeedHash, clientSeed: game.seed.clientSeed, nonce: game.seed.nonce },
      meta: { actions: game.log },
    });
    return bet;
  }

  function startStateful(user, slug, body) {
    const g = getGame(slug);
    assertNotOnBreak(user);
    if (user.active[slug]) throw new HttpError(409, 'You already have a game in progress', { code: 'game_active', game: activeView(g, user.active[slug]) });
    const params = rules(() => g.module.normalize(body.params || {}));
    const { currency, amount } = wagerFor(user, g, body, params);
    debit(user, currency, amount);
    const seed = takeNonce(user);
    const rng = createRng(seed);
    const state = rules(() => g.module.start(rng, params));
    const game = {
      id: crypto.randomUUID(),
      slug,
      base: amount,
      amount,
      currency,
      params,
      seed,
      cursor: rng.index,
      state,
      log: [],
      startedAt: Date.now(),
    };
    user.active[slug] = game;
    let bet = null;
    if (state.done) bet = finishStateful(user, slug, game);
    store.save();
    return {
      game: activeView(g, game),
      bet: bet && myBet(bet),
      balance: { currency, amount: user.balances[currency] },
    };
  }

  function actStateful(user, slug, body) {
    const g = getGame(slug);
    const game = user.active[slug];
    if (!game) throw new HttpError(404, 'No game in progress', { code: 'no_game' });
    const action = String(body.action || '');
    const data = body.data && typeof body.data === 'object' ? body.data : {};
    if (!g.module.actions(game.state).includes(action)) throw badRequest('That move is not available');
    const extraUnits = g.module.cost(game.state, action, data);
    let extra = 0;
    if (extraUnits > 0) {
      extra = roundDown(game.currency, game.base * extraUnits);
      debit(user, game.currency, extra);
    }
    const rng = createRng(game.seed, game.cursor);
    try {
      rules(() => g.module.act(game.state, action, data, rng));
    } catch (err) {
      if (extra) credit(user, game.currency, extra);
      throw err;
    }
    game.cursor = rng.index;
    game.log.push(data && Object.keys(data).length ? { action, data } : { action });
    game.amount = roundDown(game.currency, game.base * game.state.wager);
    let bet = null;
    if (game.state.done) bet = finishStateful(user, slug, game);
    store.save();
    return {
      game: activeView(g, game),
      bet: bet && myBet(bet),
      balance: { currency: game.currency, amount: user.balances[game.currency] },
    };
  }

  function getActive(user, slug) {
    const g = getGame(slug);
    const game = user.active[slug];
    return { game: game ? activeView(g, game) : null };
  }

  // --- Bet lookups ------------------------------------------------------------------

  function betDetails(viewer, id) {
    const bet = store.findBet(Number(id));
    if (!bet) throw new HttpError(404, 'Bet not found');
    const owner = store.data.users[bet.userId];
    const out = publicBet(bet);
    if (bet.seed) {
      const revealed = owner && bet.seed.serverSeedHash ? revealedSeed(owner, bet.seed.serverSeedHash) : null;
      out.seed = { ...bet.seed, serverSeed: revealed ? revealed.serverSeed : null };
    }
    out.mine = !!viewer && viewer.id === bet.userId;
    if (out.hidden && !out.mine) out.username = null;
    return out;
  }

  function myBets(user, { limit = 50, game } = {}) {
    const out = [];
    const bets = store.data.bets;
    for (let i = bets.length - 1; i >= 0 && out.length < limit; i--) {
      const b = bets[i];
      if (b.userId === user.id && (!game || b.game === game)) out.push(myBet(b));
    }
    return out;
  }

  function recentBets({ limit = 30, minUsd = 0, game } = {}) {
    const out = [];
    const bets = store.data.bets;
    for (let i = bets.length - 1; i >= 0 && out.length < limit; i--) {
      const b = bets[i];
      if (game && b.game !== game) continue;
      if (minUsd && b.amountUsd < minUsd) continue;
      out.push(publicBet(b));
    }
    return out;
  }

  return { playInstant, startStateful, actStateful, getActive, betDetails, myBets, recentBets, recordBet, publicBet, myBet, onBet };
}
