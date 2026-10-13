import { CATALOG } from '../catalog.js';

const VIEW_MS = 75_000; // a viewer counts for this long after their last ping
const BET_MS = 5 * 60_000; // anyone who bet in the last five minutes counts
const BROADCAST_MS = 10_000;

// "N playing" counts per game: browsers ping while a game is open, and
// recent bettors count too. Broadcast to everyone every ten seconds.
export default function register({ router, store, live }) {
  const viewers = new Map(); // slug → Map(viewerKey → lastSeen)

  function counts() {
    const now = Date.now();
    const out = {};
    const add = (slug, key) => ((out[slug] ||= new Set()).add(key));
    for (const [slug, m] of viewers)
      for (const [key, at] of m) {
        if (now - at > VIEW_MS) m.delete(key);
        else add(slug, key);
      }
    const bets = store.data.bets;
    for (let i = bets.length - 1; i >= 0 && now - bets[i].createdAt < BET_MS; i--) add(bets[i].game, `u:${bets[i].userId}`);
    return Object.fromEntries(Object.entries(out).map(([slug, set]) => [slug, set.size]));
  }

  router.post('/api/presence', (ctx) => {
    const slug = String(ctx.body?.slug || '');
    if (!CATALOG[slug]) return { ok: false };
    const key = ctx.user ? `u:${ctx.user.id}` : `ip:${ctx.ip}`;
    if (!viewers.has(slug)) viewers.set(slug, new Map());
    // A browser views one game at a time.
    for (const m of viewers.values()) m.delete(key);
    viewers.get(slug).set(key, Date.now());
    return { ok: true, counts: counts() };
  });
  router.get('/api/presence', () => ({ counts: counts() }));

  const timer = setInterval(() => live.channel('presence', 'counts', counts()), BROADCAST_MS);
  timer.unref?.();
  return { close: () => clearInterval(timer) };
}
