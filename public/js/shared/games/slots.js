// Catalogue entry, read by the server (game discovery) and the lobby (/api/config).
export const META = {
  slug: 'slots',
  name: 'Neon Fruits',
  category: 'slots',
  order: 300,
  edge: 0.037,
  rtp: 96.3,
  desc: 'A 5-reel, 20-line video slot with wilds, scatter pays and free spins where every win is tripled.',
  howTo: ['Set your total bet (split across 20 lines).', 'Press Spin.', '3+ scatters anywhere award 10 free spins with all wins ×3.'],
};

export const RULES_VERSION = 1;

// "Neon Fruits": 5 reels × 3 rows, 20 fixed paylines, wilds substitute for
// everything except scatters, 3+ scatters pay and award 10 free spins with all
// wins tripled (retriggerable up to 50 free spins). Theoretical RTP ≈ 96.3%,
// computed exactly from the strips below (see test/slots.test.js).

export const LINES = 20;
export const FREE_SPINS = 10;
export const FREE_SPIN_MULTIPLIER = 3;
export const MAX_FREE_SPINS = 50;

export const SYMBOLS = ['cherry', 'lemon', 'orange', 'plum', 'grape', 'bell', 'bar', 'seven', 'wild', 'scatter'];

// Pays in multiples of the line bet for 3, 4 and 5 of a kind.
export const PAYS = {
  cherry: [0, 0, 0, 5, 15, 50],
  lemon: [0, 0, 0, 5, 15, 50],
  orange: [0, 0, 0, 5, 20, 75],
  plum: [0, 0, 0, 10, 25, 100],
  grape: [0, 0, 0, 10, 30, 125],
  bell: [0, 0, 0, 15, 50, 200],
  bar: [0, 0, 0, 20, 75, 300],
  seven: [0, 0, 0, 30, 125, 750],
  wild: [0, 0, 0, 50, 250, 2000],
};
// Scatter pays in multiples of the total bet.
export const SCATTER_PAYS = [0, 0, 0, 2, 10, 50];

const A = ['seven', 'cherry', 'lemon', 'plum', 'orange', 'bell', 'cherry', 'grape', 'lemon', 'wild', 'orange', 'cherry', 'plum', 'bar', 'lemon', 'scatter', 'grape', 'cherry', 'orange', 'bell', 'lemon', 'plum', 'seven', 'cherry', 'grape', 'wild', 'lemon', 'orange', 'bell', 'plum', 'bar'];
const B = A.filter((_, i) => i !== 26);
const rotate = (arr, n) => arr.slice(n).concat(arr.slice(0, n));

export const REELS = [A, B, rotate(B, 15), rotate(A, 10), rotate(A, 20)];

export const PAYLINES = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  [1, 1, 0, 1, 1],
  [1, 1, 2, 1, 1],
  [0, 0, 2, 0, 0],
  [2, 2, 0, 2, 2],
  [0, 2, 2, 2, 0],
];

export function normalize() {
  return {};
}

// Evaluate one payline left-to-right. Returns { symbol, count, pay } or null.
export function evaluateLine(symbols) {
  let w = 0;
  while (w < 5 && symbols[w] === 'wild') w++;
  const wildPay = PAYS.wild[w] || 0;
  if (w === 5) return { symbol: 'wild', count: 5, pay: wildPay };
  const sym = symbols[w];
  let best = wildPay ? { symbol: 'wild', count: w, pay: wildPay } : null;
  if (sym !== 'scatter') {
    let n = w;
    while (n < 5 && (symbols[n] === sym || symbols[n] === 'wild')) n++;
    const pay = PAYS[sym][n] || 0;
    if (pay > (best?.pay || 0)) best = { symbol: sym, count: n, pay };
  }
  return best;
}

export function spinGrid(rng) {
  const stops = REELS.map((reel) => Math.floor(rng.next() * reel.length));
  // grid[reel][row]
  const grid = REELS.map((reel, i) => [0, 1, 2].map((r) => reel[(stops[i] + r) % reel.length]));
  return { stops, grid };
}

export function evaluateGrid(grid, multiplier = 1) {
  const lineWins = [];
  let units = 0;
  PAYLINES.forEach((rows, line) => {
    const win = evaluateLine(rows.map((r, reel) => grid[reel][r]));
    if (win) {
      const pay = win.pay * multiplier;
      lineWins.push({ line, symbol: win.symbol, count: win.count, pay });
      units += pay;
    }
  });
  const scatters = [];
  grid.forEach((col, reel) => col.forEach((s, row) => s === 'scatter' && scatters.push([reel, row])));
  const scatterWin = SCATTER_PAYS[Math.min(5, scatters.length)] * LINES * multiplier;
  units += scatterWin;
  return { lineWins, scatters, scatterWin, units };
}

export function outcome(rng) {
  const spins = [];
  const base = spinGrid(rng);
  const baseEval = evaluateGrid(base.grid);
  spins.push({ ...base, ...baseEval, free: false });
  let total = baseEval.units;
  let remaining = baseEval.scatters.length >= 3 ? FREE_SPINS : 0;
  let awarded = remaining;
  while (remaining > 0) {
    remaining--;
    const s = spinGrid(rng);
    const e = evaluateGrid(s.grid, FREE_SPIN_MULTIPLIER);
    total += e.units;
    let retrigger = 0;
    if (e.scatters.length >= 3 && awarded < MAX_FREE_SPINS) {
      retrigger = Math.min(FREE_SPINS, MAX_FREE_SPINS - awarded);
      awarded += retrigger;
      remaining += retrigger;
    }
    spins.push({ ...s, ...e, free: true, retrigger });
  }
  const multiplier = Math.floor((total / LINES) * 10000) / 10000;
  return { spins, freeSpins: awarded, units: total, multiplier };
}
