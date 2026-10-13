import { credit, parseCurrency } from '../accounts.js';
import { CATALOG } from '../catalog.js';
import { CURRENCIES, roundDown } from '../../public/js/shared/currencies.js';
import { badRequest, HttpError } from '../http.js';

// Affiliate program (play money). Players share a campaign link
// (/?c=CODE); wallets created from it are referred to that campaign, and the
// owner earns commission on their play:
//   commission = house edge × wagered ÷ 2 × 10%
export const COMMISSION_RATE = 0.1;
const ATTACH_WINDOW = 24 * 3600000; // a new wallet can be referred within its first day
const MAX_CAMPAIGNS = 20;
const CODE_RE = /^[a-z0-9_-]{3,24}$/;
const MIN_CLAIM_USD = 0.01;

export default function register({ router, store, engine, payments, authed, publicUser, notify }) {
  const data = (store.data.affiliate ||= { codes: {} }); // code → { ownerId, campaignId }
  const fromUsd = (c, usd) => usd / CURRENCIES[c].usd;

  const campaignsOf = (u) => (u.campaigns ||= []);
  function stats(owner, campaignId = null) {
    const out = { referrals: 0, wageredUsd: 0, commissionUsd: 0, deposits: 0 };
    for (const r of owner.referrals || []) {
      if (campaignId && r.campaignId !== campaignId) continue;
      out.referrals++;
      out.wageredUsd += r.wageredUsd;
      out.commissionUsd += r.commissionUsd;
      out.deposits += r.deposits || 0;
    }
    return out;
  }
  const round2 = (n) => Math.floor(n * 100) / 100;
  const round4 = (n) => Math.round(n * 1e4) / 1e4;

  function view(user) {
    const campaigns = campaignsOf(user).map((c) => {
      const s = stats(user, c.id);
      return { ...c, referrals: s.referrals, wageredUsd: round2(s.wageredUsd), commissionUsd: round4(s.commissionUsd) };
    });
    const t = stats(user);
    const aff = (user.affiliate ||= { earnedUsd: 0, claimedUsd: 0 });
    return {
      rate: COMMISSION_RATE,
      campaigns,
      totals: { referrals: t.referrals, wageredUsd: round2(t.wageredUsd), commissionUsd: round4(aff.earnedUsd), claimedUsd: round4(aff.claimedUsd), availableUsd: round4(aff.earnedUsd - aff.claimedUsd) },
      referred: (user.referrals || [])
        .slice()
        .reverse()
        .slice(0, 100)
        .map((r) => {
          const u = store.data.users[r.userId];
          return { username: u && !u.settings?.privateMode ? u.username : null, campaign: campaignsOf(user).find((c) => c.id === r.campaignId)?.name || '', joinedAt: r.joinedAt, wageredUsd: round2(r.wageredUsd), commissionUsd: round4(r.commissionUsd) };
        }),
      referredBy: user.referrer ? { campaign: user.referrer.code } : null,
    };
  }

  router.get('/api/affiliate', authed((ctx) => view(ctx.user)));

  router.post(
    '/api/affiliate/campaigns',
    authed((ctx) => {
      const user = ctx.user;
      const name = String(ctx.body.name || '').trim();
      const code = String(ctx.body.code || '').trim().toLowerCase();
      if (!name || name.length > 32) throw badRequest('Name must be 1–32 characters', { field: 'name' });
      if (!CODE_RE.test(code)) throw badRequest('Use 3–24 letters, numbers, - or _', { field: 'code' });
      if (data.codes[code]) throw badRequest('That campaign code is taken', { field: 'code' });
      if (campaignsOf(user).length >= MAX_CAMPAIGNS) throw badRequest(`You can have up to ${MAX_CAMPAIGNS} campaigns`);
      const c = { id: `${user.id}-${campaignsOf(user).length + 1}-${code}`, name, code, createdAt: Date.now() };
      campaignsOf(user).push(c);
      data.codes[code] = { ownerId: user.id, campaignId: c.id };
      store.save();
      return view(user);
    }),
  );

  // A newly created wallet that arrived through a campaign link.
  router.post(
    '/api/affiliate/attach',
    authed((ctx) => {
      const user = ctx.user;
      const code = String(ctx.body.code || '').trim().toLowerCase();
      const ref = data.codes[code];
      if (!ref) throw new HttpError(404, 'Unknown campaign code');
      if (user.referrer) throw badRequest('This wallet already has a referrer');
      if (ref.ownerId === user.id) throw badRequest('You can’t refer yourself');
      if (Date.now() - user.createdAt > ATTACH_WINDOW || user.stats.bets > 0) throw badRequest('Only new wallets can join through a referral link');
      const owner = store.data.users[ref.ownerId];
      if (!owner) throw new HttpError(404, 'Unknown campaign code');
      if (owner.referrer?.ownerId === user.id) throw badRequest('You can’t join through a player you referred');
      user.referrer = { ownerId: owner.id, campaignId: ref.campaignId, code };
      (owner.referrals ||= []).push({ userId: user.id, campaignId: ref.campaignId, joinedAt: Date.now(), wageredUsd: 0, commissionUsd: 0 });
      store.save();
      notify(owner.id, { kind: 'affiliate', category: 'rewards', title: 'New referral', message: `A new player joined through your “${code}” campaign.`, link: '/affiliate/referred' });
      return { referredBy: { campaign: code }, user: publicUser(user) };
    }),
  );

  router.post(
    '/api/affiliate/claim',
    authed((ctx) => {
      const user = ctx.user;
      const currency = parseCurrency(user, ctx.body.currency);
      const aff = (user.affiliate ||= { earnedUsd: 0, claimedUsd: 0 });
      const usd = Math.floor((aff.earnedUsd - aff.claimedUsd) * 1e6) / 1e6;
      if (usd < MIN_CLAIM_USD) throw badRequest('Nothing to claim yet');
      const amount = roundDown(currency, fromUsd(currency, usd));
      if (!(amount > 0)) throw badRequest('That amount is too small to claim in this currency');
      const paidUsd = amount * CURRENCIES[currency].usd;
      aff.claimedUsd += paidUsd;
      credit(user, currency, amount);
      payments.addTx(user, { type: 'bonus', method: 'affiliate', status: 'completed', currency, amount, details: { usd: paidUsd } });
      store.save();
      return { amount, currency, ...view(user), user: publicUser(user) };
    }),
  );

  engine.onBet((bet, user) => {
    const ref = user.referrer;
    if (!ref) return;
    const owner = store.data.users[ref.ownerId];
    const r = owner?.referrals?.find((x) => x.userId === user.id);
    if (!r) return;
    const edge = CATALOG[bet.game]?.edge ?? 0.01;
    const commission = ((edge * bet.amountUsd) / 2) * COMMISSION_RATE;
    r.wageredUsd += bet.amountUsd;
    r.commissionUsd += commission;
    owner.affiliate ||= { earnedUsd: 0, claimedUsd: 0 };
    owner.affiliate.earnedUsd += commission;
  });

  return { close() {} };
}
