import crypto from 'node:crypto';
import { createStreamRng } from '../public/js/shared/fair.js';

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const randomHex = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export function randomClientSeed(len = 10) {
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}

export function hmacDigest(serverSeed, message) {
  return crypto.createHmac('sha256', serverSeed).update(message).digest();
}

export function createRng({ serverSeed, clientSeed, nonce }, start = 0) {
  return createStreamRng((round) => hmacDigest(serverSeed, `${clientSeed}:${nonce}:${round}`), start);
}

export function initialSeeds() {
  const serverSeed = randomHex();
  const nextServerSeed = randomHex();
  return {
    serverSeed,
    serverSeedHash: sha256(serverSeed),
    clientSeed: randomClientSeed(),
    nonce: 0,
    nextServerSeed,
    nextServerSeedHash: sha256(nextServerSeed),
    createdAt: Date.now(),
  };
}

// Consume one nonce from the user's active seed pair.
export function takeNonce(user) {
  const s = user.seeds;
  const used = { serverSeed: s.serverSeed, serverSeedHash: s.serverSeedHash, clientSeed: s.clientSeed, nonce: s.nonce };
  s.nonce += 1;
  return used;
}

export function rotateSeeds(user, clientSeed) {
  const prev = user.seeds;
  const revealed = {
    serverSeed: prev.serverSeed,
    serverSeedHash: prev.serverSeedHash,
    clientSeed: prev.clientSeed,
    nonce: prev.nonce,
    createdAt: prev.createdAt,
    revealedAt: Date.now(),
  };
  user.seedHistory = [revealed, ...(user.seedHistory || [])].slice(0, 100);
  const nextServerSeed = randomHex();
  user.seeds = {
    serverSeed: prev.nextServerSeed,
    serverSeedHash: prev.nextServerSeedHash,
    clientSeed: clientSeed || randomClientSeed(),
    nonce: 0,
    nextServerSeed,
    nextServerSeedHash: sha256(nextServerSeed),
    createdAt: Date.now(),
  };
  return revealed;
}

export function publicSeeds(user) {
  const s = user.seeds;
  return {
    clientSeed: s.clientSeed,
    serverSeedHash: s.serverSeedHash,
    nonce: s.nonce,
    nextServerSeedHash: s.nextServerSeedHash,
  };
}

export function revealedSeed(user, serverSeedHash) {
  return (user.seedHistory || []).find((s) => s.serverSeedHash === serverSeedHash) || null;
}
