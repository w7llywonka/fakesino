import crypto from 'node:crypto';
import { badRequest } from './http.js';

// Time-based one-time passwords (RFC 6238: HMAC-SHA1, 6 digits, 30 s steps),
// compatible with standard authenticator apps.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_MS = 30_000;

export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of str.replace(/=+$/, '').toUpperCase()) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32Encode(crypto.randomBytes(20));
export const stepAt = (t = Date.now()) => Math.floor(t / STEP_MS);

export function codeAt(secret, step) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

export const otpauthUri = (secret, account) => `otpauth://totp/${encodeURIComponent(`Fakesino:${account}`)}?secret=${secret}&issuer=Fakesino&algorithm=SHA1&digits=6&period=30`;

// Returns the matching step (±1 step of clock drift) or null.
export function matchStep(secret, code, now = Date.now()) {
  const c = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const s = stepAt(now);
  for (const step of [s, s - 1, s + 1]) if (crypto.timingSafeEqual(Buffer.from(codeAt(secret, step)), Buffer.from(c))) return step;
  return null;
}

// Throws unless `code` is a valid code for a user with 2FA on. Each code
// works once: the steps already used inside the drift window are remembered.
export function requireTwoFactor(user, code) {
  if (!user.totp) return;
  if (code == null || code === '') throw badRequest('Enter your two-factor code', { field: 'code', code: 'two_factor_required' });
  const step = matchStep(user.totp.secret, code);
  const used = user.totp.used || [];
  if (step == null || used.includes(step)) throw badRequest('Invalid two-factor code', { field: 'code', code: 'two_factor_invalid' });
  user.totp.used = [...used.filter((s) => s >= stepAt() - 2), step];
}
