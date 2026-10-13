import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { createArrayRng } from '../public/js/shared/fair.js';
import * as dice from '../public/js/shared/games/dice.js';
import * as mines from '../public/js/shared/games/mines.js';
import { createRng, sha256 } from '../server/fair.js';

process.env.FAKESINO_CONFIRM_MS = '20';
process.env.FAKESINO_WITHDRAW_MS = '20';

let app;
let base;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fakesino-'));

before(async () => {
  app = createApp({ dataFile: path.join(dir, 'db.json'), crashTiming: { bettingMs: 300, crashedMs: 100 } });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});

after(async () => {
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function client() {
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };
  return { get: (u) => call('GET', u), post: (u, b = {}) => call('POST', u, b) };
}

const card = (number) => ({ number, expMonth: 12, expYear: new Date().getFullYear() + 2, cvc: number.startsWith('3') ? '1234' : '123', name: 'Test Player' });
let n = 0;
async function newPlayer(deposit = 1000) {
  const c = client();
  const name = `player${++n}`;
  const r = await c.post('/api/auth/register', { username: name, email: `${name}@example.com`, password: 'password123', terms: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  if (deposit) {
    const d = await c.post('/api/payments/card', { amount: deposit, currency: 'USD', card: card('4242424242424242') });
    assert.equal(d.data.payment.status, 'succeeded');
  }
  return c;
}

test('registration validates input and starts a session', async () => {
  const c = client();
  assert.equal((await c.post('/api/auth/register', { username: 'x', email: 'bad', password: '1', terms: true })).status, 400);
  assert.equal((await c.post('/api/auth/register', { username: 'okname', email: 'ok@example.com', password: 'password123' })).data.field, 'terms');
  const r = await c.post('/api/auth/register', { username: 'okname', email: 'ok@example.com', password: 'password123', terms: true });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.balances.USD, 0);
  assert.equal(r.data.user.passHash, undefined, 'never leaks the password hash');
  const me = await c.get('/api/me');
  assert.equal(me.data.user.username, 'okname');
  const dup = await client().post('/api/auth/register', { username: 'OKNAME', email: 'other@example.com', password: 'password123', terms: true });
  assert.equal(dup.data.field, 'username');
  await c.post('/api/auth/logout');
  assert.equal((await c.get('/api/me')).data.user, null);
  const login = await c.post('/api/auth/login', { login: 'ok@example.com', password: 'password123' });
  assert.equal(login.status, 200);
  assert.equal((await c.post('/api/auth/login', { login: 'okname', password: 'nope' })).status, 401);
});

test('card checkout: demo cards succeed, real cards are refused', async () => {
  const c = await newPlayer(0);
  const real = await c.post('/api/payments/card', { amount: 50, currency: 'USD', card: card('4111111111111111') });
  assert.equal(real.status, 400);
  assert.equal(real.data.code, 'real_card_rejected');
  const ok = await c.post('/api/payments/card', { amount: 50, currency: 'USD', card: card('5555555555554444'), saveCard: true });
  assert.equal(ok.data.payment.status, 'succeeded');
  assert.equal(ok.data.user.balances.USD, 50);
  assert.equal(ok.data.user.cards.length, 1);
  assert.equal(ok.data.user.cards[0].last4, '4444');
  assert.equal(ok.data.user.cards[0].demoKey, undefined, 'full card number is not exposed');
  const saved = await c.post('/api/payments/card', { amount: 25, currency: 'USD', savedCardId: ok.data.user.cards[0].id, cvc: '321' });
  assert.equal(saved.data.user.balances.USD, 75);
  const declined = await c.post('/api/payments/card', { amount: 50, currency: 'USD', card: card('4000000000000002') });
  assert.equal(declined.data.payment.status, 'failed');
  assert.equal(declined.data.payment.declineCode, 'card_declined');
  const broke = await c.post('/api/payments/card', { amount: 50, currency: 'USD', card: card('4000000000009995') });
  assert.equal(broke.data.payment.declineCode, 'insufficient_funds');
  assert.equal((await c.post('/api/payments/card', { amount: 5, currency: 'USD', card: card('4242424242424242') })).status, 400, 'minimum deposit');
  const expired = await c.post('/api/payments/card', { amount: 50, currency: 'USD', card: { ...card('4242424242424242'), expYear: 2001 } });
  assert.equal(expired.data.field, 'exp');
});

test('card checkout: 3-D Secure challenge and buying crypto', async () => {
  const c = await newPlayer(0);
  const r = await c.post('/api/payments/card', { amount: 100, currency: 'USD', creditCurrency: 'BTC', card: card('4000002760003184') });
  assert.equal(r.data.payment.status, 'requires_action');
  const wrong = await c.post(`/api/payments/${r.data.payment.id}/authenticate`, { code: '000000' });
  assert.equal(wrong.status, 400);
  const done = await c.post(`/api/payments/${r.data.payment.id}/authenticate`, { code: '123456' });
  assert.equal(done.data.payment.status, 'succeeded');
  assert.ok(Math.abs(done.data.user.balances.BTC - 100 / 62000) < 1e-8);
  assert.equal((await c.post(`/api/payments/${r.data.payment.id}/authenticate`, { code: '123456' })).status, 404, 'cannot be replayed');
});

test('crypto deposits confirm block by block; withdrawals debit immediately', async () => {
  const c = await newPlayer(0);
  const addr = await c.post('/api/payments/crypto/address', { currency: 'LTC' });
  assert.match(addr.data.address, /^fakeltc1/);
  const sim = await c.post('/api/payments/crypto/simulate', { currency: 'LTC', amount: 2 });
  assert.equal(sim.data.transaction.status, 'pending');
  await new Promise((r) => setTimeout(r, 200));
  const me = await c.get('/api/me');
  assert.equal(me.data.user.balances.LTC, 2);
  const tooSmall = await c.post('/api/payments/withdraw', { currency: 'LTC', amount: 0.01, address: 'Lsomewhere1234567' });
  assert.equal(tooSmall.status, 400);
  const w = await c.post('/api/payments/withdraw', { currency: 'LTC', amount: 1, address: 'Lsomewhere1234567' });
  assert.equal(w.data.transaction.status, 'pending');
  assert.equal(w.data.user.balances.LTC, 1);
  await new Promise((r) => setTimeout(r, 100));
  const txs = await c.get('/api/wallet/transactions?type=withdrawal');
  assert.equal(txs.data.transactions[0].status, 'completed');
});

test('dice bets are settled server-side and verifiable after rotation', async () => {
  const c = await newPlayer();
  const bets = [];
  for (let i = 0; i < 5; i++) {
    const r = await c.post('/api/games/dice/bet', { amount: 10, currency: 'USD', params: { target: 50.5, condition: 'over' } });
    assert.equal(r.status, 200);
    bets.push(r.data.bet);
  }
  assert.deepEqual(bets.map((b) => b.seed.nonce), [0, 1, 2, 3, 4]);
  const me = (await c.get('/api/me')).data.user;
  const expected = 1000 + bets.reduce((a, b) => a + b.payout - b.amount, 0);
  assert.ok(Math.abs(me.balances.USD - expected) < 1e-9);
  const before = await c.get(`/api/bets/${bets[0].id}`);
  assert.equal(before.data.bet.seed.serverSeed, null, 'server seed stays secret until rotation');
  const rot = await c.post('/api/fair/rotate', { clientSeed: 'newseed' });
  assert.equal(sha256(rot.data.revealed.serverSeed), bets[0].seed.serverSeedHash);
  const after = await c.get(`/api/bets/${bets[2].id}`);
  const s = after.data.bet.seed;
  const replay = dice.outcome(createRng({ serverSeed: s.serverSeed, clientSeed: s.clientSeed, nonce: s.nonce }), after.data.bet.params);
  assert.deepEqual(replay, after.data.bet.result);
});

test('bets require auth, valid params and enough balance', async () => {
  assert.equal((await client().post('/api/games/dice/bet', { amount: 1 })).status, 401);
  const c = await newPlayer(10);
  assert.equal((await c.post('/api/games/dice/bet', { amount: 11, currency: 'USD', params: { target: 50, condition: 'over' } })).data.code, 'insufficient_balance');
  assert.equal((await c.post('/api/games/dice/bet', { amount: 1, currency: 'USD', params: { target: 99.995, condition: 'over' } })).status, 400);
  assert.equal((await c.post('/api/games/nope/bet', { amount: 1 })).status, 404);
  assert.equal((await c.post('/api/games/keno/bet', { amount: 1, currency: 'USD', params: { picks: [] } })).status, 400);
  assert.equal((await c.post('/api/games/dice/bet', { amount: -1, currency: 'USD', params: { target: 50, condition: 'over' } })).status, 400);
});

test('every instant game accepts a bet', async () => {
  const c = await newPlayer();
  const cases = {
    limbo: { target: 2 },
    plinko: { rows: 12, risk: 'high' },
    keno: { risk: 'classic', picks: [1, 5, 9, 13, 40] },
    wheel: { segments: 30, risk: 'medium' },
    coinflip: { side: 'tails' },
    slots: {},
  };
  for (const [game, params] of Object.entries(cases)) {
    const r = await c.post(`/api/games/${game}/bet`, { amount: 1, currency: 'USD', params });
    assert.equal(r.status, 200, `${game}: ${JSON.stringify(r.data)}`);
    assert.ok(r.data.bet.payout >= 0);
  }
  const roulette = await c.post('/api/games/roulette/bet', { currency: 'USD', params: { chips: { red: 1, 'straight:0': 0.5, 'corner:1': 0.25 } } });
  assert.equal(roulette.data.bet.amount, 1.75);
  const bac = await c.post('/api/games/baccarat/bet', { currency: 'USD', params: { chips: { banker: 2, tie: 1 } } });
  assert.equal(bac.data.bet.amount, 3);
});

test('mines: reveal, cashout, seed lock while active', async () => {
  const c = await newPlayer();
  const start = await c.post('/api/games/mines/bet', { amount: 10, currency: 'USD', params: { mines: 1 } });
  assert.equal(start.data.game.state.positions, null, 'mine positions stay hidden');
  assert.equal((await c.post('/api/games/mines/bet', { amount: 10, currency: 'USD', params: { mines: 1 } })).data.code, 'game_active');
  assert.equal((await c.post('/api/fair/rotate', {})).status, 400, 'cannot reveal the seed mid-game');
  // Find a safe tile by replaying the game with the server-side seed (test only).
  const user = Object.values(app.store.data.users).find((u) => u.active.mines);
  const g = user.active.mines;
  const positions = mines.minePositions(createRng(g.seed), 1);
  const safe = [...Array(25).keys()].find((t) => !positions.includes(t));
  const rev = await c.post('/api/games/mines/action', { action: 'reveal', data: { tile: safe } });
  assert.equal(rev.data.game.state.revealed.length, 1);
  const out = await c.post('/api/games/mines/action', { action: 'cashout' });
  assert.equal(out.data.bet.payout, Math.floor(10 * mines.multiplierFor(1, 1) * 100) / 100);
  assert.equal((await c.get('/api/games/mines/active')).data.game, null);
});

test('blackjack charges extra stake for doubles and insurance', async () => {
  const c = await newPlayer();
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 60)); // stay under the per-user rate limit
    const r = await c.post('/api/games/blackjack/bet', { amount: 10, currency: 'USD', params: {} });
    let g = r.data.game;
    let guard = 0;
    while (!r.data.bet && g && g.actions.length && guard++ < 10) {
      const action = g.actions.includes('noInsurance') ? 'noInsurance' : g.actions.includes('double') ? 'double' : 'stand';
      const a = await c.post('/api/games/blackjack/action', { action });
      assert.equal(a.status, 200, JSON.stringify(a.data));
      g = a.data.game;
      if (a.data.bet) {
        assert.ok([10, 15, 20, 25].includes(a.data.bet.amount));
        break;
      }
    }
  }
  const me = (await c.get('/api/me')).data.user;
  assert.equal(me.activeGames.length, 0);
});

