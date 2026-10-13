// Browser-side provably-fair verifier. Recomputes any bet from its seeds with
// WebCrypto, using exactly the same shared game modules as the server.
import { createArrayRng, bytesToFloat, FLOATS_PER_ROUND, crashPointFromHex, slidePointFromHex } from './shared/fair.js';
import { spinsFromBytes, hexToBytes, RING } from './shared/games/zoo.js';
import { resultFromHex as liveRouletteResult } from './shared/games/liveroulette.js';

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

// Load a game's rules. Bets record the rules version they were played under;
// older versions are kept frozen in shared/games/legacy/<game>.v<N>.js.
export async function loadRules(game, rulesVersion) {
  const current = await import(`./shared/games/${game}.js`);
  const latest = current.RULES_VERSION ?? 1;
  const v = Number(rulesVersion) || latest;
  if (v >= latest) return current;
  return import(`./shared/games/legacy/${game}.v${v}.js`);
}

export async function latestRulesVersion(game) {
  return (await import(`./shared/games/${game}.js`)).RULES_VERSION ?? 1;
}

// Recompute a bet. For multi-step games pass the recorded `actions` to replay
// the player's moves; without them you get the opening state.
export async function verifyBet({ game, serverSeed, clientSeed, nonce, params = {}, actions = [], rulesVersion }) {
  const mod = await loadRules(game, rulesVersion);
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

export async function crashPoint(hash, salt, formulaVersion = 1) {
  return crashPointFromHex(await hmacHex(hash, salt), formulaVersion);
}

// Shared-round results from a game hash: HMAC_SHA256(key = hash, msg = salt).
export async function roundResult(game, hash, salt, formulaVersion = 1) {
  const hex = await hmacHex(hash, salt);
  if (game === 'slide') return { point: slidePointFromHex(hex) };
  if (game === 'liveroulette') return liveRouletteResult(hex);
  if (game === 'zoo') {
    const tiles = spinsFromBytes(hexToBytes(hex));
    return { tiles, animals: tiles.map((t) => RING[t]) };
  }
  return { crashPoint: crashPointFromHex(hex, formulaVersion) };
}

// Walk a hash chain backwards to list previous rounds from one game hash.
export async function roundChain(game, hash, salt, count = 10, formulaVersion = 1) {
  const out = [];
  let h = hash;
  for (let i = 0; i < count; i++) {
    out.push({ hash: h, ...(await roundResult(game, h, salt, formulaVersion)) });
    h = await sha256Hex(h);
  }
  return out;
}

export const crashChain = (hash, salt, count = 10, formulaVersion = 1) => roundChain('crash', hash, salt, count, formulaVersion);
