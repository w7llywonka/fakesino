// Catalogue entry, read by the server (game discovery) and the lobby (/api/config).
export const META = {
  slug: 'cascade',
  name: 'Cosmic Cascade',
  category: 'slots',
  order: 310,
  edge: 0.034,
  rtp: 96.6,
  desc: 'A 6×5 pay-anywhere slot: eight or more matching symbols anywhere on the grid pay, then tumble away so new ones fall in. Four stars award 10 free spins where multiplier orbs up to 100× boost every win. Max win 5,000×.',
  howTo: [
    'Set your bet and press Spin.',
    '8+ of the same symbol anywhere pay; winning symbols vanish and new ones tumble in until no wins are left.',
    '4+ stars award 10 free spins (3+ during free spins add 5 more). Orbs that land in a free spin add their multipliers together and multiply that spin’s win.',
  ],
  icon: '<circle cx="9" cy="9" r="4"/><path d="M3.5 11.5c2.5-1 8.5-4 11-6.5"/><path d="M16 14l1.2 2.6 2.8.4-2 2 .5 2.8-2.5-1.3-2.5 1.3.5-2.8-2-2 2.8-.4z"/>',
  thumb: {
    bg: ['#3b2a8c', '#0b7285'],
    glyph:
      '<g transform="translate(150 180)">' +
      '<circle r="44" fill="#ffa94d"/><ellipse rx="78" ry="18" fill="none" stroke="#ffe066" stroke-width="10" transform="rotate(-18)"/>' +
      '<path d="M-110 -70l8 18 20 3-14 14 3 20-17-9-17 9 3-20-14-14 20-3z" fill="#ffd43b"/>' +
      '<path d="M96 40l12 -8 -2 14 12 8 -14 2 -5 13 -6 -13 -14 -1 11 -9 -4 -14z" fill="#da77f2"/>' +
      '<circle cx="104" cy="-74" r="18" fill="#e64980"/><text x="104" y="-68" text-anchor="middle" font-size="16" font-weight="900" fill="#fff">25×</text>' +
      '</g>',
  },
};

export const RULES_VERSION = 1;
// RTP ≈ 96.6% (Monte Carlo, 13.5M spins, ±0.2%); free spins ≈ 1 in 315 spins,
// worth ≈ 68× on average; hit rate ≈ 27%.
export const COLS = 6;
export const ROWS = 5;
export const MIN_MATCH = 8;
export const FREE_SPINS = 10;
export const RETRIGGER = 5;
export const MAX_WIN = 5000;

export const SYMBOLS = ['ringed', 'comet', 'ufo', 'moon', 'ruby', 'sapphire', 'emerald', 'topaz', 'amethyst', 'star', 'orb'];
export const PAYING = SYMBOLS.slice(0, 9);
export const NAMES = { ringed: 'Ringed Planet', comet: 'Comet', ufo: 'Saucer', moon: 'Moon', ruby: 'Ruby', sapphire: 'Sapphire', emerald: 'Emerald', topaz: 'Topaz', amethyst: 'Amethyst', star: 'Star (scatter)', orb: 'Multiplier orb' };

// Pays in multiples of the total bet for 8–9, 10–11 and 12+ symbols.
export const PAYS = {
  ringed: [30.43, 81.15, 162.31],
  comet: [8.11, 30.43, 81.15],
  ufo: [6.6, 16.23, 50.72],
  moon: [5.07, 6.6, 40.58],
  ruby: [3.3, 5.07, 32.47],
  sapphire: [2.64, 4.06, 26.38],
  emerald: [1.62, 3.3, 16.23],
  topaz: [1.32, 3.04, 13.18],
  amethyst: [0.81, 2.53, 6.6],
};
// Stars pay once per spin, on the final grid: 4, 5, 6+ stars.
export const STAR_PAYS = { 4: 10, 5: 16.25, 6: 304 };

