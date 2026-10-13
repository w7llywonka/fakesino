import { RoundGame } from '../rounds.js';
import { badRequest } from '../http.js';
import { roundDown } from '../../public/js/shared/currencies.js';
import { resultFromHex, normalize, payout } from '../../public/js/shared/games/liveroulette.js';

// Live Roulette: one European wheel shared by every player, spun on a
// schedule. Chips are placed during the countdown; the spin comes from the
// game's hash chain like Slide and Zoo.
class LiveRouletteGame extends RoundGame {
  resultFor(hmacHex) {
    return resultFromHex(hmacHex);
  }

  parseBet(user, body, currency) {
    let chips;
    try {
      ({ chips } = normalize({ chips: body.chips }));
    } catch (err) {
      throw badRequest(err.message);
    }
    const rounded = {};
    let amount = 0;
    for (const [k, v] of Object.entries(chips)) {
      const a = roundDown(currency, v);
      if (a > 0) {
        rounded[k] = a;
        amount += a;
      }
    }
    if (!Object.keys(rounded).length) throw badRequest('Place a chip on the table');
    return { amount: roundDown(currency, amount + 1e-12), params: { chips: rounded } };
  }

  maxMultiplier() {
    return 36;
  }

  payoutFor(bet, result) {
    return payout(bet.params.chips, result.number);
  }

  betMultiplier(bet, result) {
    return bet.amount > 0 ? Math.round((payout(bet.params.chips, result.number) / bet.amount) * 10000) / 10000 : 0;
  }
}

export default function register({ router, store, live, engine, authed, betLimit, roundDown: rd, timing }) {
  const game = new LiveRouletteGame({
    store,
    live,
    engine,
    roundDown: rd,
    slug: 'liveroulette',
    saltPhrase: 'fakesino live roulette salt · 2026-10-13',
    phases: { betting: 15000, playing: 6000, result: 4000, ...timing },
    maxBetsPerUser: 5,
  });
  game.routes(router, authed, betLimit);
  game.start();
  return { game, close: () => game.stop() };
}
