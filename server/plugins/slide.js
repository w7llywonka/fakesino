import { RoundGame } from '../rounds.js';
import { badRequest } from '../http.js';
import { parseAmount } from '../accounts.js';
import { resultFromHmac, MIN_TARGET, MAX_TARGET } from '../../public/js/shared/games/slide.js';

// Slide: shared rounds where a strip of multipliers slides to a stop. Every
// bet picks a target; it wins amount × target when the result reaches it.
class SlideGame extends RoundGame {
  resultFor(hmacHex) {
    return resultFromHmac(hmacHex);
  }

  publicResult(result) {
    return { point: result };
  }

  parseBet(user, body, currency) {
    const amount = parseAmount(currency, body.amount ?? 0);
    const target = Math.floor(Number(body.target) * 100 + 1e-7) / 100;
    if (!Number.isFinite(target) || target < MIN_TARGET || target > MAX_TARGET) throw badRequest(`Target must be between ${MIN_TARGET}× and ${MAX_TARGET.toLocaleString('en-US')}×`);
    return { amount, params: { target } };
  }

  maxMultiplier(params) {
    return params.target;
  }

  payoutFor(bet, result) {
    return result >= bet.params.target ? bet.amount * bet.params.target : 0;
  }

  betMultiplier(bet, result) {
    return result >= bet.params.target ? bet.params.target : 0;
  }
}

export default function register({ router, store, live, engine, authed, betLimit, roundDown, timing }) {
  const game = new SlideGame({
    store,
    live,
    engine,
    roundDown,
    slug: 'slide',
    saltPhrase: 'fakesino slide salt · 2026-10-13',
    phases: { betting: 10000, playing: 5000, result: 3000, ...timing },
    maxBetsPerUser: 10,
  });
  game.routes(router, authed, betLimit);
  game.start();
  return { game, close: () => game.stop() };
}
