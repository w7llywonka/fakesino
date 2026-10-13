import crypto from 'node:crypto';
import { HttpError, badRequest, rateLimiter } from '../http.js';
import { parseCurrency, credit } from '../accounts.js';
import { roundDown, fromUsd } from '../../public/js/shared/currencies.js';
import { amountText } from '../notify.js';
import { postSystem } from '../chatlog.js';

const DAY = 86400000;
const WELCOME_CODE = 'WELCOME';
const WELCOME_USD = 20;
const DROP_EVERY = 4 * 3600000;

// Promo codes (play money): a one-time welcome code for new wallets, and
// bonus drops that DropBot posts in chat every four hours.
export default function register({ router, store, live, payments, notify, authed, publicUser }) {
  const codes = (store.data.promoCodes ||= {});
  codes[WELCOME_CODE] ||= { code: WELCOME_CODE, kind: 'welcome', valueUsd: WELCOME_USD, maxClaims: null, claims: 0, expiresAt: null, minWager7dUsd: 0, claimedBy: [] };
  const limit = rateLimiter({ windowMs: 10000, max: 6 });

  function wager7d(userId) {
    const since = Date.now() - 7 * DAY;
    let usd = 0;
    const bets = store.data.bets;
    for (let i = bets.length - 1; i >= 0 && bets[i].createdAt >= since; i--) if (bets[i].userId === userId) usd += bets[i].amountUsd || 0;
    return usd;
  }

  function redeem(user, body) {
    const code = String(body.code || '').trim();
    const promo = codes[code] || codes[code.toUpperCase()];
    if (!promo || (promo.expiresAt && Date.now() > promo.expiresAt)) throw new HttpError(404, 'The bonus cannot be found or is unavailable.', { field: 'code' });
    if (promo.kind === 'welcome') {
      if (user.welcomeCode) throw badRequest('You already claimed the bonus.', { field: 'code' });
      if (Date.now() - user.createdAt > DAY) throw badRequest('The bonus cannot be found or is unavailable.', { field: 'code' });
    }
    if (promo.claimedBy.includes(user.id)) throw badRequest('You already claimed the bonus.', { field: 'code' });
    if (promo.maxClaims != null && promo.claims >= promo.maxClaims) throw badRequest('This code has been fully claimed.', { field: 'code' });
    if (promo.minWager7dUsd && wager7d(user.id) < promo.minWager7dUsd) throw badRequest('You have not met the weekly wager requirement to redeem this code.', { field: 'code' });
    const currency = parseCurrency(user, body.currency);
    const amount = roundDown(currency, fromUsd(currency, promo.valueUsd));
    promo.claims++;
    promo.claimedBy.push(user.id);
    if (promo.kind === 'welcome') user.welcomeCode = promo.code;
    credit(user, currency, amount);
    payments.addTx(user, { type: 'bonus', method: promo.kind === 'welcome' ? 'welcome' : 'drop', status: 'completed', currency, amount, details: { code: promo.code } });
    store.save();
    live.toUser(user.id, 'balance', { currency, amount: user.balances[currency] });
    notify(user.id, { kind: 'bonus', category: 'rewards', title: promo.kind === 'welcome' ? 'Welcome bonus claimed' : 'Bonus drop claimed', message: `${amountText(amount, currency)} play money added to your wallet.`, link: '/transactions/bonuses' });
    return { amount, currency, balance: { currency, amount: user.balances[currency] }, user: publicUser(user) };
  }

  router.post(
    '/api/offers/redeem',
    authed((ctx) => {
      limit(`offer:${ctx.user.id}`);
      return redeem(ctx.user, ctx.body);
    }),
  );
  router.get(
    '/api/offers',
    authed((ctx) => ({ welcome: { available: !ctx.user.welcomeCode && Date.now() - ctx.user.createdAt < DAY, claimed: ctx.user.welcomeCode || null, endsAt: ctx.user.createdAt + DAY, valueUsd: WELCOME_USD } })),
  );

  // DropBot: a $1 × 50-claim code with a 1 h expiry for players who wagered $10 this week.
  function drop() {
    const code = `DROP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    codes[code] = { code, kind: 'drop', valueUsd: 1, maxClaims: 50, claims: 0, expiresAt: Date.now() + 3600000, minWager7dUsd: 10, claimedBy: [] };
    for (const [k, c] of Object.entries(codes)) if (c.kind === 'drop' && c.expiresAt < Date.now() - DAY) delete codes[k];
    store.save();
    postSystem(store, live, 'en', 'DropBot: a new bonus drop is live — $1 play money for the first 50 players who wagered $10 this week. Use /drop', { kind: 'drop', code });
    return code;
  }
  const timer = setInterval(drop, DROP_EVERY);
  timer.unref?.();

  return { close: () => clearInterval(timer), drop, codes, redeem };
}
