import crypto from 'node:crypto';
import { crashPointFromHex, crashMultiplierAt, crashTimeFor } from '../public/js/shared/fair.js';
import { roundDown } from '../public/js/shared/currencies.js';
import { sha256, randomHex } from './fair.js';
import { HttpError, badRequest } from './http.js';
import { parseCurrency, parseAmount, credit, debit, assertNotOnBreak } from './accounts.js';

export const BETTING_MS = 6000;
export const CRASHED_MS = 3000;
export const TICK_MS = 50;
const CHAIN_LENGTH = 20000;
const MAX_AUTO = 1000000;

// The salt for new chains is fixed and public, so it is chosen independently
// of the (secret) chain seed: sha256 of a published phrase.
export const CRASH_SALT = crypto.createHash('sha256').update('fakesino crash salt · 2026-10-13').digest('hex');
export const CRASH_FORMULA = 2;

export function crashPointForHash(hash, salt, version = 1) {
  return crashPointFromHex(crypto.createHmac('sha256', hash).update(salt).digest('hex'), version);
}

// Multiplayer crash. Round hashes come from a pre-generated SHA-256 chain played
// in reverse, so sha256(hash of round n) === hash of round n-1 and the published
// terminating hash commits to every future round in advance.
export class CrashGame {
  constructor({ store, live, engine, timing = {} }) {
    this.store = store;
    this.live = live;
    this.engine = engine;
    this.bettingMs = timing.bettingMs ?? BETTING_MS;
    this.crashedMs = timing.crashedMs ?? CRASHED_MS;
    this.history = [];
    this.players = new Map(); // userId → player
    this.queue = new Map(); // bets for the next round
    this.timer = null;
    this.ensureChain();
  }

  ensureChain() {
    let c = this.store.data.crash;
    if (!c || c.index >= c.length) {
      const seed = randomHex();
      c = this.store.data.crash = {
        seed,
        length: CHAIN_LENGTH,
        index: 0,
        salt: CRASH_SALT,
        formulaVersion: CRASH_FORMULA,
        history: c?.history || [],
        terminatingHash: null,
        chainNo: (c?.chainNo || 0) + 1,
      };
    }
    // Rebuild the chain in memory from its secret seed.
    const chain = new Array(c.length + 1);
    chain[0] = c.seed;
    for (let i = 1; i <= c.length; i++) chain[i] = sha256(chain[i - 1]);
    this.chain = chain;
    c.terminatingHash = chain[c.length];
    this.history = c.history || [];
    this.store.save();
  }

  nextHash() {
    const c = this.store.data.crash;
    if (c.index >= c.length) this.ensureChain();
    const cc = this.store.data.crash;
    const hash = this.chain[cc.length - 1 - cc.index];
    cc.index++;
    return { hash, salt: cc.salt, roundNo: cc.index, chainNo: cc.chainNo, formulaVersion: cc.formulaVersion || 1 };
  }

  start() {
    this.beginBetting();
  }

  stop() {
    clearTimeout(this.timer);
    clearInterval(this.ticker);
    // Refund stakes that are still riding so a restart never eats a bet.
    const refund = (p) => {
      const user = this.store.data.users[p.userId];
      if (user) credit(user, p.currency, p.amount);
    };
    if (this.round?.phase !== 'crashed') for (const p of this.players.values()) if (!p.cashedAt) refund(p);
    for (const p of this.queue.values()) refund(p);
    this.players.clear();
    this.queue.clear();
    this.store.save();
  }

  beginBetting() {
    const { hash, salt, roundNo, chainNo, formulaVersion } = this.nextHash();
    this.round = {
      id: `${chainNo}-${roundNo}`,
      hash,
      salt,
      formulaVersion,
      crashPoint: crashPointForHash(hash, salt, formulaVersion),
      phase: 'betting',
      bettingEndsAt: Date.now() + this.bettingMs,
      startedAt: null,
      crashedAt: null,
    };
    this.players = this.queue;
    this.queue = new Map();
    this.live.broadcast('crash', this.snapshot());
    this.timer = setTimeout(() => this.beginRunning(), this.bettingMs);
  }

