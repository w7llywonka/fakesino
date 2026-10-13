import { fail, int, oneOf } from './util.js';

// Catalogue entry, read by the server (game discovery) and the lobby (/api/config).
export const META = {
  slug: 'wheel',
  name: 'Wheel',
  category: 'originals',
  order: 70,
  edge: 0.01,
  rtp: 99,
  desc: 'Spin a wheel of 10 to 50 segments. Choose the risk and watch where the pointer lands.',
  howTo: ['Choose the risk and number of segments.', 'Press Bet to spin.', 'The segment under the pointer pays its multiplier.'],
  verifyFields: [['segments', 'Segments', [10, 20, 30, 40, 50]], ['risk', 'Risk', ['low', 'medium', 'high']]],
};

export const RULES_VERSION = 1;

export const SEGMENTS = [10, 20, 30, 40, 50];
export const RISKS = ['low', 'medium', 'high'];

const LOW10 = [1.5, 1.2, 1.2, 1.2, 0, 1.2, 1.2, 1.2, 1.2, 0];
const MEDIUM = {
  10: [0, 1.9, 0, 1.5, 0, 2, 0, 1.5, 0, 3],
  20: [1.5, 0, 2, 0, 2, 0, 2, 0, 1.5, 0, 3, 0, 1.8, 0, 2, 0, 2, 0, 2, 0],
  30: [1.5, 0, 1.5, 0, 2, 0, 1.5, 0, 2, 0, 2, 0, 1.5, 0, 3, 0, 1.5, 0, 2, 0, 2, 0, 1.7, 0, 4, 0, 1.5, 0, 2, 0],
  40: [2, 0, 3, 0, 2, 0, 1.5, 0, 3, 0, 1.5, 0, 1.5, 0, 2, 0, 1.5, 0, 3, 0, 1.5, 0, 2, 0, 2, 0, 1.6, 0, 2, 0, 1.5, 0, 3, 0, 1.5, 0, 2, 0, 1.5, 0],
  50: [2, 0, 1.5, 0, 2, 0, 1.5, 0, 3, 0, 1.5, 0, 1.5, 0, 2, 0, 1.5, 0, 3, 0, 1.5, 0, 2, 0, 1.5, 0, 2, 0, 2, 0, 1.5, 0, 3, 0, 1.5, 0, 2, 0, 1.5, 0, 1.5, 0, 5, 0, 1.5, 0, 2, 0, 1.5, 0],
};

export function table(risk, segments) {
  if (risk === 'low') return Array.from({ length: segments }, (_, i) => LOW10[i % 10]);
  if (risk === 'medium') return MEDIUM[segments].slice();
  const t = new Array(segments).fill(0);
  t[segments - 1] = Math.round(segments * 0.99 * 100) / 100;
  return t;
}

export function normalize(params = {}) {
  const segments = int(Number(params.segments ?? 10), 'segments', 10, 50);
  if (!SEGMENTS.includes(segments)) fail('Segments must be 10, 20, 30, 40 or 50');
  const risk = oneOf(params.risk ?? 'low', 'risk', RISKS);
  return { segments, risk };
}

export function outcome(rng, params) {
  const segment = Math.floor(rng.next() * params.segments);
  const multiplier = table(params.risk, params.segments)[segment];
  return { segment, multiplier };
}