// Symbol weights: every cell (and every refill) is an independent draw.
const BASE_WEIGHTS = { ringed: 8, comet: 10, ufo: 12, moon: 14, ruby: 17, sapphire: 19, emerald: 21, topaz: 23, amethyst: 25, star: 2.8, orb: 0 };
const FREE_WEIGHTS = { ...BASE_WEIGHTS, star: 2.4, orb: 8 };
// Orb values and their weights.
export const ORBS = [
  [2, 300],
  [3, 200],
  [4, 140],
  [5, 110],
  [6, 80],
  [8, 60],
  [10, 45],
  [12, 25],
  [15, 18],
  [20, 12],
  [25, 7],
  [50, 3],
  [100, 1],
];

function table(weights) {
  const list = SYMBOLS.map((s) => [s, weights[s]]).filter(([, w]) => w > 0);
  const total = list.reduce((a, [, w]) => a + w, 0);
  let acc = 0;
  return list.map(([s, w]) => [s, (acc += w / total)]);
}
const BASE_TABLE = table(BASE_WEIGHTS);
const FREE_TABLE = table(FREE_WEIGHTS);
const ORB_TABLE = (() => {
  const total = ORBS.reduce((a, [, w]) => a + w, 0);
  let acc = 0;
  return ORBS.map(([v, w]) => [v, (acc += w / total)]);
})();
const pick = (tbl, f) => (tbl.find(([, c]) => f < c) || tbl[tbl.length - 1])[0];

function drawCell(rng, free) {
  const s = pick(free ? FREE_TABLE : BASE_TABLE, rng.next());
  return s === 'orb' ? { s, v: pick(ORB_TABLE, rng.next()) } : { s };
}

export const tierFor = (count) => (count >= 12 ? 2 : count >= 10 ? 1 : 0);

// One spin with all its tumbles. Grid: grid[c][r], r = 0 at the top.
function playSpin(rng, free) {
  const grid = Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => drawCell(rng, free)));
  const steps = [];
  let win = 0;
  for (;;) {
    const counts = {};
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) counts[grid[c][r].s] = (counts[grid[c][r].s] || 0) + 1;
    const wins = PAYING.filter((s) => (counts[s] || 0) >= MIN_MATCH).map((s) => ({ symbol: s, count: counts[s], pay: PAYS[s][tierFor(counts[s])] }));
    steps.push({ grid: grid.map((col) => col.map((x) => ({ ...x }))), wins });
    if (!wins.length) break;
    win += wins.reduce((a, w) => a + w.pay, 0);
    const gone = new Set(wins.map((w) => w.symbol));
    for (let c = 0; c < COLS; c++) {
      const kept = grid[c].filter((x) => !gone.has(x.s));
      const fresh = [];
      for (let k = kept.length; k < ROWS; k++) fresh.push(drawCell(rng, free));
      grid[c] = [...fresh, ...kept];
    }
  }
  const final = steps[steps.length - 1].grid;
  let stars = 0;
  let orbSum = 0;
  for (const col of final)
    for (const x of col) {
      if (x.s === 'star') stars++;
      if (x.s === 'orb') orbSum += x.v;
    }
  const starPay = STAR_PAYS[Math.min(6, stars)] || 0;
  const multiplied = free && win > 0 && orbSum > 0 ? win * orbSum : win;
  return { free, steps, tumbleWin: win, stars, starPay, orbSum: free ? orbSum : 0, win: multiplied + starPay };
}

export function normalize() {
  return {};
}

export function outcome(rng) {
  const spins = [];
  const base = playSpin(rng, false);
  spins.push(base);
  let total = base.win;
  let left = base.stars >= 4 ? FREE_SPINS : 0;
  let awarded = left;
  while (left > 0 && total < MAX_WIN) {
    left--;
    const s = playSpin(rng, true);
    if (s.stars >= 3) {
      s.retrigger = RETRIGGER;
      left += RETRIGGER;
      awarded += RETRIGGER;
    }
    total += s.win;
    spins.push(s);
  }
  const capped = Math.min(MAX_WIN, total);
  return { spins, freeSpins: awarded, maxWin: total >= MAX_WIN, multiplier: Math.floor(capped * 10000) / 10000 };
}

export const maxMultiplier = () => MAX_WIN;
