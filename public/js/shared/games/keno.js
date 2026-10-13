import { fail, int, oneOf } from './util.js';
import { shuffleSelect } from '../fair.js';

export const NUMBERS = 40; // tiles 1..40
export const DRAWN = 10;
export const RISKS = ['classic', 'low', 'medium', 'high'];

// TABLES[risk][picks][hits] = multiplier
export const TABLES = {
  classic: {
    1: [0, 3.96],
    2: [0, 1.9, 4.5],
    3: [0, 1, 3.1, 10.4],
    4: [0, 0.8, 1.8, 5, 22.5],
    5: [0, 0.25, 1.4, 4.1, 16.5, 36],
    6: [0, 0, 1, 3.68, 7, 16.5, 40],
    7: [0, 0, 0.47, 3, 4.5, 14, 31, 60],
    8: [0, 0, 0, 2.2, 4, 13, 22, 55, 70],
    9: [0, 0, 0, 1.55, 3, 8, 15, 44, 60, 85],
    10: [0, 0, 0, 1.4, 2.25, 4.5, 8, 17, 50, 80, 100],
  },
  low: {
    1: [0.7, 1.85],
    2: [0, 2, 3.8],
    3: [0, 1.1, 1.38, 26],
    4: [0, 0, 2.2, 7.9, 90],
    5: [0, 0, 1.5, 4.2, 13, 300],
    6: [0, 0, 1.1, 2, 6.2, 100, 700],
    7: [0, 0, 1.1, 1.6, 3.5, 15, 225, 700],
    8: [0, 0, 1.1, 1.5, 2, 5.5, 39, 100, 800],
    9: [0, 0, 1.1, 1.3, 1.7, 2.5, 7.5, 50, 250, 1000],
    10: [0, 0, 1.1, 1.2, 1.3, 1.8, 3.5, 13, 50, 250, 1000],
  },
  medium: {
    1: [0.4, 2.75],
    2: [0, 1.8, 5.1],
    3: [0, 0, 2.8, 50],
    4: [0, 0, 1.7, 10, 100],
    5: [0, 0, 1.4, 4, 14, 390],
    6: [0, 0, 0, 3, 9, 180, 710],
    7: [0, 0, 0, 2, 7, 30, 400, 800],
    8: [0, 0, 0, 2, 4, 11, 67, 400, 900],
    9: [0, 0, 0, 2, 2.5, 5, 15, 100, 500, 1000],
    10: [0, 0, 0, 1.6, 2, 4, 7, 26, 100, 500, 1000],
  },
  high: {
    1: [0, 3.96],
    2: [0, 0, 17.1],
    3: [0, 0, 0, 81.5],
    4: [0, 0, 0, 10, 259],
    5: [0, 0, 0, 4.5, 48, 450],
    6: [0, 0, 0, 0, 11, 350, 710],
    7: [0, 0, 0, 0, 7, 90, 400, 800],
    8: [0, 0, 0, 0, 5, 20, 270, 600, 900],
    9: [0, 0, 0, 0, 4, 11, 56, 500, 800, 1000],
    10: [0, 0, 0, 0, 3.5, 8, 13, 63, 500, 800, 1000],
  },
};

export function normalize(params = {}) {
  const risk = oneOf(params.risk ?? 'classic', 'risk', RISKS);
  if (!Array.isArray(params.picks)) fail('Pick between 1 and 10 numbers');
  const picks = [...new Set(params.picks.map((p) => int(Number(p), 'number', 1, NUMBERS)))].sort((a, b) => a - b);
  if (picks.length < 1 || picks.length > 10) fail('Pick between 1 and 10 numbers');
  return { risk, picks };
}

export function draw(rng) {
  return shuffleSelect(rng.take(DRAWN), Array.from({ length: NUMBERS }, (_, i) => i + 1));
}

export function outcome(rng, params) {
  const drawn = draw(rng);
  const set = new Set(drawn);
  const hits = params.picks.filter((p) => set.has(p));
  const multiplier = TABLES[params.risk][params.picks.length][hits.length];
  return { drawn, hits, multiplier };
}
