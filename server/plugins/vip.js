import { HttpError, badRequest } from '../http.js';
import { VIP_LEVELS, vipInfo, sumDays, dayKey, parseCurrency, credit, publicUser } from '../accounts.js';
import { roundDown, fromUsd } from '../../public/js/shared/currencies.js';
import { amountText } from '../notify.js';

const DAY = 86400000;
const OFFER_TTL = 90 * DAY;
const MIN_OFFER_USD = 0.01;

// Bonus rate by tier for weekly / monthly bonuses (share of the house edge you played).
export function rankRate(level) {
  if (level === 'Bronze') return 0.1;
  if (level === 'Silver') return 0.12;
  if (level === 'Gold') return 0.14;
  if (level.startsWith('Platinum')) return { 'Platinum I': 0.16, 'Platinum II': 0.17, 'Platinum III': 0.18, 'Platinum IV': 0.19 }[level] ?? 0.2;
  if (level.startsWith('Diamond') || level === 'Obsidian') return 0.25;
  return 0;
}

// Level-up rewards: Bronze $1, Silver $9, Gold $80, Platinum I $260, then doubling.
export function levelUpUsd(index) {
  const base = [0, 1, 9, 80, 260];
  return index < base.length ? base[index] : 260 * 2 ** (index - 4);
}

// Reload window for Platinum+: 14 days (Platinum I), 28 (II), 42 (III and up).
const reloadDays = (level) => (level === 'Platinum I' ? 14 : level === 'Platinum II' ? 28 : 42);

// The Saturday 12:30 UTC on or before `t`.
export function weeklyAt(t = Date.now()) {
  const d = new Date(t);
  const back = (d.getUTCDay() + 1) % 7; // days since Saturday
  let at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back, 12, 30);
  if (at > t) at -= 7 * DAY;
  return at;
}
// The 15th 12:30 UTC on or before `t`.
export function monthlyAt(t = Date.now()) {
  const d = new Date(t);
  let at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 15, 12, 30);
  if (at > t) at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 15, 12, 30);
  return at;
}

