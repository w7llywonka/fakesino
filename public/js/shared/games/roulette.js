import { fail } from './util.js';

// Catalogue entry, read by the server (game discovery) and the lobby (/api/config).
export const META = {
  slug: 'roulette',
  name: 'Roulette',
  category: 'table',
  order: 210,
  edge: 0.027,
  rtp: 97.3,
  desc: 'European single-zero roulette with every inside and outside bet: straights, splits, streets, corners, lines, dozens, columns and even-money bets.',
  howTo: ['Pick a chip value.', 'Click the table to place chips — numbers, lines between numbers, or the outside bets.', 'Press Bet to spin the wheel.'],
};

export const RULES_VERSION = 1;

// European single-zero roulette. Every bet is a set of numbers that pays
// 36 / n times the stake (including the stake), so every bet has a 2.70% edge.

export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

export function colorOf(n) {
  if (n === 0) return 'green';
  return RED.has(n) ? 'red' : 'black';
}

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// Table grid: column c (1..3) holds numbers where n % 3 == c % 3; row r (1..12) = [3r-2, 3r-1, 3r].
function buildBets() {
  const bets = {};
  const add = (key, nums, label) => (bets[key] = { numbers: nums.sort((a, b) => a - b), label });
  for (let n = 0; n <= 36; n++) add(`straight:${n}`, [n], `${n}`);
  for (let n = 1; n <= 36; n++) {
    if (n % 3 !== 0) add(`split:${n}-${n + 1}`, [n, n + 1], `Split ${n}/${n + 1}`);
    if (n <= 33) add(`split:${n}-${n + 3}`, [n, n + 3], `Split ${n}/${n + 3}`);
    if (n % 3 !== 0 && n <= 32) add(`corner:${n}`, [n, n + 1, n + 3, n + 4], `Corner ${n}/${n + 1}/${n + 3}/${n + 4}`);
  }
  for (const n of [1, 2, 3]) add(`split:0-${n}`, [0, n], `Split 0/${n}`);
  add('trio:0-1-2', [0, 1, 2], 'Trio 0/1/2');
  add('trio:0-2-3', [0, 2, 3], 'Trio 0/2/3');
  add('basket', [0, 1, 2, 3], 'First four');
  for (let r = 1; r <= 12; r++) add(`street:${r}`, range(3 * r - 2, 3 * r), `Street ${3 * r - 2}-${3 * r}`);
  for (let r = 1; r <= 11; r++) add(`line:${r}`, range(3 * r - 2, 3 * r + 3), `Line ${3 * r - 2}-${3 * r + 3}`);
  for (const d of [1, 2, 3]) add(`dozen:${d}`, range(12 * d - 11, 12 * d), `${['1st', '2nd', '3rd'][d - 1]} 12`);
  for (const c of [1, 2, 3]) add(`column:${c}`, range(1, 36).filter((n) => n % 3 === c % 3), `Column ${c}`);
  add('low', range(1, 18), '1 to 18');
  add('high', range(19, 36), '19 to 36');
  add('even', range(1, 36).filter((n) => n % 2 === 0), 'Even');
  add('odd', range(1, 36).filter((n) => n % 2 === 1), 'Odd');
  add('red', range(1, 36).filter((n) => RED.has(n)), 'Red');
  add('black', range(1, 36).filter((n) => !RED.has(n)), 'Black');
  return bets;
}

export const BETS = buildBets();

export function payoutFor(key) {
  return 36 / BETS[key].numbers.length;
}

export const chipGame = true;

export function normalize(params = {}) {
  const chips = params.chips;
  if (!chips || typeof chips !== 'object' || Array.isArray(chips)) fail('Place a chip on the table');
  const out = {};
  for (const [key, value] of Object.entries(chips)) {
    if (!BETS[key]) fail(`Unknown bet: ${key}`);
    const v = Number(value);
    if (!Number.isFinite(v) || v < 0) fail('Invalid chip amount');
    if (v > 0) out[key] = v;
  }
  if (!Object.keys(out).length && !params.allowEmpty) fail('Place a chip on the table');
  if (Object.keys(out).length > 200) fail('Too many bets');
  return { chips: out };
}

export function chipTotal(params) {
  return Object.values(params.chips).reduce((a, b) => a + b, 0);
}

export function spin(rng) {
  return Math.floor(rng.next() * 37);
}

export function outcome(rng, params) {
  const number = spin(rng);
  let payout = 0;
  const winning = [];
  for (const [key, amount] of Object.entries(params.chips)) {
    if (BETS[key].numbers.includes(number)) {
      payout += amount * payoutFor(key);
      winning.push(key);
    }
  }
  return { number, color: colorOf(number), winning, payout };
}
