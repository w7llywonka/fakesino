// Browser-side provably-fair verifier. Recomputes any bet from its seeds with
// WebCrypto, using exactly the same shared game modules as the server.
import { createArrayRng, bytesToFloat, FLOATS_PER_ROUND, crashPointFromHex } from './shared/fair.js';

const enc = new TextEncoder();

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

export async function hmacHex(secret, message) {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function floats(serverSeed, clientSeed, nonce, count) {
  const key = await hmacKey(serverSeed);
  const rounds = Math.ceil(count / FLOATS_PER_ROUND);
  const out = [];
  for (let r = 0; r < rounds; r++) {
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${clientSeed}:${nonce}:${r}`)));
    for (let i = 0; i < FLOATS_PER_ROUND && out.length < count; i++) out.push(bytesToFloat(sig, i * 4));
  }
  return out;
}

const loaders = {
  dice: () => import('./shared/games/dice.js'),
  limbo: () => import('./shared/games/limbo.js'),
  plinko: () => import('./shared/games/plinko.js'),
  mines: () => import('./shared/games/mines.js'),
  keno: () => import('./shared/games/keno.js'),
  wheel: () => import('./shared/games/wheel.js'),
  coinflip: () => import('./shared/games/coinflip.js'),
  roulette: () => import('./shared/games/roulette.js'),
  baccarat: () => import('./shared/games/baccarat.js'),
  hilo: () => import('./shared/games/hilo.js'),
  blackjack: () => import('./shared/games/blackjack.js'),
  videopoker: () => import('./shared/games/videopoker.js'),
  tower: () => import('./shared/games/tower.js'),
  slots: () => import('./shared/games/slots.js'),
};

export const VERIFIABLE = Object.keys(loaders);

// Recompute a bet. For multi-step games pass the recorded `actions` to replay
// the player's moves; without them you get the opening state.
export async function verifyBet({ game, serverSeed, clientSeed, nonce, params = {}, actions = [] }) {
  const mod = await loaders[game]();
  const normalized = mod.normalize({ ...params, allowEmpty: true });
  let count = 64;
  for (;;) {
    const fl = await floats(serverSeed, clientSeed, Number(nonce), count);
    const rng = createArrayRng(fl);
    try {
      if (!mod.stateful) return { result: mod.outcome(rng, normalized), params: normalized };
      const state = mod.start(rng, normalized);
      for (const step of actions) {
        if (state.done) break;
        mod.act(state, step.action, step.data || {}, rng);
      }
      return { result: { ...mod.view(state), multiplier: state.wager ? state.payout / state.wager : 0 }, state, params: normalized };
    } catch (err) {
      if (err instanceof RangeError && count < 8192) {
        count *= 4;
        continue;
      }
      throw err;
    }
  }
}

export async function crashPoint(hash, salt) {
  return crashPointFromHex(await hmacHex(hash, salt));
}

// Walk the hash chain backwards to list previous rounds from one game hash.
export async function crashChain(hash, salt, count = 10) {
  const out = [];
  let h = hash;
  for (let i = 0; i < count; i++) {
    out.push({ hash: h, crashPoint: await crashPoint(h, salt) });
    h = await sha256Hex(h);
  }
  return out;
}