test('crash: bet, auto cashout, queueing and recorded bets', async () => {
  const c = await newPlayer();
  // wait for a betting phase
  let state;
  for (let i = 0; i < 200; i++) {
    state = (await c.get('/api/crash/state')).data;
    if (state.round.phase === 'betting' && state.round.bettingEndsAt - state.serverTime > 150) break;
    // Rounds can run for a long time; fast-forward them in tests.
    if (app.crash.round.phase === 'running') app.crash.crash();
    await new Promise((r) => setTimeout(r, 20));
  }
  const bet = await c.post('/api/crash/bet', { amount: 10, currency: 'USD', autoCashout: 1.01 });
  assert.equal(bet.status, 200, JSON.stringify(bet.data));
  assert.equal(bet.data.queued, false);
  assert.equal(bet.data.balance.amount, 990);
  const roundId = state.round.id;
  // A bet placed while the round runs is queued for the next one.
  // Wait for the auto cashout (≈170 ms into the round), then end the round early.
  for (let i = 0; i < 200; i++) {
    const s = (await c.get('/api/crash/state')).data;
    if (s.round.id !== roundId || s.round.phase === 'crashed' || s.me.bet?.cashedAt) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  if (app.crash.round.id === roundId && app.crash.round.phase === 'running') app.crash.crash();
  await new Promise((r) => setTimeout(r, 30));
  const queued = await c.post('/api/crash/bet', { amount: 5, currency: 'USD' });
  assert.equal(queued.status, 200, JSON.stringify(queued.data));
  const cancelled = await c.post('/api/crash/cancel');
  assert.equal(cancelled.status, 200);
  const bets = (await c.get('/api/bets/mine?game=crash')).data.bets;
  assert.equal(bets.length, 1);
  const b = bets[0];
  if (b.result.crashPoint >= 1.01) assert.equal(b.payout, 10.1);
  else assert.equal(b.payout, 0);
  assert.equal((await c.post('/api/crash/cashout')).status, 400);
});

test('vault, rakeback and daily reload', async () => {
  const c = await newPlayer(100);
  const v = await c.post('/api/wallet/vault', { currency: 'USD', amount: 40, direction: 'deposit' });
  assert.equal(v.data.user.balances.USD, 60);
  assert.equal(v.data.user.vault.USD, 40);
  assert.equal((await c.post('/api/wallet/vault', { currency: 'USD', amount: 41, direction: 'withdraw' })).status, 400);
  await c.post('/api/wallet/vault', { currency: 'USD', amount: 40, direction: 'withdraw' });
  for (let i = 0; i < 20; i++) await c.post('/api/games/limbo/bet', { amount: 5, currency: 'USD', params: { target: 1.5 } });
  const rb = await c.post('/api/bonus/rakeback');
  assert.equal(rb.status, 200);
  const daily = await c.post('/api/bonus/daily');
  assert.equal(daily.data.transaction.amount, 25);
  assert.equal((await c.post('/api/bonus/daily')).status, 400, 'once per day');
});

test('deposit limits and breaks are enforced server-side', async () => {
  const c = await newPlayer(100);
  assert.equal((await c.post('/api/account/limits', { depositDailyUsd: 5 })).status, 400);
  await c.post('/api/account/limits', { depositDailyUsd: 150 });
  const over = await c.post('/api/payments/card', { amount: 60, currency: 'USD', card: card('4242424242424242') });
  assert.equal(over.data.code, 'deposit_limit', 'the earlier $100 deposit counts toward the limit');
  assert.equal((await c.post('/api/payments/card', { amount: 50, currency: 'USD', card: card('4242424242424242') })).status, 200);
  const brk = await c.post('/api/account/limits', { breakHours: 24 });
  assert.ok(brk.data.user.limits.breakUntil > Date.now());
  const bet = await c.post('/api/games/dice/bet', { amount: 1, currency: 'USD', params: { target: 50, condition: 'over' } });
  assert.equal(bet.status, 403);
  assert.equal(bet.data.code, 'on_break');
  assert.equal((await c.post('/api/crash/bet', { amount: 1, currency: 'USD' })).status, 403);
  assert.equal((await c.post('/api/payments/card', { amount: 10, currency: 'USD', card: card('4242424242424242') })).status, 403);
});

test('cross-origin POSTs and non-JSON bodies are rejected', async () => {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
  const nullOrigin = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { origin: 'null', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(nullOrigin.status, 403);
  const form = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'login=a&password=b' });
  assert.equal(form.status, 415);
});

test('bets survive a restart (append-only bet log)', async () => {
  const c = await newPlayer();
  const r = await c.post('/api/games/limbo/bet', { amount: 1, currency: 'USD', params: { target: 2 } });
  app.store.flush();
  const { Store } = await import('../server/store.js');
  const reloaded = new Store(path.join(dir, 'db.json'));
  const bet = reloaded.findBet(r.data.bet.id);
  assert.equal(bet.payout, r.data.bet.payout);
  assert.ok(!('bets' in JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8'))), 'bets are not duplicated in the snapshot');
});

test('static files and SPA fallback', async () => {
  const html = await fetch(`${base}/casino/games/dice`);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /<div id="app">/);
  assert.equal((await fetch(`${base}/js/nope.js`)).status, 404);
  // Traversal attempts never reach files outside public/.
  const t = await fetch(`${base}/..%2fserver/app.js`);
  assert.notEqual(t.status, 200);
  assert.doesNotMatch(await t.text(), /createApp/);
});