  beginRunning() {
    const r = this.round;
    r.phase = 'running';
    r.startedAt = Date.now();
    this.live.broadcast('crash', this.snapshot());
    this.ticker = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  currentMultiplier(now = Date.now()) {
    const r = this.round;
    if (!r || r.phase !== 'running') return 1;
    return Math.min(crashMultiplierAt(now - r.startedAt), r.crashPoint);
  }

  tick() {
    const r = this.round;
    if (r.phase !== 'running') return;
    const elapsed = Date.now() - r.startedAt;
    const m = Math.min(crashMultiplierAt(elapsed), r.crashPoint);
    for (const p of this.players.values()) {
      if (!p.cashedAt && p.autoCashout && p.autoCashout <= m) this.cashoutPlayer(p, p.autoCashout);
    }
    if (m >= r.crashPoint || elapsed >= crashTimeFor(r.crashPoint)) this.crash();
  }

  crash() {
    const r = this.round;
    clearInterval(this.ticker);
    r.phase = 'crashed';
    r.crashedAt = Date.now();
    for (const p of this.players.values()) {
      const user = this.store.data.users[p.userId];
      if (!user) continue;
      p.bet = this.engine.recordBet(user, {
        game: 'crash',
        currency: p.currency,
        amount: p.amount,
        payout: p.payout || 0,
        params: { autoCashout: p.autoCashout || null },
        result: { crashPoint: r.crashPoint, cashedAt: p.cashedAt || null, multiplier: p.cashedAt || 0 },
        seed: { roundId: r.id, hash: r.hash, salt: r.salt, formulaVersion: r.formulaVersion },
      });
    }
    this.history.unshift({ id: r.id, crashPoint: r.crashPoint, hash: r.hash, at: r.crashedAt });
    this.history.length = Math.min(this.history.length, 100);
    this.store.data.crash.history = this.history;
    this.store.save();
    this.live.broadcast('crash', this.snapshot());
    this.timer = setTimeout(() => this.beginBetting(), this.crashedMs);
  }

  cashoutPlayer(p, at) {
    const user = this.store.data.users[p.userId];
    p.cashedAt = at;
    p.payout = roundDown(p.currency, p.amount * at);
    if (user) {
      credit(user, p.currency, p.payout);
      this.live.toUser(user.id, 'balance', { currency: p.currency, amount: user.balances[p.currency] });
    }
    this.store.save();
    this.live.broadcast('crash:cashout', { roundId: this.round.id, userId: p.userId, username: p.publicName, cashedAt: at, payout: p.payout, currency: p.currency });
  }

  publicPlayer(p) {
    return {
      userId: p.userId,
      username: p.publicName,
      currency: p.currency,
      amount: p.amount,
      cashedAt: p.cashedAt || null,
      payout: p.payout || 0,
    };
  }

  snapshot() {
    const r = this.round;
    return {
      serverTime: Date.now(),
      round: r && {
        id: r.id,
        phase: r.phase,
        bettingEndsAt: r.bettingEndsAt,
        startedAt: r.startedAt,
        crashedAt: r.crashedAt,
        // Reveal the round only once it has crashed.
        crashPoint: r.phase === 'crashed' ? r.crashPoint : null,
        hash: r.phase === 'crashed' ? r.hash : null,
      },
      players: [...this.players.values()].map((p) => this.publicPlayer(p)),
      queued: this.queue.size,
      history: this.history.slice(0, 30).map(({ id, crashPoint, hash }) => ({ id, crashPoint, hash })),
    };
  }

  stateFor(user) {
    const snap = this.snapshot();
    if (user) {
      const mine = this.players.get(user.id);
      const queued = this.queue.get(user.id);
      snap.me = {
        bet: mine ? this.publicPlayer(mine) : null,
        autoCashout: mine?.autoCashout || null,
        queued: queued ? { amount: queued.amount, currency: queued.currency, autoCashout: queued.autoCashout } : null,
      };
    }
    return snap;
  }

  placeBet(user, body) {
    assertNotOnBreak(user);
    const currency = parseCurrency(user, body.currency);
    const amount = parseAmount(currency, body.amount ?? 0);
    let autoCashout = body.autoCashout == null || body.autoCashout === '' ? null : Number(body.autoCashout);
    if (autoCashout != null) {
      if (!Number.isFinite(autoCashout) || autoCashout < 1.01 || autoCashout > MAX_AUTO) throw badRequest('Auto cashout must be at least 1.01x');
      autoCashout = Math.floor(autoCashout * 100) / 100;
    }
    const joinNow = this.round?.phase === 'betting';
    const target = joinNow ? this.players : this.queue;
    if (this.players.has(user.id) && joinNow) throw badRequest('You already have a bet in this round');
    if (target.has(user.id)) throw badRequest('You already have a bet queued for the next round');
    debit(user, currency, amount);
    const p = {
      userId: user.id,
      publicName: user.settings.privateMode ? null : user.username,
      currency,
      amount,
      autoCashout,
      cashedAt: null,
      payout: 0,
    };
    target.set(user.id, p);
    this.store.save();
    if (joinNow) this.live.broadcast('crash:bet', { roundId: this.round.id, player: this.publicPlayer(p) });
    return { queued: !joinNow, balance: { currency, amount: user.balances[currency] }, state: this.stateFor(user) };
  }

  cancelBet(user) {
    let p = this.queue.get(user.id);
    let from = this.queue;
    if (!p && this.round?.phase === 'betting') {
      p = this.players.get(user.id);
      from = this.players;
    }
    if (!p) throw badRequest('No bet to cancel');
    from.delete(user.id);
    credit(user, p.currency, p.amount);
    this.store.save();
    if (from === this.players) this.live.broadcast('crash:cancel', { roundId: this.round.id, userId: user.id });
    return { balance: { currency: p.currency, amount: user.balances[p.currency] }, state: this.stateFor(user) };
  }

  cashout(user) {
    const r = this.round;
    const p = this.players.get(user.id);
    if (!r || r.phase !== 'running' || !p) throw badRequest('No active bet to cash out');
    if (p.cashedAt) throw badRequest('Already cashed out');
    const m = crashMultiplierAt(Date.now() - r.startedAt);
    if (m > r.crashPoint || (m === r.crashPoint && Date.now() - r.startedAt > crashTimeFor(r.crashPoint))) {
      throw badRequest('Too late, the round already crashed');
    }
    this.cashoutPlayer(p, Math.max(1, m));
    return { cashedAt: p.cashedAt, payout: p.payout, balance: { currency: p.currency, amount: user.balances[p.currency] } };
  }

  fairness() {
    const c = this.store.data.crash;
    return {
      terminatingHash: c.terminatingHash,
      salt: c.salt,
      formulaVersion: c.formulaVersion || 1,
      chainLength: c.length,
      played: c.index,
      history: this.history.slice(0, 50).map(({ id, crashPoint, hash }) => ({ id, crashPoint, hash })),
    };
  }
}
