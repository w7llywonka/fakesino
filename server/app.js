import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENCIES, CURRENCY_CODES, isCurrency, isDisplayFiat, roundDown } from '../public/js/shared/currencies.js';
import { Router, HttpError, badRequest, sendJson, readJson, parseCookies, cookie, rateLimiter } from './http.js';
import { Store } from './store.js';
import { LiveHub } from './live.js';
import { createEngine, GAMES } from './engine.js';
import { publicCatalog } from './catalog.js';
import { PLUGINS } from './plugins/index.js';
import { createNotifier } from './notify.js';
import { CrashGame } from './crash.js';
import { createPayments } from './payments.js';
import { rotateSeeds, publicSeeds, randomClientSeed } from './fair.js';
import {
  DEVICE_RE,
  createGuest,
  userForDevice,
  linkDevice,
  renameUser,
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

export function createApp({ dataFile = path.join(ROOT, 'data', 'db.json'), crashTiming, roundTiming = {}, secureCookies = false } = {}) {
  const store = new Store(dataFile);
  // Coins listed after a wallet was created start at zero in it.
  for (const u of Object.values(store.data.users || {}))
    for (const field of ['balances', 'vault', 'rakeback']) if (u[field]) for (const c of CURRENCY_CODES) u[field][c] ??= 0;
  const live = new LiveHub();
  const engine = createEngine({ store, live });
  const crash = new CrashGame({ store, live, engine, timing: crashTiming });
  const notifier = createNotifier({ store, live });
  const payments = createPayments({ store, live, publicUser, notify: notifier.notify });
  payments.recover();

  const guestLimit = rateLimiter({ windowMs: 60_000, max: Number(process.env.FAKESINO_GUEST_LIMIT) || 30 });
  const betLimit = rateLimiter({ windowMs: 1000, max: 40 });

  const router = new Router();
  const authed = (fn) => (ctx) => {
    if (!ctx.user) throw new HttpError(401, 'Your wallet session expired', { code: 'auth_required' });
    return fn(ctx);
  };

  // --- Wallet identity ----------------------------------------------------------------
  // There are no sign-ups. Each browser keeps a random device key in local
  // storage; the server stores only its hash and maps it to a wallet. If the
  // server no longer knows the key (fresh database, new server), the browser's
  // saved snapshot rebuilds the wallet.
  const startSession = (ctx, user) => {
    const token = createSession(store, user);
    ctx.setCookie(cookie('sid', token, { maxAge: SESSION_TTL / 1000, secure: secureCookies }));
  };

  router.post('/api/auth/guest', (ctx) => {
    const deviceId = String(ctx.body.deviceId || ctx.walletKey || '').toLowerCase();
    if (!DEVICE_RE.test(deviceId)) throw badRequest('Invalid wallet key', { field: 'deviceId' });
    const known = userForDevice(store, deviceId);
    if (ctx.body.mustExist && !known) throw new HttpError(404, 'No wallet found for that key', { field: 'deviceId' });
    if (known) {
      if (!ctx.user || ctx.user.id !== known.id) startSession(ctx, known);
      return { user: publicUser(known), created: false, restored: false };
    }
    // An unknown key with an identified wallet (e.g. local storage was cleared
    // but the cookie survived) is re-linked to that wallet, unless the browser
    // explicitly asked for a brand-new one.
    if (ctx.user && !ctx.body.fresh) {
      linkDevice(store, deviceId, ctx.user);
      return { user: publicUser(ctx.user), created: false, restored: false };
    }
    guestLimit(`guest:${ctx.ip}`);
    const { user, restored } = createGuest(store, ctx.body.fresh ? null : ctx.body.restore);
    linkDevice(store, deviceId, user);
    startSession(ctx, user);
    return { user: publicUser(user), created: true, restored };
  });

  // EventSource can't send headers, so the live feed authenticates with a
  // short-lived ticket obtained over a normal (header-authenticated) request.
  const liveTickets = new Map();
  router.post(
    '/api/live/ticket',
    authed((ctx) => {
      const now = Date.now();
      for (const [t, v] of liveTickets) if (v.exp < now) liveTickets.delete(t);
      const ticket = crypto.randomBytes(24).toString('hex');
      liveTickets.set(ticket, { userId: ctx.user.id, exp: now + 12 * 3600 * 1000 });
      return { ticket };
    }),
  );

  router.get('/api/me', (ctx) => ({ user: ctx.user ? publicUser(ctx.user) : null }));

  router.get('/api/config', () => ({
    currencies: CURRENCIES,
    vipLevels: VIP_LEVELS,
    games: publicCatalog(),
    payments: payments.methods(),
  }));

  // --- Account ----------------------------------------------------------------------
  router.post(
    '/api/account/settings',
    authed((ctx) => {
      const allowed = ['hideZero', 'displayFiat', 'privateMode', 'sound', 'animations', 'maxBetWarning'];
      for (const k of allowed) if (k in ctx.body) ctx.user.settings[k] = !!ctx.body[k];
      if ('displayFiatCurrency' in ctx.body) {
        if (!isDisplayFiat(ctx.body.displayFiatCurrency)) throw badRequest('Unsupported display currency', { field: 'displayFiatCurrency' });
        ctx.user.settings.displayFiatCurrency = ctx.body.displayFiatCurrency;
      }
      store.save();
      return { user: publicUser(ctx.user) };
    }),
  );

  router.post(
    '/api/account/username',
    authed((ctx) => ({ user: publicUser(renameUser(store, ctx.user, ctx.body.username)) })),
  );

  router.post(
    '/api/account/limits',
    authed((ctx) => {
      const u = ctx.user;
      u.limits ||= { depositDailyUsd: null, breakUntil: 0 };
      if ('depositDailyUsd' in ctx.body) {
        const v = ctx.body.depositDailyUsd;
        if (v === null || v === '') u.limits.depositDailyUsd = null;
        else {
          const n = Number(v);
          if (!Number.isFinite(n) || n < 10 || n > 1_000_000) throw badRequest('Daily limit must be between $10 and $1,000,000', { field: 'depositDailyUsd' });
          u.limits.depositDailyUsd = Math.floor(n);
        }
      }
      if (ctx.body.breakHours != null) {
        const h = Number(ctx.body.breakHours);
        if (![24, 168, 720].includes(h)) throw badRequest('Choose 24 hours, 7 days or 30 days');
        if (Object.keys(u.active || {}).length) throw badRequest('Finish your active games before taking a break');
        u.limits.breakUntil = Math.max(u.limits.breakUntil || 0, Date.now() + h * 3600 * 1000);
      }
      store.save();
      return { user: publicUser(u) };
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
    authed((ctx) => ({ transactions: payments.transactions(ctx.user, { type: ctx.query.get('type'), status: ctx.query.get('status') || undefined, limit: Math.min(200, Number(ctx.query.get('limit')) || 50) }) })),
  );

  router.post('/api/wallet/vault', authed((ctx) => payments.vault(ctx.user, ctx.body)));

  // --- Payments ---------------------------------------------------------------------
  router.post('/api/payments/card', authed((ctx) => payments.cardDeposit(ctx.user, ctx.body)));
  router.post('/api/payments/:id/authenticate', authed((ctx) => payments.authenticate(ctx.user, ctx.params.id, ctx.body)));
  router.post('/api/payments/crypto/address', authed((ctx) => payments.depositAddress(ctx.user, ctx.body)));
  router.post('/api/payments/crypto/simulate', authed((ctx) => payments.simulateCryptoDeposit(ctx.user, ctx.body)));
  router.get('/api/payments/buy/quotes', (ctx) => payments.buyQuotes(Object.fromEntries(ctx.query)));
  router.get('/api/payments/swap/quote', (ctx) => payments.swapQuote(Object.fromEntries(ctx.query)));
  router.post('/api/payments/swap', authed((ctx) => payments.swap(ctx.user, ctx.body)));
  router.get('/api/wallet/transactions/:id', authed((ctx) => payments.transaction(ctx.user, ctx.params.id)));
  router.get('/api/explorer/tx/:hash', (ctx) => payments.explorerTx(ctx.params.hash));
  router.post('/api/payments/withdraw', authed((ctx) => payments.withdraw(ctx.user, ctx.body)));
  router.post('/api/payments/cards/:id/remove', authed((ctx) => payments.removeCard(ctx.user, ctx.params.id)));
  router.post('/api/bonus/rakeback', authed((ctx) => payments.claimRakeback(ctx.user)));
  // Daily bonus, weekly/monthly/level-up/reload offers: server/plugins/vip.js.

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

  // Chat, tips and rain live in server/plugins/social.js.

  router.get('/api/live', (ctx) => {
    const t = liveTickets.get(ctx.query.get('ticket') || '');
    const user = t && t.exp > Date.now() ? store.data.users[t.userId] : ctx.user;
    live.connect(ctx.req, ctx.res, user?.id ?? null, { serverTime: Date.now(), authed: !!user, crash: crash.stateFor(user) });
    return undefined; // streaming
  });

  // --- Notifications (header bell) ----------------------------------------------------
  router.get('/api/notifications', authed((ctx) => notifier.list(ctx.user.id)));
  router.post('/api/notifications/read', authed((ctx) => notifier.markRead(ctx.user.id, ctx.body.all ? 'all' : ctx.body.ids)));

  // --- Plugins (multiplayer games, site features) ------------------------------------
  const plugins = {};
  const pluginHandles = PLUGINS.map((p) => {
    try {
      const handle = p.register({ router, store, live, engine, crash, payments, notify: notifier.notify, authed, publicUser, secureCookies, betLimit, roundDown, timing: roundTiming[p.name] }) || null;
      plugins[p.name] = handle;
      return handle;
    } catch (err) {
      console.error(`[plugin:${p.name}] failed to register`, err);
      return null;
    }
  });

  // --- HTTP plumbing -------------------------------------------------------------------
  async function handleApi(req, res, url) {
    const match = router.match(req.method, url.pathname);
    if (!match) return sendJson(res, 404, { error: 'Not found' });
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies.sid;
    // Identify the wallet: the X-Wallet-Key header first, the session cookie as
    // a fallback (and to re-link a browser whose key changed).
    const rawKey = String(req.headers['x-wallet-key'] || '').toLowerCase();
    const walletKey = DEVICE_RE.test(rawKey) ? rawKey : null;
    let user = walletKey ? userForDevice(store, walletKey) : null;
    if (!user) {
      user = sessionUser(store, token);
      if (user && walletKey && req.method === 'POST' && url.pathname !== '/api/auth/guest') linkDevice(store, walletKey, user);
    }
    const setCookies = [];
    const ctx = {
      req,
      res,
      params: match.params,
      query: url.searchParams,
      token,
      walletKey,
      user,
      ip: req.socket.remoteAddress,
      body: {},
      setCookie: (c) => setCookies.push(c),
    };
    try {
      if (req.method === 'POST') {
        // Same-origin check for state-changing requests.
        const origin = req.headers.origin;
        if (origin) {
          let host = null;
          try {
            host = new URL(origin).host;
          } catch {
            /* "null" or malformed origin */
          }
          if (host !== req.headers.host) throw new HttpError(403, 'Cross-origin request blocked');
        }
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
    for (const h of pluginHandles) h?.close?.();
    crash.stop();
    payments.stop();
    live.close();
    store.flush();
    return new Promise((resolve) => server.close(() => resolve()));
  }

  return { server, store, crash, engine, plugins, close, roundDown };
}