export default function register({ router, store, live, engine, payments, notify, authed }) {
  const runs = (store.data.vipRuns ||= { weekly: 0, monthly: 0 });
  let seq = 0;
  const id = () => `b${Date.now().toString(36)}${(++seq).toString(36)}`;

  function offer(user, kind, amountUsd, { releasedAt = Date.now(), expiresAt = releasedAt + OFFER_TTL, note = '' } = {}) {
    amountUsd = Math.floor(amountUsd * 100) / 100;
    if (amountUsd < MIN_OFFER_USD) return null;
    const o = { id: id(), kind, amountUsd, releasedAt, expiresAt, claimedAt: null, note };
    (user.bonusOffers ||= []).push(o);
    // Drop claimed or expired offers older than 120 days.
    user.bonusOffers = user.bonusOffers.filter((x) => !(x.claimedAt || x.expiresAt < Date.now()) || Date.now() - x.releasedAt < 120 * DAY);
    return o;
  }

  const LABEL = { weekly: 'Weekly bonus', monthly: 'Monthly bonus', levelup: 'Level-up bonus', reload: 'Reload', daily: 'Daily bonus' };
  function announce(user, o) {
    if (!o) return;
    if (o.releasedAt <= Date.now()) notify(user.id, { kind: 'bonus', category: 'rewards', title: `${LABEL[o.kind]} available`, message: `$${o.amountUsd.toFixed(2)} of play money is ready to claim.`, link: '/vip?tab=bonuses' });
  }

  // ---- level-up (from every settled bet) ----
  engine.onBet((bet, user) => {
    const v = vipInfo(user.stats.wageredUsd);
    // First time we see this wallet: its level before this bet.
    if (user.vipIndexSeen === undefined) user.vipIndexSeen = vipInfo(user.stats.wageredUsd - (bet.amountUsd || 0)).index;
    if (v.index > user.vipIndexSeen) {
      for (let i = user.vipIndexSeen + 1; i <= v.index; i++) announce(user, offer(user, 'levelup', levelUpUsd(i), { note: VIP_LEVELS[i].name }));
      notify(user.id, { kind: 'vip', category: 'rewards', title: `Welcome to ${v.level}!`, message: 'You reached a new VIP level. Check the VIP Club for your rewards.', link: '/vip' });
      user.vipIndexSeen = v.index;
      store.save();
    }
  });

  // ---- weekly (Sat 12:30 UTC) and monthly (15th 12:30 UTC) runs ----
  function runWeekly(at) {
    const from = at - 7 * DAY - 12.5 * 3600000; // previous Saturday 00:00
    const to = from + 7 * DAY; // through Friday
    for (const user of Object.values(store.data.users)) {
      const v = vipInfo(user.stats.wageredUsd);
      if (v.index < 1) continue;
      const edge = sumDays(user, from, to, 'edgeUsd');
      if (edge <= 0) continue;
      const profit = sumDays(user, from, to, 'profitUsd');
      announce(user, offer(user, 'weekly', edge * rankRate(v.level) * (profit < 0 ? 1.2 : 1), { releasedAt: at }));
      // Platinum+ also get a week of daily reload claims.
      if (v.level.startsWith('Platinum') || v.level.startsWith('Diamond') || v.level === 'Obsidian') {
        const span = reloadDays(v.level);
        const total = 0.1 * sumDays(user, to - span * DAY, to, 'edgeUsd');
        for (let i = 0; i < 7; i++) {
          const o = offer(user, 'reload', total / 7, { releasedAt: at + i * DAY, expiresAt: at + (i + 1) * DAY });
          if (i === 0) announce(user, o);
        }
      }
    }
    runs.weekly = at;
    store.save();
  }

  function runMonthly(at) {
    const from = at - 30 * DAY;
    for (const user of Object.values(store.data.users)) {
      const v = vipInfo(user.stats.wageredUsd);
      if (v.index < 1) continue;
      const edge = sumDays(user, from, at, 'edgeUsd');
      if (edge <= 0) continue;
      const profit = sumDays(user, from, at, 'profitUsd');
      const amount = edge * rankRate(v.level) * (profit < 0 ? 1.2 : 1);
      if (v.index >= 4) announce(user, offer(user, 'monthly', amount, { releasedAt: at }));
      else
        for (let i = 0; i < 5; i++) {
          const o = offer(user, 'monthly', amount / 5, { releasedAt: at + i * DAY, expiresAt: at + (i + 1) * DAY, note: `Day ${i + 1} of 5` });
          if (i === 0) announce(user, o);
        }
    }
    runs.monthly = at;
    store.save();
  }

  function tick(now = Date.now()) {
    const w = weeklyAt(now);
    if (runs.weekly < w) runWeekly(w);
    const m = monthlyAt(now);
    if (runs.monthly < m) runMonthly(m);
  }
  // First start: don't back-pay past periods.
  if (!runs.weekly) runs.weekly = weeklyAt();
  if (!runs.monthly) runs.monthly = monthlyAt();
  const timer = setInterval(() => tick(), 10 * 60000);
  timer.unref?.();

  // ---- daily bonus (Bronze+): 10% of yesterday's house edge, from 00:00 UTC ----
  function dailyStatus(user) {
    const v = vipInfo(user.stats.wageredUsd);
    const todayStart = Date.parse(`${dayKey()}T00:00:00Z`);
    const amountUsd = Math.floor(sumDays(user, todayStart - DAY, todayStart, 'edgeUsd') * 0.1 * 100) / 100;
    const claimed = user.dailyClaimDay === dayKey();
    return { unlocked: v.index >= 1, claimed, amountUsd, nextAt: todayStart + DAY };
  }

  function view(user) {
    const now = Date.now();
    const all = (user.bonusOffers || []).filter((o) => !o.claimedAt);
    return {
      offers: all.filter((o) => o.releasedAt <= now && o.expiresAt > now).sort((a, b) => a.expiresAt - b.expiresAt),
      upcoming: all.filter((o) => o.releasedAt > now).sort((a, b) => a.releasedAt - b.releasedAt),
      daily: dailyStatus(user),
      rakebackUnlocked: vipInfo(user.stats.wageredUsd).index >= 1 || !!user.welcomeCode,
      nextWeeklyAt: weeklyAt(now) + 7 * DAY,
      nextMonthlyAt: (() => {
        const m = new Date(monthlyAt(now));
        return Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 15, 12, 30);
      })(),
    };
  }

  function pay(user, kind, usd, currency, details = {}) {
    const amount = roundDown(currency, fromUsd(currency, usd));
    if (!(amount > 0)) throw badRequest('That bonus is too small to claim in this currency');
    credit(user, currency, amount);
    payments.addTx(user, { type: 'bonus', method: kind, status: 'completed', currency, amount, details: { usd, ...details } });
    store.save();
    live.toUser(user.id, 'balance', { currency, amount: user.balances[currency] });
    notify(user.id, { kind: 'bonus', category: 'rewards', title: `${LABEL[kind] || 'Bonus'} claimed`, message: `${amountText(amount, currency)} added to your wallet.`, link: '/transactions/bonuses' });
    return amount;
  }

  router.get('/api/bonus/offers', authed((ctx) => view(ctx.user)));

  router.post(
    '/api/bonus/claim',
    authed((ctx) => {
      const user = ctx.user;
      const currency = parseCurrency(user, ctx.body.currency);
      const o = (user.bonusOffers || []).find((x) => x.id === ctx.body.id);
      const now = Date.now();
      if (!o || o.claimedAt) throw new HttpError(404, 'The bonus cannot be found or is unavailable.');
      if (o.releasedAt > now) throw badRequest('This bonus is not available yet');
      if (o.expiresAt <= now) throw badRequest('This bonus has expired');
      o.claimedAt = now;
      const amount = pay(user, o.kind, o.amountUsd, currency, { offer: o.id });
      return { amount, currency, ...view(user), user: publicUser(user) };
    }),
  );

  router.post(
    '/api/bonus/daily',
    authed((ctx) => {
      const user = ctx.user;
      const st = dailyStatus(user);
      if (!st.unlocked) throw badRequest('The daily bonus unlocks at Bronze ($10,000 wagered)');
      if (st.claimed) throw badRequest('You already claimed today’s bonus', { retryIn: st.nextAt - Date.now() });
      if (st.amountUsd < MIN_OFFER_USD) throw badRequest('No daily bonus yet — it comes from what you played yesterday');
      const currency = parseCurrency(user, ctx.body.currency ?? user.currency);
      user.dailyClaimDay = dayKey();
      const amount = pay(user, 'daily', st.amountUsd, currency);
      return { amount, currency, ...view(user), user: publicUser(user) };
    }),
  );

  return { close: () => clearInterval(timer), runWeekly, runMonthly, tick, offer, view };
}
