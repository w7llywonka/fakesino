import crypto from 'node:crypto';
import { sha256, randomHex } from './fair.js';
import { badRequest } from './http.js';
import { parseCurrency, credit, debit, assertNotOnBreak } from './accounts.js';
import { assertStake, capPayout } from './limits.js';

const CHAIN_LENGTH = 20000;

// Shared-round game loop used by Slide and Zoo (Crash predates it). Each game
// has its own pre-generated SHA-256 chain played in reverse, a fixed public
// salt, and three phases: betting → playing → result.
//
// Subclasses implement:
//   resultFor(hmacHex)            → the round result from HMAC_SHA256(hash, salt)
//   parseBet(user, body)          → { amount, params } (amount in the bet currency)
//   payoutFor(bet, result)        → payout in the bet currency (before rounding)
//   betMultiplier(bet, result)    → multiplier recorded on the bet
export class RoundGame {
  constructor({ store, live, engine, slug, saltPhrase, phases, maxBetsPerUser = 10, roundDown }) {
    this.store = store;
    this.live = live;
    this.engine = engine;
    this.slug = slug;
    this.saltPhrase = saltPhrase;
    this.phases = phases; // { betting, playing, result } in ms
    this.maxBetsPerUser = maxBetsPerUser;
    this.roundDown = roundDown;
    this.bets = []; // current round
    this.queue = []; // next round
    this.seq = 0;
    this.timer = null;
    this.round = null;
    this.ensureChain();
    this.refundPending();
  }

  get salt() {
    return crypto.createHash('sha256').update(this.saltPhrase).digest('hex');
  }

  ensureChain() {
    let c = this.store.data[this.slug];
    if (!c || c.index >= c.length) {
      c = this.store.data[this.slug] = {
        seed: randomHex(),
        length: CHAIN_LENGTH,
        index: 0,
        salt: this.salt,
        history: c?.history || [],
        pending: c?.pending || [],
        terminatingHash: null,
        chainNo: (c?.chainNo || 0) + 1,
      };
    }
    const chain = new Array(c.length + 1);
    chain[0] = c.seed;
    for (let i = 1; i <= c.length; i++) chain[i] = sha256(chain[i - 1]);
    this.chain = chain;
    c.terminatingHash = chain[c.length];
    this.history = c.history || [];
    this.store.save();
  }

  nextHash() {
    if (this.store.data[this.slug].index >= this.store.data[this.slug].length) this.ensureChain();
    const c = this.store.data[this.slug];
    const hash = this.chain[c.length - 1 - c.index];
    c.index++;
    return { hash, salt: c.salt, id: `${c.chainNo}-${c.index}` };
  }

  hmac(hash, salt) {
    return crypto.createHmac('sha256', hash).update(salt).digest('hex');
  }

  // ---- lifecycle ----
  start() {
    this.beginBetting();
  }

  stop() {
    clearTimeout(this.timer);
    // Refund anything not yet settled so a restart never eats a bet.
    const unsettled = this.round?.phase === 'result' ? [] : this.bets;
    for (const b of [...unsettled, ...this.queue]) {
      const user = this.store.data.users[b.userId];
      if (user) credit(user, b.currency, b.amount);
    }
    this.bets = [];
    this.queue = [];
    this.persistPending([]);
    this.store.save();
  }

  // Unsettled stakes are mirrored into the store so that a crash (not just a
  // clean stop) refunds them on the next start.
  persistPending(list = [...this.bets, ...this.queue]) {
    this.store.data[this.slug].pending = list.map(({ userId, currency, amount }) => ({ userId, currency, amount }));
  }

  refundPending() {
    const c = this.store.data[this.slug];
    for (const b of c.pending || []) {
      const user = this.store.data.users[b.userId];
      if (user) credit(user, b.currency, b.amount);
    }
    c.pending = [];
  }

  schedule(fn, ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(fn, ms);
  }

  beginBetting() {
    const { hash, salt, id } = this.nextHash();
    const now = Date.now();
    this.round = { id, hash, salt, phase: 'betting', startedAt: now, endsAt: now + this.phases.betting, result: null };
    this.bets = this.queue.map((b) => ({ ...b, roundId: id }));
    this.queue = [];
    this.broadcastState();
    this.schedule(() => this.beginPlaying(), this.phases.betting);
  }

  beginPlaying() {
    const r = this.round;
    r.phase = 'playing';
    r.result = this.resultFor(this.hmac(r.hash, r.salt));
    r.playingAt = Date.now();
    r.endsAt = r.playingAt + this.phases.playing;
    this.broadcastState();
    this.schedule(() => this.settle(), this.phases.playing);
  }

