import { RoundGame } from '../rounds.js';
import { badRequest } from '../http.js';
import { parseAmount } from '../accounts.js';
import { ANIMALS, spinsFromBytes, counts, payoutFor, hexToBytes, PAY } from '../../public/js/shared/games/zoo.js';

// Zoo: shared rounds where three spins of a 20-tile ring pick animals. Bets
// spread chips across animals; each animal pays by how many spins land on it.
class ZooGame extends RoundGame {
  resultFor(hmacHex) {
    const tiles = spinsFromBytes(hexToBytes(hmacHex));
    return { tiles, counts: counts(tiles) };
  }

  parseBet(user, body, currency) {
    const raw = body.stakes && typeof body.stakes === 'object' ? body.stakes : null;
    if (!raw) throw badRequest('Place chips on at least one animal');
    const stakes = {};
    let amount = 0;
    for (const [animal, v] of Object.entries(raw)) {
      if (!ANIMALS.includes(animal)) throw badRequest('Unknown animal');
      const a = parseAmount(currency, v ?? 0);
      if (a > 0) {
        stakes[animal] = a;
        amount += a;
      }
    }
    if (!Object.keys(stakes).length) throw badRequest('Place chips on at least one animal');
    return { amount: parseAmount(currency, amount), params: { stakes } };
  }

  payoutFor(bet, result) {
    return payoutFor(bet.params.stakes, result.tiles);
  }

  betMultiplier(bet, result) {
    return bet.amount > 0 ? Math.round((payoutFor(bet.params.stakes, result.tiles) / bet.amount) * 10000) / 10000 : 0;
  }
}

export default function register({ router, store, live, engine, authed, betLimit, roundDown, timing }) {
  const game = new ZooGame({
    store,
    live,
    engine,
    roundDown,
    slug: 'zoo',
    saltPhrase: 'fakesino zoo salt · 2026-10-13',
    phases: { betting: 10000, playing: 4000, result: 3000, ...timing },
    maxBetsPerUser: 5,
  });
  game.routes(router, authed, betLimit);
  router.get('/api/zoo/paytable', () => ({ pay: PAY }));
  game.start();
  return { game, close: () => game.stop() };
}
