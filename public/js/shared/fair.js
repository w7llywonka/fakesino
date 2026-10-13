// Provably fair primitives shared by server and browser.
//
// Every bet is derived from HMAC_SHA256(key = serverSeed, msg = `${clientSeed}:${nonce}:${round}`).
// Each 32-byte digest yields 8 floats (4 bytes each); `round` increments when
// a game needs more than 8. A float is sum(byte_i / 256^(i+1)) for i in 0..3,
// giving a uniform value in [0, 1).

export const BYTES_PER_FLOAT = 4;
export const BYTES_PER_ROUND = 32;

export function bytesToFloat(bytes, offset = 0) {
  let f = 0;
  for (let i = 0; i < BYTES_PER_FLOAT; i++) f += bytes[offset + i] / 256 ** (i + 1);
  return f;
}

export function bytesToFloats(bytes, count) {
  const out = new Array(count);
  for (let i = 0; i < count; i++) out[i] = bytesToFloat(bytes, i * BYTES_PER_FLOAT);
  return out;
}

// Generic driver: `digest(round)` returns 32 bytes for that round (sync or async).
export function collectBytes(digest, count, cursor = 0) {
  const need = count * BYTES_PER_FLOAT;
  const bytes = [];
  let round = Math.floor(cursor / BYTES_PER_ROUND);
  let pos = cursor % BYTES_PER_ROUND;
  while (bytes.length < need) {
    const buf = digest(round);
    for (let i = pos; i < BYTES_PER_ROUND && bytes.length < need; i++) bytes.push(buf[i]);
    pos = 0;
    round++;
  }
  return bytes;
}

export async function collectBytesAsync(digest, count, cursor = 0) {
  const need = count * BYTES_PER_FLOAT;
  const bytes = [];
  let round = Math.floor(cursor / BYTES_PER_ROUND);
  let pos = cursor % BYTES_PER_ROUND;
  while (bytes.length < need) {
    const buf = await digest(round);
    for (let i = pos; i < BYTES_PER_ROUND && bytes.length < need; i++) bytes.push(buf[i]);
    pos = 0;
    round++;
  }
  return bytes;
}

// Fisher-Yates style selection used by Mines, Keno and card shoes: each float
// picks an index from the items that remain.
export function shuffleSelect(floats, items) {
  const pool = items.slice();
  const out = [];
  for (const f of floats) {
    if (!pool.length) break;
    const idx = Math.floor(f * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

// --- Crash hash chain -------------------------------------------------------

export const CRASH_GROWTH = 0.00006;

export function crashPointFromHex(hmacHex) {
  // 52 bits of entropy → x in [0, 1). P(crash >= m) = 0.99 / m (1% edge).
  const h = parseInt(hmacHex.slice(0, 13), 16);
  const x = h / 2 ** 52;
  const raw = Math.floor(99 / (1 - x)) / 100;
  return Math.max(1, raw);
}

export function crashMultiplierAt(ms) {
  if (ms <= 0) return 1;
  return Math.floor(100 * Math.exp(CRASH_GROWTH * ms)) / 100;
}

export function crashTimeFor(multiplier) {
  return Math.log(multiplier) / CRASH_GROWTH;
}

// --- Float streams ------------------------------------------------------------
// Games consume floats through an rng with `next()`. Float i lives in HMAC
// round floor(i / 8) at byte offset (i % 8) * 4, so streams can resume at any
// index (stateful games store their cursor between actions).

export const FLOATS_PER_ROUND = BYTES_PER_ROUND / BYTES_PER_FLOAT;

export function createStreamRng(digest, start = 0) {
  const cache = new Map();
  let index = start;
  const at = (i) => {
    const round = Math.floor(i / FLOATS_PER_ROUND);
    let buf = cache.get(round);
    if (!buf) {
      buf = digest(round);
      cache.set(round, buf);
    }
    return bytesToFloat(buf, (i % FLOATS_PER_ROUND) * BYTES_PER_FLOAT);
  };
  return {
    next() {
      return at(index++);
    },
    take(n) {
      const out = [];
      for (let i = 0; i < n; i++) out.push(at(index++));
      return out;
    },
    get index() {
      return index;
    },
  };
}

export function createArrayRng(floats, start = 0) {
  let index = start;
  const at = (i) => {
    if (i >= floats.length) throw new RangeError('Float stream exhausted');
    return floats[i];
  };
  return {
    next() {
      return at(index++);
    },
    take(n) {
      const out = [];
      for (let i = 0; i < n; i++) out.push(at(index++));
      return out;
    },
    get index() {
      return index;
    },
  };
}