  settle() {
    const r = this.round;
    r.phase = 'result';
    r.endsAt = Date.now() + this.phases.result;
    const pushes = new Map(); // userId → currencies to push
    for (const b of this.bets) {
      const user = this.store.data.users[b.userId];
      if (!user) continue;
      const payout = capPayout(b.currency, b.amount, this.roundDown(b.currency, this.payoutFor(b, r.result)));
      if (payout > 0) {
        credit(user, b.currency, payout);
        if (!pushes.has(user.id)) pushes.set(user.id, new Set());
        pushes.get(user.id).add(b.currency);
      }
      b.payout = payout;
      b.record = this.engine.recordBet(user, {
        game: this.slug,
        currency: b.currency,
        amount: b.amount,
        payout,
        params: b.params,
        result: { ...this.publicResult(r.result), multiplier: this.betMultiplier(b, r.result) },
        seed: { roundId: r.id, hash: r.hash, salt: r.salt },
      });
    }
    for (const [userId, currencies] of pushes) for (const currency of currencies) this.live.toUser(userId, 'balance', { currency, amount: this.store.data.users[userId].balances[currency] });
    this.persistPending([]);
    this.history.unshift({ id: r.id, hash: r.hash, result: this.publicResult(r.result), at: Date.now() });
    this.history.length = Math.min(this.history.length, 100);
    this.store.data[this.slug].history = this.history;
    this.store.save();
    this.broadcastState();
    this.schedule(() => this.beginBetting(), this.phases.result);
  }

  // ---- betting ----
  placeBet(user, body) {
    assertNotOnBreak(user);
    const currency = parseCurrency(user, body.currency);
    const { amount, params } = this.parseBet(user, body, currency);
    assertStake(currency, amount, this.maxMultiplier?.(params) ?? null);
    const joinNow = this.round?.phase === 'betting';
    const list = joinNow ? this.bets : this.queue;
    if (list.filter((b) => b.userId === user.id).length >= this.maxBetsPerUser) throw badRequest(`Up to ${this.maxBetsPerUser} bets per round`);
    debit(user, currency, amount);
    const bet = {
      id: `${this.slug}-${Date.now().toString(36)}-${++this.seq}`,
      userId: user.id,
      publicName: user.settings?.privateMode ? null : user.username,
      currency,
      amount,
      params,
      roundId: joinNow ? this.round.id : null,
      payout: null,
    };
    list.push(bet);
    this.persistPending();
    this.store.save();
    if (joinNow) this.live.channel(this.slug, 'bet', this.publicBet(bet));
    return { queued: !joinNow, bet: this.publicBet(bet), balance: { currency, amount: user.balances[currency] }, state: this.stateFor(user) };
  }

  cancelBet(user, body) {
    const id = String(body.betId || '');
    const pick = (list) => list.findIndex((b) => b.userId === user.id && (!id || b.id === id));
    let list = this.queue;
    let i = pick(list);
    if (i < 0 && this.round?.phase === 'betting') {
      list = this.bets;
      i = pick(list);
    }
    if (i < 0) throw badRequest('No bet to cancel');
    const [b] = list.splice(i, 1);
    credit(user, b.currency, b.amount);
    this.persistPending();
    this.store.save();
    if (list === this.bets) this.live.channel(this.slug, 'cancel', { roundId: this.round.id, id: b.id });
    return { balance: { currency: b.currency, amount: user.balances[b.currency] }, state: this.stateFor(user) };
  }

  // ---- views ----
  publicResult(result) {
    return result;
  }

  publicBet(b) {
    return { id: b.id, roundId: b.roundId, username: b.publicName, currency: b.currency, amount: b.amount, params: b.params, payout: b.payout, betId: b.record?.id ?? null };
  }

  snapshot() {
    const r = this.round;
    const revealed = r && r.phase !== 'betting';
    return {
      serverTime: Date.now(),
      phases: this.phases,
      round: r && {
        id: r.id,
        phase: r.phase,
        startedAt: r.startedAt,
        endsAt: r.endsAt,
        result: revealed ? this.publicResult(r.result) : null,
        hash: revealed ? r.hash : null,
      },
      bets: this.bets.map((b) => this.publicBet(b)),
      history: this.history.slice(0, 30).map(({ id, hash, result }) => ({ id, hash, result })),
    };
  }

  broadcastState() {
    this.live.channel(this.slug, 'state', this.snapshot());
  }

  stateFor(user) {
    const snap = this.snapshot();
    if (user) {
      const ids = (list) => list.filter((b) => b.userId === user.id).map((b) => b.id);
      snap.me = { bets: ids(this.bets), queued: this.queue.filter((b) => b.userId === user.id).map((b) => this.publicBet(b)) };
    }
    return snap;
  }

  fairness() {
    const c = this.store.data[this.slug];
    return {
      terminatingHash: c.terminatingHash,
      salt: c.salt,
      chainLength: c.length,
      played: c.index,
      history: this.history.slice(0, 50).map(({ id, hash, result }) => ({ id, hash, result })),
    };
  }

  // Routes: /api/<slug>/state, /bet, /cancel and /api/fair/<slug>.
  routes(router, authed, betLimit) {
    router.get(`/api/${this.slug}/state`, (ctx) => this.stateFor(ctx.user));
    router.post(
      `/api/${this.slug}/bet`,
      authed((ctx) => {
        betLimit?.(`bet:${ctx.user.id}`);
        return this.placeBet(ctx.user, ctx.body);
      }),
    );
    router.post(`/api/${this.slug}/cancel`, authed((ctx) => this.cancelBet(ctx.user, ctx.body)));
    router.get(`/api/fair/${this.slug}`, () => this.fairness());
  }
}

