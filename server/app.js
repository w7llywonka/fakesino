import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENCIES, isCurrency, roundDown } from '../public/js/shared/currencies.js';
import { Router, HttpError, badRequest, sendJson, readJson, parseCookies, cookie, rateLimiter } from './http.js';
import { Store } from './store.js';
import { LiveHub } from './live.js';
import { createEngine, GAMES } from './engine.js';
import { CrashGame } from './crash.js';
import { createPayments } from './payments.js';
import { rotateSeeds, publicSeeds, randomClientSeed } from './fair.js';
import {
  createUser,
  findByLogin,
  verifyPassword,
  hashPassword,
  createSession,
  sessionUser,
  publicUser,
  vipInfo,
  VIP_LEVELS,
  SESSION_TTL,
} from './accounts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

export function createApp({ dataFile = path.join(ROOT, 'data', 'db.json'), crashTiming, secureCookies = false } = {}) {
  const store = new Store(dataFile);
  const live = new LiveHub();
  const engine = createEngine({ store, live });
  const crash = new CrashGame({ store, live, engine, timing: crashTiming });
  const payments = createPayments({ store, live, publicUser });
  payments.recover();

  const authLimit = rateLimiter({ windowMs: 60_000, max: 20 });
  const betLimit = rateLimiter({ windowMs: 1000, max: 40 });
  const chatLimit = rateLimiter({ windowMs: 2000, max: 1 });

  const router = new Router();
  const authed = (fn) => (ctx) => {
    if (!ctx.user) throw new HttpError(401, 'Sign in to continue', { code: 'auth_required' });
    return fn(ctx);
  };

  // --- Auth -------------------------------------------------------------------------
  const startSession = (ctx, user) => {
    const token = createSession(store, user);
    ctx.setCookie(cookie('sid', token, { maxAge: SESSION_TTL / 1000, secure: secureCookies }));
    return { user: publicUser(user) };
  };

  router.post('/api/auth/register', (ctx) => {
    authLimit(`reg:${ctx.ip}`);
    if (!ctx.body.terms) throw badRequest('Please accept the terms to continue', { field: 'terms' });
    const user = createUser(store, ctx.body);
    return startSession(ctx, user);
  });

  router.post('/api/auth/login', (ctx) => {
    authLimit(`login:${ctx.ip}`);
    const user = findByLogin(store, ctx.body.login);
    if (!user || !verifyPassword(String(ctx.body.password || ''), user)) throw new HttpError(401, 'Invalid username or password', { field: 'password' });
    return startSession(ctx, user);
  });

  router.post('/api/auth/logout', (ctx) => {
    if (ctx.token) delete store.data.sessions[ctx.token];
    store.save();
    ctx.setCookie(cookie('sid', '', { maxAge: 0, secure: secureCookies }));
    return { ok: true };
  });

  router.get('/api/me', (ctx) => ({ user: ctx.user ? publicUser(ctx.user) : null }));

  router.get('/api/config', () => ({
    currencies: CURRENCIES,
    vipLevels: VIP_LEVELS,
    games: Object.fromEntries(Object.entries(GAMES).map(([slug, g]) => [slug, { name: g.name, edge: g.edge }])),
    payments: payments.methods(),
  }));

  // --- Account ----------------------------------------------------------------------
  router.post(
    '/api/account/settings',
    authed((ctx) => {
      const allowed = ['hideZero', 'displayFiat', 'privateMode', 'sound', 'animations', 'maxBetWarning'];
      for (const k of allowed) if (k in ctx.body) ctx.user.settings[k] = !!ctx.body[k];
      store.save();
      return { user: publicUser(ctx.user) };
    }),
  );

  router.post(
    '/api/account/password',
    authed((ctx) => {
      if (!verifyPassword(String(ctx.body.current || ''), ctx.user)) throw badRequest('Current password is incorrect', { field: 'current' });
      const next = String(ctx.body.next || '');
      if (next.length < 8) throw badRequest('New password must be at least 8 characters', { field: 'next' });
      const { salt, hash } = hashPassword(next);
      ctx.user.salt = salt;
      ctx.user.passHash = hash;
      // Sign out other sessions.
      for (const [t, s] of Object.entries(store.data.sessions)) if (s.userId === ctx.user.id && t !== ctx.token) delete store.data.sessions[t];
      store.save();
      return { ok: true };
    }),
  );

  router.post(
    '/api/wallet/currency',
    authed((ctx) => {
      if (!isCurrency(ctx.body.currency)) throw badRequest('Unsupported currency');
      ctx.user.currency = ctx.body.currency;
      store.save();
      return { user: publicUser(ctx.user) };
    }),
  );

  router.get(
    '/api/wallet/transactions',
    authed((ctx) => ({ transactions: payments.transactions(ctx.user, { type: ctx.query.get('type'), limit: Math.min(200, Number(ctx.query.get('limit')) || 50) }) })),
  );

  router.post('/api/wallet/vault', authed((ctx) => payments.vault(ctx.user, ctx.body)));

  // --- Payments ---------------------------------------------------------------------
  router.post('/api/payments/card', authed((ctx) => payments.cardDeposit(ctx.user, ctx.body)));
  router.post('/api/payments/:id/authenticate', authed((ctx) => payments.authenticate(ctx.user, ctx.params.id, ctx.body)));
  router.post('/api/payments/crypto/address', authed((ctx) => payments.depositAddress(ctx.user, ctx.body)));
  router.post('/api/payments/crypto/simulate', authed((ctx) => payments.simulateCryptoDeposit(ctx.user, ctx.body)));
  router.post('/api/payments/withdraw', authed((ctx) => payments.withdraw(ctx.user, ctx.body)));
  router.post('/api/payments/cards/:id/remove', authed((ctx) => payments.removeCard(ctx.user, ctx.params.id)));
  router.post('/api/bonus/rakeback', authed((ctx) => payments.claimRakeback(ctx.user)));
  router.post('/api/bonus/daily', authed((ctx) => payments.claimDaily(ctx.user)));

  // --- Fairness ---------------------------------------------------------------------
  router.get(
    '/api/fair/seeds',
    authed((ctx) => ({
      active: publicSeeds(ctx.user),
      history: (ctx.user.seedHistory || []).slice(0, 20),
      locked: Object.keys(ctx.user.active || {}),
    })),
  );

  router.post(
    '/api/fair/rotate',
    authed((ctx) => {
      const active = Object.keys(ctx.user.active || {});
      if (active.length) throw badRequest(`Finish your ${GAMES[active[0]]?.name || active[0]} game before changing seeds`);
      let clientSeed = ctx.body.clientSeed == null ? randomClientSeed() : String(ctx.body.clientSeed).trim();
      if (!clientSeed || clientSeed.length > 64) throw badRequest('Client seed must be 1–64 characters', { field: 'clientSeed' });
      const revealed = rotateSeeds(ctx.user, clientSeed);
      store.save();
      return { revealed, active: publicSeeds(ctx.user), user: publicUser(ctx.user) };
    }),
  );

  router.get('/api/fair/crash', () => crash.fairness());

  // --- Games ------------------------------------------------------------------------
  router.post(
    '/api/games/:slug/bet',
    authed((ctx) => {
      betLimit(`bet:${ctx.user.id}`);
      return engine.playInstant(ctx.user, ctx.params.slug, ctx.body);
    }),
  );
  router.post(
    '/api/games/:slug/action',
    authed((ctx) => {
      betLimit(`bet:${ctx.user.id}`);
      return engine.actStateful(ctx.user, ctx.params.slug, ctx.body);
    }),
  );
  router.get('/api/games/:slug/active', authed((ctx) => engine.getActive(ctx.user, ctx.params.slug)));

  router.get('/api/crash/state', (ctx) => crash.stateFor(ctx.user));
  router.post('/api/crash/bet', authed((ctx) => crash.placeBet(ctx.user, ctx.body)));
  router.post('/api/crash/cashout', authed((ctx) => crash.cashout(ctx.user)));
  router.post('/api/crash/cancel', authed((ctx) => crash.cancelBet(ctx.user)));

  // --- Bets & stats -------------------------------------------------------------------
  router.get('/api/bets/mine', authed((ctx) => ({ bets: engine.myBets(ctx.user, { limit: Math.min(200, Number(ctx.query.get('limit')) || 50), game: ctx.query.get('game') || undefined }) })));
  router.get('/api/bets/recent', (ctx) =>
    ({ bets: engine.recentBets({ limit: Math.min(100, Number(ctx.query.get('limit')) || 30), minUsd: Number(ctx.query.get('minUsd')) || 0, game: ctx.query.get('game') || undefined }) }),
  );
  router.get('/api/bets/:id', (ctx) => ({ bet: engine.betDetails(ctx.user, ctx.params.id) }));

  router.get(
    '/api/stats',
    authed((ctx) => ({ stats: ctx.user.stats, vip: vipInfo(ctx.user.stats.wageredUsd) })),
  );

  router.get('/api/leaderboard', (ctx) => {
    const period = ctx.query.get('period') || 'day';
    const since = period === 'all' ? 0 : Date.now() - (period === 'week' ? 7 : 1) * 86400000;
    const totals = new Map();
    for (let i = store.data.bets.length - 1; i >= 0; i--) {
      const b = store.data.bets[i];
      if (b.createdAt < since) break;
      const u = store.data.users[b.userId];
      if (!u) continue;
      const e = totals.get(b.userId) || { username: u.settings.privateMode ? null : u.username, wageredUsd: 0, bets: 0 };
      e.wageredUsd += b.amountUsd || 0;
      e.bets++;
      totals.set(b.userId, e);
    }
    return { period, leaders: [...totals.values()].sort((a, b) => b.wageredUsd - a.wageredUsd).slice(0, 20) };
  });

  // --- Chat --------------------------------------------------------------------------
  router.get('/api/chat', () => ({ messages: store.data.chat.slice(-60) }));
  router.post(
    '/api/chat',
    authed((ctx) => {
      chatLimit(`chat:${ctx.user.id}`);
      const text = String(ctx.body.text || '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .trim()
        .slice(0, 200);
      if (!text) throw badRequest('Message is empty');
      const msg = { id: store.nextId('msg'), username: ctx.user.username, vip: vipInfo(ctx.user.stats.wageredUsd).level, text, at: Date.now() };
      store.data.chat.push(msg);
      if (store.data.chat.length > 200) store.data.chat.splice(0, store.data.chat.length - 200);
      store.save();
      live.broadcast('chat', msg);
      return { message: msg };
    }),
  );

  router.get('/api/live', (ctx) => {
    live.connect(ctx.req, ctx.res, ctx.user?.id ?? null, { serverTime: Date.now(), crash: crash.stateFor(ctx.user) });
    return undefined; // streaming
  });

  // --- HTTP plumbing -------------------------------------------------------------------
  async function handleApi(req, res, url) {
    const match = router.match(req.method, url.pathname);
    if (!match) return sendJson(res, 404, { error: 'Not found' });
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies.sid;
    const setCookies = [];
    const ctx = {
      req,
      res,
      params: match.params,
      query: url.searchParams,
      token,
      user: sessionUser(store, token),
      ip: req.socket.remoteAddress,
      body: {},
      setCookie: (c) => setCookies.push(c),
    };
    try {
      if (req.method === 'POST') {
        // Same-origin check for state-changing requests.
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'Cross-origin request blocked');
        ctx.body = await readJson(req);
      }
      const result = await match.handler(ctx);
      if (result === undefined) return; // handler streamed its own response
      sendJson(res, 200, result, setCookies.length ? { 'Set-Cookie': setCookies } : {});
    } catch (err) {
      if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message, ...err.extra });
      console.error('[api]', req.method, url.pathname, err);
      sendJson(res, 500, { error: 'Something went wrong' });
    }
  }

  function serveStatic(req, res, url) {
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    let file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC)) {
      res.writeHead(403);
      return res.end();
    }
    // Client-side routes fall back to the SPA shell.
    if (!path.extname(file) || !fs.existsSync(file)) {
      if (path.extname(rel) && rel !== '/index.html') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not found');
      }
      file = path.join(PUBLIC, 'index.html');
    }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not found');
      }
      const etag = `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, { ETag: etag });
        return res.end();
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache',
        ETag: etag,
        ...SECURITY_HEADERS,
      });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    });
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      return res.end();
    }
    serveStatic(req, res, url);
  });

  crash.start();

  function close() {
    crash.stop();
    payments.stop();
    live.close();
    store.flush();
    return new Promise((resolve) => server.close(() => resolve()));
  }

  return { server, store, crash, engine, close, roundDown };
}
