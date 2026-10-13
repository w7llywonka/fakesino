import { HttpError, badRequest, rateLimiter } from '../http.js';
import { vipInfo, parseCurrency, parseAmount, credit, debit } from '../accounts.js';
import { CURRENCIES, roundDown, toUsd, fromUsd } from '../../public/js/shared/currencies.js';
import { amountText } from '../notify.js';
import { ROOMS, chatRooms, postChat, postSystem } from '../chatlog.js';
import { requireTwoFactor } from '../totp.js';

const TIP_DAILY_USD = 1000;
const TIP_MIN_USD = 0.01;
const RAIN_WINDOW = 30 * 60000;
const BOT_POOL_USD = 50;
const BOT_MAX_USERS = 20;
const BOT_MIN_WAGER_7D = 500;
const HOUR = 3600000;

// Chat (rooms, mentions, bet cards), tips, rain and the hourly RainBot.
// All amounts are play money.
export default function register({ router, store, live, engine, payments, notify, authed }) {
  const d = store.data;
  chatRooms(store);
  d.tipCaps ||= {}; // userId → { day, sentUsd, receivedUsd }
  const lastChat = new Map(); // userId → { at, room }
  const chatLimit = rateLimiter({ windowMs: 2000, max: 1 });
  const moneyLimit = rateLimiter({ windowMs: 10000, max: 5 });

  const room = (r) => (ROOMS[r] ? r : 'en');
  const displayName = (u) => (u.settings?.privateMode ? 'Hidden' : u.username);
  const userByName = (name) => {
    const id = d.usernames[String(name || '').replace(/^@/, '').toLowerCase()];
    return id != null ? d.users[id] : null;
  };

  const post = (roomKey, msg) => postChat(store, live, roomKey, msg);
  const system = (roomKey, text, extra = {}) => postSystem(store, live, roomKey, text, extra);

  // ---- chat ----
  router.get('/api/chat', (ctx) => {
    const r = room(ctx.query.get('room'));
    return { room: r, rooms: ROOMS, messages: d.chatRooms[r].slice(-60) };
  });

  router.post(
    '/api/chat',
    authed((ctx) => {
      chatLimit(`chat:${ctx.user.id}`);
      const r = room(ctx.body.room);
      const text = String(ctx.body.text || '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .trim()
        .slice(0, 200);
      if (!text) throw badRequest('Message is empty');
      const msg = { username: ctx.user.username, vip: vipInfo(ctx.user.stats.wageredUsd).level, text };
      // A shared bet travels as a card (public fields only).
      if (ctx.body.betId != null) {
        const b = store.findBet(Number(ctx.body.betId));
        if (b) msg.bet = { id: b.id, game: b.game, currency: b.currency, amount: b.amount, payout: b.payout, multiplier: b.multiplier };
      }
      const mentioned = new Set();
      for (const m of text.matchAll(/@([A-Za-z0-9_]{3,14})/g)) {
        const u = userByName(m[1]);
        if (u && u.id !== ctx.user.id) mentioned.add(u);
      }
      if (mentioned.size) msg.mentions = [...mentioned].map((u) => u.username);
      const out = post(r, msg);
      lastChat.set(ctx.user.id, { at: Date.now(), room: r });
      for (const u of mentioned) notify(u.id, { kind: 'mention', category: 'social', title: `${ctx.user.username} mentioned you`, message: text.slice(0, 120), link: null });
      return { message: out };
    }),
  );

  // ---- public profile ----
  router.get('/api/users/:name', (ctx) => {
    const u = userByName(ctx.params.name);
    if (!u) throw new HttpError(404, 'User not found');
    const hidden = u.settings?.privateMode && ctx.user?.id !== u.id;
    const vip = vipInfo(u.stats.wageredUsd);
    return {
      user: {
        username: u.username,
        joined: u.createdAt,
        vip: { level: vip.level, color: vip.color },
        hidden,
        stats: hidden ? null : { bets: u.stats.bets, wins: u.stats.wins, losses: u.stats.losses, wageredUsd: Math.round(u.stats.wageredUsd * 100) / 100 },
      },
    };
  });

  // ---- tips ----
  const today = () => new Date().toISOString().slice(0, 10);
  function caps(userId) {
    const c = d.tipCaps[userId];
    if (!c || c.day !== today()) d.tipCaps[userId] = { day: today(), sentUsd: 0, receivedUsd: 0 };
    return d.tipCaps[userId];
  }

  router.post(
    '/api/tips',
    authed((ctx) => {
      moneyLimit(`tip:${ctx.user.id}`);
      const from = ctx.user;
      const to = userByName(ctx.body.to);
      if (!to) throw badRequest('That user does not exist', { field: 'to' });
      if (to.id === from.id) throw badRequest('You cannot tip yourself', { field: 'to' });
      const currency = parseCurrency(from, ctx.body.currency);
      const amount = parseAmount(currency, ctx.body.amount ?? 0);
      const usd = toUsd(currency, amount);
      if (usd < TIP_MIN_USD) throw badRequest(`The minimum tip is ${amountText(roundDown(currency, fromUsd(currency, TIP_MIN_USD)) || 10 ** -CURRENCIES[currency].decimals, currency)}`, { field: 'amount' });
      const sc = caps(from.id);
      const rc = caps(to.id);
      if (sc.sentUsd + usd > TIP_DAILY_USD) throw badRequest(`You've reached your daily tip sending limit ($${TIP_DAILY_USD})`);
      if (rc.receivedUsd + usd > TIP_DAILY_USD) throw badRequest(`${to.username} has reached their daily tip receiving limit`);
      if (!(amount <= (from.balances[currency] || 0) + 1e-12)) throw badRequest('Insufficient balance', { field: 'amount', code: 'insufficient_balance' });
      requireTwoFactor(from, ctx.body.code);
      debit(from, currency, amount);
      credit(to, currency, amount);
      sc.sentUsd += usd;
      rc.receivedUsd += usd;
      const isPublic = !!ctx.body.public;
      payments.addTx(from, { type: 'tip', method: 'tip', status: 'completed', currency, amount, details: { direction: 'out', counterparty: to.username, public: isPublic } });
      payments.addTx(to, { type: 'tip', method: 'tip', status: 'completed', currency, amount, details: { direction: 'in', counterparty: displayName(from), public: isPublic } });
      store.save();
      live.toUser(from.id, 'balance', { currency, amount: from.balances[currency] });
      live.toUser(to.id, 'balance', { currency, amount: to.balances[currency] });
      notify(to.id, { kind: 'tip', category: 'social', title: 'You received a tip', message: `@${displayName(from)} tipped you ${amountText(amount, currency)}`, link: '/transactions/tips' });
      if (isPublic) system(room(ctx.body.room), `${displayName(from)} tipped ${displayName(to)} ${amountText(amount, currency)}`, { kind: 'tip', amount, currency });
      return { balance: { currency, amount: from.balances[currency] } };
    }),
  );

  // ---- rain ----
  function rainTargets(roomKey, exclude, max, since = Date.now() - RAIN_WINDOW, filter = () => true) {
    const out = [];
    for (const [userId, c] of [...lastChat.entries()].sort((a, b) => b[1].at - a[1].at)) {
      if (out.length >= max) break;
      if (userId === exclude || c.at < since || (roomKey && c.room !== roomKey)) continue;
      const u = d.users[userId];
      if (u && filter(u)) out.push(u);
    }
    return out;
  }

  function payRain(to, currency, share, details) {
    credit(to, currency, share);
    payments.addTx(to, { type: 'rain', method: 'rain', status: 'completed', currency, amount: share, details: { direction: 'in', ...details } });
    live.toUser(to.id, 'balance', { currency, amount: to.balances[currency] });
    notify(to.id, { kind: 'rain', category: 'social', title: 'You caught the rain', message: `${details.from} rained ${amountText(share, currency)} on you`, link: '/transactions/tips' });
  }

  router.post(
    '/api/rain',
    authed((ctx) => {
      moneyLimit(`tip:${ctx.user.id}`);
      const from = ctx.user;
      const r = room(ctx.body.room);
      const currency = parseCurrency(from, ctx.body.currency);
      const amount = parseAmount(currency, ctx.body.amount ?? 0);
      const n = Math.round(Number(ctx.body.users) || 0);
      if (!(n >= 1 && n <= 50)) throw badRequest('Choose between 1 and 50 users', { field: 'users' });
      const targets = rainTargets(r, from.id, n);
      if (!targets.length) throw badRequest('Nobody has chatted here in the last 30 minutes');
      const share = roundDown(currency, amount / targets.length);
      if (toUsd(currency, share) < TIP_MIN_USD) throw badRequest('That amount is too small to split');
      const total = roundDown(currency, share * targets.length);
      if (!(total <= (from.balances[currency] || 0) + 1e-12)) throw badRequest('Insufficient balance', { field: 'amount', code: 'insufficient_balance' });
      requireTwoFactor(from, ctx.body.code);
      debit(from, currency, total);
      payments.addTx(from, { type: 'rain', method: 'rain', status: 'completed', currency, amount: total, details: { direction: 'out', users: targets.length } });
      for (const u of targets) payRain(u, currency, share, { from: displayName(from) });
      store.save();
      live.toUser(from.id, 'balance', { currency, amount: from.balances[currency] });
      system(r, `${displayName(from)} rained ${targets.length} user${targets.length > 1 ? 's' : ''} with ${amountText(total, currency)}`, { kind: 'rain', recipients: targets.map(displayName), amount: total, currency });
      return { users: targets.length, share, balance: { currency, amount: from.balances[currency] } };
    }),
  );

  // ---- RainBot: hourly play-money rain for active chatters who play ----
  function wager7d(userId) {
    const since = Date.now() - 7 * 86400000;
    let usd = 0;
    const bets = d.bets;
    for (let i = bets.length - 1; i >= 0 && bets[i].createdAt >= since; i--) if (bets[i].userId === userId) usd += bets[i].amountUsd || 0;
    return usd;
  }
  function rainBot() {
    const targets = rainTargets(null, null, BOT_MAX_USERS, Date.now() - HOUR, (u) => wager7d(u.id) >= BOT_MIN_WAGER_7D);
    if (!targets.length) return null;
    const currency = 'USDT';
    const share = roundDown(currency, fromUsd(currency, BOT_POOL_USD) / targets.length);
    for (const u of targets) {
      credit(u, currency, share);
      payments.addTx(u, { type: 'bonus', method: 'rain', status: 'completed', currency, amount: share, details: { from: 'RainBot' } });
      live.toUser(u.id, 'balance', { currency, amount: u.balances[currency] });
      notify(u.id, { kind: 'rain', category: 'rewards', title: 'RainBot rained on you', message: `You received ${amountText(share, currency)} from RainBot`, link: '/transactions/tips' });
    }
    store.save();
    system('en', `RainBot rained ${targets.length} user${targets.length > 1 ? 's' : ''} with $${BOT_POOL_USD}`, { kind: 'rain', recipients: targets.map(displayName), amount: BOT_POOL_USD, currency: 'USD' });
    return targets.length;
  }
  const timer = setInterval(rainBot, HOUR);
  timer.unref?.();

  return { close: () => clearInterval(timer), rainBot, system, lastChat };
}
