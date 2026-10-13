import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createApp } from '../server/app.js';
import { createArrayRng } from '../public/js/shared/fair.js';
import * as dice from '../public/js/shared/games/dice.js';
import * as mines from '../public/js/shared/games/mines.js';
import * as zoo from '../public/js/shared/games/zoo.js';
import { slidePointFromHex } from '../public/js/shared/fair.js';
import { createRng, sha256 } from '../server/fair.js';

process.env.FAKESINO_CONFIRM_MS = '20';
process.env.FAKESINO_WITHDRAW_MS = '20';
process.env.FAKESINO_GUEST_LIMIT = '500';

let app;
let base;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fakesino-'));

before(async () => {
  app = createApp({
    dataFile: path.join(dir, 'db.json'),
    crashTiming: { bettingMs: 300, crashedMs: 100 },
    roundTiming: { slide: { betting: 250, playing: 120, result: 80 }, zoo: { betting: 250, playing: 120, result: 80 } },
  });
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
  return { get: (u) => call('GET', u), post: (u, b = {}) => call('POST', u, b), forgetCookie: () => (cookie = '') };
}

const key = () => crypto.randomBytes(32).toString('hex');
async function waitFor(check, ms = 5000) {
  for (const end = Date.now() + ms; Date.now() < end; ) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.fail('timed out waiting');
}
const card = (number) => ({ number, expMonth: 12, expYear: new Date().getFullYear() + 2, cvc: number.startsWith('3') ? '1234' : '123', name: 'Test Player' });
async function newPlayer(deposit = 1000) {
  const c = client();
  const r = await c.post('/api/auth/guest', { deviceId: key() });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  if (deposit) {
    const d = await c.post('/api/payments/card', { amount: deposit, currency: 'USD', card: card('4242424242424242') });
    assert.equal(d.data.payment.status, 'succeeded');
  }
  return c;
}

test('wallets are created automatically, no sign-up', async () => {
  const c = client();
  assert.equal((await c.get('/api/me')).data.user, null);
  assert.equal((await c.post('/api/auth/guest', { deviceId: 'not-a-key' })).status, 400);
  const k = key();
  const r = await c.post('/api/auth/guest', { deviceId: k });
  assert.equal(r.status, 200);
  assert.equal(r.data.created, true);
  assert.match(r.data.user.username, /^Player\d+$/);
  assert.equal(r.data.user.balances.USD, 0);
  assert.equal((await c.get('/api/me')).data.user.id, r.data.user.id);
  const again = await c.post('/api/auth/guest', { deviceId: k });
  assert.equal(again.data.created, false);
  assert.equal(again.data.user.id, r.data.user.id);
  // Cookie lost (new browser session) but the key is still in local storage → same wallet.
  c.forgetCookie();
  const back = await c.post('/api/auth/guest', { deviceId: k });
  assert.equal(back.data.user.id, r.data.user.id);
  assert.equal((await c.get('/api/me')).data.user.id, r.data.user.id);
  // Another key is another wallet.
  const other = await client().post('/api/auth/guest', { deviceId: key() });
  assert.notEqual(other.data.user.id, r.data.user.id);
  // Opening a wallet by key requires the wallet to exist.
  assert.equal((await client().post('/api/auth/guest', { deviceId: key(), mustExist: true })).status, 404);
  const opened = await client().post('/api/auth/guest', { deviceId: k, mustExist: true });
  assert.equal(opened.data.user.id, r.data.user.id);
  // The server stores only a hash of the key.
  assert.ok(!JSON.stringify(app.store.data.devices).includes(k));
});

test('a browser snapshot rebuilds a wallet the server has forgotten', async () => {
  const k = key();
  const restore = {
    username: 'Restored_1',
    balances: { USD: 123.456, BTC: 1e99, ETH: -5, FOO: 3, LTC: 'abc' },
    vault: { USD: 10 },
    currency: 'BTC',
    settings: { privateMode: true, bogus: true },
    wageredUsd: 2500,
  };
  const r = await client().post('/api/auth/guest', { deviceId: k, restore });
  assert.equal(r.data.restored, true);
  const u = r.data.user;
  assert.equal(u.username, 'Restored_1');
  assert.equal(u.balances.USD, 123.45);
  assert.equal(u.balances.BTC, Math.floor((10_000_000 / 62000) * 1e8) / 1e8, 'capped');
  assert.equal(u.balances.ETH, 0);
  assert.equal(u.balances.LTC, 0);
  assert.equal(u.balances.FOO, undefined);
  assert.equal(u.vault.USD, 10);
  assert.equal(u.currency, 'BTC');
  assert.equal(u.settings.privateMode, true);
  assert.equal(u.settings.bogus, undefined);
  assert.equal(u.vip.wageredUsd, 2500);
  // A wallet the server still knows ignores snapshots.
  const again = await client().post('/api/auth/guest', { deviceId: k, restore: { balances: { USD: 999999 } } });
  assert.equal(again.data.user.balances.USD, 123.45);
  // A taken username in a snapshot falls back to a generated one.
  const clash = await client().post('/api/auth/guest', { deviceId: key(), restore: { username: 'restored_1' } });
  assert.match(clash.data.user.username, /^Player\d+$/);
});

test('a cleared key is re-linked to the current session', async () => {
  const c = client();
  const first = await c.post('/api/auth/guest', { deviceId: key() });
  const k2 = key();
  const linked = await c.post('/api/auth/guest', { deviceId: k2 });
  assert.equal(linked.data.user.id, first.data.user.id);
  const fresh = await client().post('/api/auth/guest', { deviceId: k2 });
  assert.equal(fresh.data.user.id, first.data.user.id);
});

// Header-only client: identifies the wallet with X-Wallet-Key, never sends cookies.
function keyClient(k) {
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'x-wallet-key': k, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  return { get: (u) => call('GET', u), post: (u, b = {}) => call('POST', u, b) };
}

test('the X-Wallet-Key header identifies the wallet without cookies', async () => {
  const k = key();
  const c = keyClient(k);
  const created = await c.post('/api/auth/guest', {});
  assert.equal(created.data.created, true);
  assert.equal((await c.get('/api/me')).data.user.id, created.data.user.id);
  const dep = await c.post('/api/payments/card', { amount: 50, currency: 'USD', card: card('4242424242424242') });
  assert.equal(dep.data.user.balances.USD, 50);
  const bet = await c.post('/api/games/limbo/bet', { amount: 1, currency: 'USD', params: { target: 2 } });
  assert.equal(bet.status, 200);
});

test('a wallet the server forgot answers 401 until the browser restores it', async () => {
  const k = key();
  const c = keyClient(k);
  const r = await c.get('/api/stats');
  assert.equal(r.status, 401);
  assert.equal(r.data.code, 'auth_required');
  assert.equal((await c.get('/api/me')).data.user, null);
  const restored = await c.post('/api/auth/guest', { restore: { balances: { USD: 42 } } });
  assert.equal(restored.data.restored, true);
  assert.equal((await c.get('/api/stats')).status, 200);
  assert.equal((await c.get('/api/me')).data.user.balances.USD, 42);
});

test('starting a fresh wallet never reuses the current one', async () => {
  const c = client();
  const first = await c.post('/api/auth/guest', { deviceId: key() });
  const fresh = await c.post('/api/auth/guest', { deviceId: key(), fresh: true, restore: { balances: { USD: 5 } } });
  assert.notEqual(fresh.data.user.id, first.data.user.id);
  assert.equal(fresh.data.user.balances.USD, 0, 'a fresh wallet ignores snapshots');
});

test('the live feed authenticates with a ticket', async () => {
  const c = keyClient(key());
  await c.post('/api/auth/guest', {});
  const { data } = await c.post('/api/live/ticket');
  assert.match(data.ticket, /^[a-f0-9]{48}$/);
  const hello = async (url) => {
    const ctrl = new AbortController();
    const res = await fetch(base + url, { signal: ctrl.signal });
    const reader = res.body.getReader();
    let text = '';
    while (!text.includes('event: hello')) text += new TextDecoder().decode((await reader.read()).value);
    while (!/event: hello\ndata: .*\n/.test(text)) text += new TextDecoder().decode((await reader.read()).value);
    ctrl.abort();
    return JSON.parse(text.match(/event: hello\ndata: (.*)\n/)[1]);
  };
  assert.equal((await hello(`/api/live?ticket=${data.ticket}`)).authed, true);
  assert.equal((await hello('/api/live?ticket=nope')).authed, false);
  assert.equal((await keyClient(key()).post('/api/live/ticket')).status, 401);
});

test('usernames can be changed and stay unique', async () => {
  const a = await newPlayer(0);
  const b = await newPlayer(0);
  assert.equal((await a.post('/api/account/username', { username: 'x' })).status, 400);
  const ok = await a.post('/api/account/username', { username: 'okname' });
  assert.equal(ok.data.user.username, 'okname');
  assert.equal((await b.post('/api/account/username', { username: 'OKNAME' })).data.field, 'username');
  assert.equal((await a.post('/api/account/username', { username: 'OkName' })).status, 200, 'renaming your own name in a different case is fine');
  assert.equal((await client().post('/api/account/username', { username: 'nobody' })).status, 401);
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

test('buy crypto: provider quotes, card checkout, coins arrive on-chain', async () => {
  const c = await newPlayer(0);
  const q = (await c.get('/api/payments/buy/quotes?coin=LTC&network=litecoin&fiat=USD&amount=100')).data;
  assert.equal(q.quotes.length, 3);
  assert.equal(q.quotes.filter((x) => x.best).length, 1);
  const best = q.quotes.find((x) => x.best);
  assert.ok(best.youGet > 1.3 && best.youGet < 1.4, `≈ $96-97 of LTC at $70: ${best.youGet}`);
  assert.equal((await c.post('/api/payments/card', { amount: 5, currency: 'USD', creditCurrency: 'LTC', provider: best.provider, card: card('4242424242424242') })).status, 400, '$10 minimum');
  const r = await c.post('/api/payments/card', { amount: 100, currency: 'USD', creditCurrency: 'LTC', provider: best.provider, network: 'litecoin', card: card('4242424242424242') });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.transaction.method, 'buy');
  assert.equal(r.data.transaction.status, 'pending');
  assert.equal(r.data.transaction.details.provider, best.name);
  await new Promise((res) => setTimeout(res, 250));
  const me = (await c.get('/api/me')).data.user;
  assert.equal(me.balances.LTC, r.data.transaction.amount, 'credited after confirmations');
});

test('swap converts between cryptos with a 0.5% fee; explorer and tx details', async () => {
  const c = await newPlayer(0);
  await c.post('/api/payments/crypto/simulate', { currency: 'LTC', amount: 10 });
  await new Promise((r) => setTimeout(r, 150));
  const q = (await c.get('/api/payments/swap/quote?from=LTC&to=USDT&amount=2')).data;
  assert.equal(q.fee, 0.01);
  assert.equal(q.toAmount, 139.3);
  assert.equal((await c.post('/api/payments/swap', { from: 'LTC', to: 'LTC', amount: 1 })).status, 400);
  assert.equal((await c.post('/api/payments/swap', { from: 'LTC', to: 'USDT', amount: 0.001 })).status, 400, 'minimum');
  const s = await c.post('/api/payments/swap', { from: 'LTC', to: 'USDT', amount: 2 });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  assert.equal(s.data.user.balances.LTC, 8);
  assert.equal(s.data.transaction.status, 'pending');
  await new Promise((r) => setTimeout(r, 300));
  assert.equal((await c.get('/api/me')).data.user.balances.USDT, 139.3);
  const swaps = (await c.get('/api/wallet/transactions?type=swap')).data.transactions;
  assert.equal(swaps[0].status, 'completed');
  const one = (await c.get(`/api/wallet/transactions/${swaps[0].id}`)).data.transaction;
  assert.equal(one.details.from, 'LTC');
  const ex = (await c.get(`/api/explorer/tx/${one.details.txHash}`)).data.tx;
  assert.equal(ex.status, 'confirmed');
  assert.ok(ex.blockHeight > 0);
  const deposits = (await c.get('/api/wallet/transactions?type=deposit')).data.transactions;
  assert.ok(deposits.every((t) => t.method !== 'buy'));
});

test('crypto deposits confirm block by block; withdrawals debit immediately', async () => {
  const c = await newPlayer(0);
  const addr = await c.post('/api/payments/crypto/address', { currency: 'LTC' });
  assert.match(addr.data.address, /^fakeltc-litecoin1/);
  assert.equal(addr.data.minimum, 0.001);
  const sim = await c.post('/api/payments/crypto/simulate', { currency: 'LTC', amount: 2 });
  assert.equal(sim.data.transaction.status, 'pending');
  const dust = await c.post('/api/payments/crypto/simulate', { currency: 'LTC', amount: 0.0001 });
  assert.equal(dust.data.transaction.status, 'failed');
  assert.match(dust.data.transaction.details.reason, /below minimum/);
  await new Promise((r) => setTimeout(r, 200));
  const me = await c.get('/api/me');
  assert.equal(me.data.user.balances.LTC, 2, 'the dust deposit is never credited');
  const ltc = 'LcHKk2ayiXbHfBGiyM9x5i1PcybPbWRUW3';
  assert.match((await c.post('/api/payments/withdraw', { currency: 'LTC', amount: 1, address: 'Lsomewhere1234567' })).data.error, /Invalid LTC \(Litecoin\) address/);
  const tooSmall = await c.post('/api/payments/withdraw', { currency: 'LTC', amount: 0.01, address: ltc });
  assert.match(tooSmall.data.error, /Minimum withdrawal: 0.01857329 LTC/);
  const w = await c.post('/api/payments/withdraw', { currency: 'LTC', amount: 1, address: ltc });
  assert.equal(w.data.transaction.status, 'pending');
  assert.equal(w.data.transaction.details.fee, 0.000138);
  assert.equal(w.data.user.balances.LTC, 1);
  await new Promise((r) => setTimeout(r, 100));
  const txs = await c.get('/api/wallet/transactions?type=withdrawal');
  assert.equal(txs.data.transactions[0].status, 'completed');
  // USDT has several networks, each with its own address format.
  const trc = await c.post('/api/payments/crypto/address', { currency: 'USDT', network: 'trc20' });
  assert.match(trc.data.address, /^fakeusdt-trc201/);
  assert.equal(trc.data.networks.length, 5);
  assert.match((await c.post('/api/payments/withdraw', { currency: 'USDT', network: 'trc20', amount: 5, address: '0x' + 'a'.repeat(40) })).data.error, /Invalid USDT \(Tron \(TRC20\)\) address/);
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
    coinflip: { autoSides: ['tails', 'heads'] },
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

// Wait for a shared-round game to reach a phase with at least `ms` left.
async function phaseOf(slug, phase, ms = 120) {
  for (let i = 0; i < 200; i++) {
    const r = app.plugins[slug].game.round;
    if (r?.phase === phase && r.endsAt - Date.now() > ms) return r;
    await new Promise((res) => setTimeout(res, 15));
  }
  throw new Error(`${slug} never reached ${phase}`);
}

async function settled(c, slug, count) {
  for (let i = 0; i < 200; i++) {
    const { bets } = (await c.get(`/api/bets/mine?game=${slug}`)).data;
    if (bets.length >= count) return bets;
    await new Promise((res) => setTimeout(res, 25));
  }
  throw new Error('bets never settled');
}

test('slide: bets settle against the hash-chain result; late bets queue; cancel refunds', async () => {
  const c = await newPlayer(100);
  await phaseOf('slide', 'betting');
  const a = await c.post('/api/slide/bet', { amount: 1, currency: 'USD', target: 1.5 });
  assert.equal(a.status, 200, JSON.stringify(a.data));
  assert.equal(a.data.queued, false);
  const b = await c.post('/api/slide/bet', { amount: 2, currency: 'USD', target: 1000 });
  assert.equal(b.data.balance.amount, 97);
  assert.equal((await c.post('/api/slide/bet', { amount: 1, currency: 'USD', target: 1 })).status, 400);
  const cancel = await c.post('/api/slide/cancel', { betId: b.data.bet.id });
  assert.equal(cancel.data.balance.amount, 99);
  const bets = await settled(c, 'slide', 1);
  const bet = bets[0];
  const { seed } = (await c.get(`/api/bets/${bet.id}`)).data.bet;
  const point = slidePointFromHex(crypto.createHmac('sha256', seed.hash).update(seed.salt).digest('hex'));
  assert.equal(bet.result.point, point);
  assert.equal(bet.payout, point >= 1.5 ? 1.5 : 0);
  assert.equal(bet.multiplier, point >= 1.5 ? 1.5 : 0);
  // The chain is played in reverse: hashing a round's hash gives the previous round's.
  const fair = (await c.get('/api/fair/slide')).data;
  assert.equal(fair.salt, seed.salt);
  assert.ok(fair.history.some((h) => h.hash === seed.hash));
  // During play, bets go to the next round.
  await phaseOf('slide', 'playing', 30);
  const q = await c.post('/api/slide/bet', { amount: 1, currency: 'USD', target: 2 });
  assert.equal(q.data.queued, true);
  assert.equal((await c.get('/api/slide/state')).data.me.queued.length, 1);
});

test('zoo: chip stakes pay by how many of three spins land on each animal', async () => {
  const c = await newPlayer(100);
  await phaseOf('zoo', 'betting');
  assert.equal((await c.post('/api/zoo/bet', { amount: 1, currency: 'USD', stakes: { unicorn: 1 } })).status, 400);
  const r = await c.post('/api/zoo/bet', { currency: 'USD', stakes: { lion: 1, penguin: 2.5, rhino: 0 } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.balance.amount, 96.5);
  const [bet] = await settled(c, 'zoo', 1);
  const { seed } = (await c.get(`/api/bets/${bet.id}`)).data.bet;
  const tiles = zoo.spinsFromBytes(crypto.createHmac('sha256', seed.hash).update(seed.salt).digest());
  assert.deepEqual(bet.result.tiles, tiles);
  const expected = Math.floor(zoo.payoutFor({ lion: 1, penguin: 2.5 }, tiles) * 100 + 1e-7) / 100;
  assert.equal(bet.payout, expected);
  assert.deepEqual(bet.params.stakes, { lion: 1, penguin: 2.5 });
});

test('round games refund unsettled stakes on stop and after a crash', async () => {
  const c = await newPlayer(50);
  const me = (await c.get('/api/me')).data.user;
  const g = app.plugins.slide.game;
  await phaseOf('slide', 'betting');
  await c.post('/api/slide/bet', { amount: 5, currency: 'USD', target: 2 });
  // Simulate a crash: the pending list survives in the store and is refunded on the next start.
  const pending = app.store.data.slide.pending;
  assert.ok(pending.some((p) => p.userId === me.id && p.amount === 5));
  const user = app.store.data.users[me.id];
  const before = user.balances.USD;
  g.refundPending();
  assert.equal(user.balances.USD, before + 5);
  // Undo the simulated refund so the live round can settle normally.
  user.balances.USD = before;
  app.store.data.slide.pending = pending;
});

test('bet limits: max bet per currency and max profit for fixed multipliers', async () => {
  const c = await newPlayer(1000);
  const big = await c.post('/api/games/dice/bet', { amount: 1000000.01, currency: 'USD', params: { target: 50.5, condition: 'over' } });
  assert.equal(big.status, 400);
  // 9,900x (chance 0.01%) → max stake = 100,000 / 9,899 ≈ 10.10
  const r = await c.post('/api/games/dice/bet', { amount: 20, currency: 'USD', params: { target: 99.99, condition: 'over' } });
  assert.equal(r.status, 400);
  assert.equal(r.data.code, 'max_profit');
  assert.match(r.data.error, /maximum bet amount is 10\.1 USD/);
  const ok = await c.post('/api/games/dice/bet', { amount: 10, currency: 'USD', params: { target: 99.99, condition: 'over' } });
  assert.equal(ok.status, 200);
  const slide = await c.post('/api/slide/bet', { amount: 5, currency: 'USD', target: 1000000 });
  assert.equal(slide.status, 400);
});

test('challenges: the first qualifying bet wins the prize', async () => {
  const ch = app.plugins.challenges.data;
  const now = Date.now();
  // A test challenge any winning dice bet of $0.20+ can complete.
  ch.list.push({ id: 9999, game: 'dice', minMultiplier: 1.5, minBetUsd: 0.2, prizeUsd: 7, startsAt: now - 1000, endsAt: now + 60000, status: 'active', winner: null, betId: null });
  const c = await newPlayer(100);
  assert.ok((await c.get('/api/challenges?game=dice')).data.challenges.some((x) => x.id === 9999));
  // Too small a bet never qualifies.
  for (let i = 0; i < 3; i++) await c.post('/api/games/dice/bet', { amount: 0.1, currency: 'USD', params: { target: 50.5, condition: 'over' } });
  assert.equal(ch.list.find((x) => x.id === 9999).status, 'active');
  let won = null;
  for (let i = 0; i < 40 && !won; i++) {
    const r = await c.post('/api/games/dice/bet', { amount: 0.5, currency: 'USD', params: { target: 50.5, condition: 'over' } });
    if (r.data.bet.payout > 0) won = r.data.bet;
  }
  assert.ok(won, 'a dice win within 40 bets');
  const done = ch.list.find((x) => x.id === 9999);
  assert.equal(done.status, 'finished');
  assert.equal(done.betId, won.id);
  const mine = (await c.get('/api/challenges?status=mine')).data.challenges;
  assert.equal(mine[0].id, 9999);
  assert.equal(mine[0].winner.me, true);
  const txs = (await c.get('/api/wallet/transactions?type=bonus')).data;
  assert.ok(JSON.stringify(txs).includes('challenge'));
});

test('tips move play money between wallets; rain splits among recent chatters', async () => {
  const a = await newPlayer(100);
  const b = await newPlayer(0);
  const c = await newPlayer(0);
  const nameB = (await b.get('/api/me')).data.user.username;
  const nameA = (await a.get('/api/me')).data.user.username;
  assert.equal((await a.post('/api/tips', { to: nameA, amount: 1, currency: 'USD' })).status, 400, 'no self-tips');
  assert.equal((await a.post('/api/tips', { to: 'nobody_here', amount: 1, currency: 'USD' })).status, 400);
  const tip = await a.post('/api/tips', { to: nameB, amount: 5, currency: 'USD', public: true });
  assert.equal(tip.status, 200, JSON.stringify(tip.data));
  assert.equal(tip.data.balance.amount, 95);
  assert.equal((await b.get('/api/me')).data.user.balances.USD, 5);
  const notes = (await b.get('/api/notifications')).data;
  assert.equal(notes.notifications[0].kind, 'tip');
  const chat = (await a.get('/api/chat?room=en')).data.messages;
  assert.match(chat.at(-1).text, /tipped/);
  assert.equal((await a.post('/api/tips', { to: nameB, amount: 2000, currency: 'USD' })).status, 400, 'over balance / daily cap');
  // Rain needs recent chatters in the room.
  await b.post('/api/chat', { text: `hello @${nameA}`, room: 'es' });
  await new Promise((r) => setTimeout(r, 30));
  await c.post('/api/chat', { text: 'hola', room: 'es' });
  const mention = (await a.get('/api/notifications')).data.notifications.find((n) => n.kind === 'mention');
  assert.ok(mention, 'mentioned user is notified');
  const rain = await a.post('/api/rain', { amount: 10, currency: 'USD', users: 5, room: 'es' });
  assert.equal(rain.status, 200, JSON.stringify(rain.data));
  assert.equal(rain.data.users, 2);
  assert.equal(rain.data.share, 5);
  assert.equal((await c.get('/api/me')).data.user.balances.USD, 5);
  const profile = (await c.get(`/api/users/${nameB}`)).data.user;
  assert.equal(profile.username, nameB);
});

test('offers: welcome code once per new wallet, drop codes with wager and claim limits', async () => {
  const c = await newPlayer(0);
  const r = await c.post('/api/offers/redeem', { code: 'WELCOME', currency: 'USD' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.amount, 20);
  assert.equal((await c.post('/api/offers/redeem', { code: 'WELCOME', currency: 'USD' })).data.error, 'You already claimed the bonus.');
  assert.equal((await c.post('/api/offers/redeem', { code: 'NOPE', currency: 'USD' })).data.error, 'The bonus cannot be found or is unavailable.');
  const code = app.plugins.offers.drop();
  assert.equal((await c.post('/api/offers/redeem', { code, currency: 'USD' })).data.error, 'You have not met the weekly wager requirement to redeem this code.');
  for (let i = 0; i < 2; i++) await c.post('/api/games/dice/bet', { amount: 6, currency: 'USD', params: { target: 50.5, condition: 'over' } });
  const ok = await c.post('/api/offers/redeem', { code, currency: 'BTC' });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.currency, 'BTC');
  app.plugins.offers.codes[code].claims = 50;
  const d = await newPlayer(0);
  assert.equal((await d.post('/api/offers/redeem', { code, currency: 'USD' })).status, 400);
  const chat = (await c.get('/api/chat?room=en')).data.messages;
  assert.ok(chat.some((m) => m.code === code), 'DropBot posts the code in chat');
});

test('new coins: XRP deposits use a shared address plus destination tag; USDC, BNB, BCH credit', async () => {
  const a = await newPlayer(0);
  const b = await newPlayer(0);
  const xa = (await a.post('/api/payments/crypto/address', { currency: 'XRP' })).data;
  const xb = (await b.post('/api/payments/crypto/address', { currency: 'XRP' })).data;
  assert.equal(xa.address, xb.address);
  assert.match(xa.tag, /^\d{9}$/);
  assert.notEqual(xa.tag, xb.tag);
  const regen = (await a.post('/api/payments/crypto/address', { currency: 'XRP', regenerate: true })).data;
  assert.equal(regen.address, xa.address);
  for (const [currency, amount] of [['XRP', 50], ['USDC', 20], ['BNB', 0.05], ['BCH', 0.05]]) {
    const r = await a.post('/api/payments/crypto/simulate', { currency, amount });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    if (currency === 'XRP') assert.equal(r.data.transaction.details.tag, regen.tag);
  }
  await waitFor(async () => (await a.get('/api/me')).data.user.balances.BNB === 0.05, 20000);
  const me = (await a.get('/api/me')).data.user;
  assert.deepEqual([me.balances.XRP, me.balances.USDC, me.balances.BCH], [50, 20, 0.05]);
  const addr = 'r' + 'a'.repeat(30);
  assert.equal((await a.post('/api/payments/withdraw', { currency: 'XRP', amount: 10, address: addr, tag: 'abc' })).status, 400);
  assert.equal((await a.post('/api/payments/withdraw', { currency: 'XRP', amount: 10, address: addr, tag: '99999999999' })).status, 400);
  const w = await a.post('/api/payments/withdraw', { currency: 'XRP', amount: 10, address: addr, tag: '104729' });
  assert.equal(w.status, 200, JSON.stringify(w.data));
  assert.equal(w.data.transaction.details.tag, '104729');
  assert.equal((await a.post('/api/payments/withdraw', { currency: 'BCH', amount: 0.01, address: 'bitcoincash:q' + 'p'.repeat(41) })).status, 200);
});

test('unhash reveals a rotated server seed, never the active one', async () => {
  const c = await newPlayer(0);
  const { active } = (await c.get('/api/fair/seeds')).data;
  const live = await c.get(`/api/fair/unhash?hash=${active.serverSeedHash}`);
  assert.equal(live.status, 400);
  assert.match(live.data.error, /still in use/);
  assert.equal((await c.get(`/api/fair/unhash?hash=${active.nextServerSeedHash}`)).status, 400);
  assert.equal((await c.get('/api/fair/unhash?hash=nothex')).status, 400);
  await c.post('/api/fair/rotate', {});
  const r = await c.get(`/api/fair/unhash?hash=${active.serverSeedHash}`);
  assert.equal(r.status, 200);
  assert.equal(crypto.createHash('sha256').update(r.data.seed.serverSeed).digest('hex'), active.serverSeedHash);
  const other = await newPlayer(0);
  assert.equal((await other.get(`/api/fair/unhash?hash=${active.serverSeedHash}`)).status, 404);
});

test('my bets page back with a cursor; daily archive', async () => {
  const c = await newPlayer(100);
  for (let i = 0; i < 7; i++) {
    const game = i % 2 ? 'limbo' : 'dice';
    const params = game === 'dice' ? { target: 50, condition: 'over' } : { target: 2 };
    assert.equal((await c.post(`/api/games/${game}/bet`, { amount: 0.1, currency: 'USD', params })).status, 200);
  }
  const p1 = (await c.get('/api/bets/mine?limit=3')).data;
  assert.equal(p1.bets.length, 3);
  assert.equal(p1.hasMore, true);
  const p2 = (await c.get(`/api/bets/mine?limit=3&before=${p1.bets[2].id}`)).data;
  assert.ok(p2.bets.every((b) => b.id < p1.bets[2].id));
  const p3 = (await c.get(`/api/bets/mine?limit=3&before=${p2.bets[2].id}`)).data;
  assert.equal(p3.bets.length, 1);
  assert.equal(p3.hasMore, false);
  const dice = (await c.get('/api/bets/mine?limit=50&game=dice')).data.bets;
  assert.equal(dice.length, 4);
  const { days } = (await c.get('/api/bets/archive')).data;
  assert.equal(days.length, 1);
  assert.equal(days[0].bets, 7);
  const day = (await c.get(`/api/bets/archive/${days[0].day}`)).data;
  assert.equal(day.bets.length, 7);
  assert.ok(day.bets.every((b) => !('userId' in b)));
  assert.equal((await c.get('/api/bets/archive/yesterday')).status, 400);
});

test('two-factor: setup, enable, required for withdrawals, vault and tips, codes single-use', async () => {
  const { codeAt, stepAt } = await import('../server/totp.js');
  // Keep the whole test inside one 30 s step so s − 1 stays in the drift window.
  if (Date.now() % 30000 > 25000) await new Promise((r) => setTimeout(r, 30000 - (Date.now() % 30000) + 50));
  const c = await newPlayer(200);
  const other = await newPlayer(0);
  const otherName = (await other.get('/api/me')).data.user.username;
  const setup = (await c.post('/api/account/2fa/setup')).data;
  assert.match(setup.secret, /^[A-Z2-7]{32}$/);
  assert.match(setup.uri, /^otpauth:\/\/totp\/Fakesino%3A/);
  assert.equal((await c.post('/api/account/2fa/enable', { code: '000000' === codeAt(setup.secret, stepAt()) ? '111111' : '000000' })).status, 400);
  const s = stepAt();
  const en = await c.post('/api/account/2fa/enable', { code: codeAt(setup.secret, s) });
  assert.equal(en.status, 200, JSON.stringify(en.data));
  assert.equal(en.data.user.twoFactor, true);
  await c.post('/api/wallet/vault', { currency: 'USD', amount: 20, direction: 'deposit' });
  const noCode = await c.post('/api/wallet/vault', { currency: 'USD', amount: 5, direction: 'withdraw' });
  assert.equal(noCode.status, 400);
  assert.equal(noCode.data.field, 'code');
  assert.equal((await c.post('/api/tips', { to: otherName, amount: 1, currency: 'USD' })).data.field, 'code');
  const w = await c.post('/api/wallet/vault', { currency: 'USD', amount: 5, direction: 'withdraw', code: codeAt(setup.secret, s + 1) });
  assert.equal(w.status, 200, JSON.stringify(w.data));
  // The same code can't be used twice.
  assert.equal((await c.post('/api/wallet/vault', { currency: 'USD', amount: 5, direction: 'withdraw', code: codeAt(setup.secret, s + 1) })).status, 400);
  const off = await c.post('/api/account/2fa/disable', { code: codeAt(setup.secret, s - 1) });
  assert.equal(off.status, 200, JSON.stringify(off.data));
  assert.equal(off.data.user.twoFactor, false);
  assert.equal((await c.post('/api/tips', { to: otherName, amount: 1, currency: 'USD' })).status, 200);
});

test('wallet display settings: hide zero, display fiat currency', async () => {
  const c = await newPlayer(0);
  assert.equal((await c.get('/api/me')).data.user.settings.displayFiatCurrency, 'USD');
  const r = await c.post('/api/account/settings', { hideZero: true, displayFiat: true, displayFiatCurrency: 'JPY' });
  assert.equal(r.status, 200);
  assert.deepEqual([r.data.user.settings.hideZero, r.data.user.settings.displayFiat, r.data.user.settings.displayFiatCurrency], [true, true, 'JPY']);
  assert.equal((await c.post('/api/account/settings', { displayFiatCurrency: 'XYZ' })).status, 400);
  assert.equal((await c.post('/api/account/settings', { displayFiatCurrency: '__proto__' })).status, 400);
  assert.equal((await c.get('/api/me')).data.user.settings.displayFiatCurrency, 'JPY');
});

test('vault, rakeback and daily reload', async () => {
  const c = await newPlayer(100);
  const v = await c.post('/api/wallet/vault', { currency: 'USD', amount: 40, direction: 'deposit' });
  assert.equal(v.data.user.balances.USD, 60);
  assert.equal(v.data.user.vault.USD, 40);
  assert.equal((await c.post('/api/wallet/vault', { currency: 'USD', amount: 41, direction: 'withdraw' })).status, 400);
  await c.post('/api/wallet/vault', { currency: 'USD', amount: 40, direction: 'withdraw' });
  // Below Bronze, rakeback needs the welcome code.
  for (let i = 0; i < 4; i++) await c.post('/api/games/limbo/bet', { amount: 5, currency: 'USD', params: { target: 1.5 } });
  assert.equal((await c.post('/api/bonus/rakeback')).status, 400);
  await c.post('/api/offers/redeem', { code: 'WELCOME', currency: 'USD' });
  for (let i = 0; i < 20; i++) await c.post('/api/games/limbo/bet', { amount: 5, currency: 'USD', params: { target: 1.5 } });
  const rb = await c.post('/api/bonus/rakeback');
  assert.equal(rb.status, 200);
  assert.match((await c.post('/api/bonus/daily')).data.error, /unlocks at Bronze/);
});

test('VIP: level-up, weekly and daily bonuses from the edge you played', async () => {
  const c = await newPlayer(100);
  const me = (await c.get('/api/me')).data.user;
  const user = app.store.data.users[me.id];
  // Cross into Bronze with one more bet.
  user.stats.wageredUsd = 9999;
  await c.post('/api/games/dice/bet', { amount: 5, currency: 'USD', params: { target: 50.5, condition: 'over' } });
  let offers = (await c.get('/api/bonus/offers')).data;
  const lvl = offers.offers.find((o) => o.kind === 'levelup');
  assert.equal(lvl.amountUsd, 1, 'Bronze level-up pays $1');
  const claim = await c.post('/api/bonus/claim', { id: lvl.id, currency: 'USD' });
  assert.equal(claim.status, 200, JSON.stringify(claim.data));
  assert.equal((await c.post('/api/bonus/claim', { id: lvl.id, currency: 'USD' })).status, 404, 'claim once');
  // A week of play: $1,000 of edge last week, net loss → 10% × 1.2.
  const vip = app.plugins.vip;
  const sat = Date.UTC(2026, 9, 3); // Saturday 3 Oct 2026
  user.edgeDays = { '2026-10-05': { wagerUsd: 100000, edgeUsd: 1000, profitUsd: -500 } };
  vip.runWeekly(sat + 7 * 86400000 + 12.5 * 3600000);
  offers = (await c.get('/api/bonus/offers')).data;
  const weekly = offers.offers.find((o) => o.kind === 'weekly');
  assert.equal(weekly.amountUsd, 120);
  // Daily bonus: 10% of yesterday's edge.
  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  user.edgeDays[y] = { wagerUsd: 1000, edgeUsd: 10, profitUsd: 0 };
  const daily = await c.post('/api/bonus/daily', { currency: 'USD' });
  assert.equal(daily.status, 200, JSON.stringify(daily.data));
  assert.equal(daily.data.amount, 1);
  assert.equal((await c.post('/api/bonus/daily', { currency: 'USD' })).status, 400, 'once per UTC day');
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
  const res = await fetch(`${base}/api/auth/guest`, { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
  const nullOrigin = await fetch(`${base}/api/auth/guest`, { method: 'POST', headers: { origin: 'null', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(nullOrigin.status, 403);
  const form = await fetch(`${base}/api/auth/guest`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'deviceId=abc' });
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
