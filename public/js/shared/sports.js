// Play-money sportsbook model, shared by the server and the browser.
//
// Leagues and teams are fictional and matches are simulated: every match has
// a secret seed whose SHA-256 is published before kick-off. The seed turns
// into floats (HMAC_SHA256(seed, `sports:${round}`), 8 floats per round, as
// in shared/fair.js) and `simulate()` turns those floats into the full match.
// The seed is revealed at full time so anyone can recompute the result.
// Odds come from the same model as the simulation, plus a 5% margin.

export const MARGIN = 0.05;
export const FLOAT_COUNT = 32;
const MAX_ODDS = 50;

export const SPORTS = {
  soccer: { name: 'Soccer', model: 'goals', durationMs: 10 * 60000, minutes: 90, periods: ['1st half', '2nd half'], base: 1.35, k: 1.3, homeAdv: 0.12, totalLine: 2.5, resultName: 'Match Result' },
  basketball: { name: 'Basketball', model: 'points', durationMs: 10 * 60000, minutes: 48, base: 110, sd: 11, k: 16, homeAdv: 2.5 },
  tennis: { name: 'Tennis', model: 'sets', durationMs: 9 * 60000, k: 1.1, unit: 'Sets' },
  icehockey: { name: 'Ice Hockey', model: 'goals', durationMs: 9 * 60000, minutes: 60, periods: ['1st period', '2nd period', '3rd period'], base: 2.9, k: 0.9, homeAdv: 0.06, totalLine: 5.5, resultName: 'Regulation Time Result' },
  esports: { name: 'Esports', model: 'maps', durationMs: 9 * 60000, k: 1.1, unit: 'Maps' },
};

// Fictional leagues. `slotMs` is the gap between kick-off slots and `perSlot`
// the matches that start together.
export const LEAGUES = [
  { id: 'pdl', sport: 'soccer', name: 'Premier Demo League', region: 'Northland', slotMs: 5 * 60000, perSlot: 2, offsetMs: 0,
    teams: ['Northport Rovers', 'Eastbridge United', 'Kingsmere City', 'Ashford Athletic', 'Redcliff Town', 'Westvale Wanderers', 'Harrowgate FC', 'Marlow Rangers', 'Stonebury Albion', 'Lynmouth Harriers'] },
  { id: 'lfi', sport: 'soccer', name: 'Liga Ficticia', region: 'Solaria', slotMs: 6 * 60000, perSlot: 2, offsetMs: 2 * 60000,
    teams: ['Real Costaluz', 'Atlético Marvista', 'Deportivo Arenal', 'CF Montealto', 'Unión Pradera', 'Sporting Bahía', 'Racing Valleoro', 'CD Puertosol'] },
  { id: 'cup', sport: 'soccer', name: 'Continental Demo Cup', region: 'International', slotMs: 8 * 60000, perSlot: 1, offsetMs: 4 * 60000,
    teams: ['FC Nordhavn', 'Sparta Velmar', 'Olympia Kastria', 'Dynamo Brevik', 'Inter Calvera', 'AS Monrose', 'Benfique Lusa', 'Ajaxon Delft'] },
  { id: 'phl', sport: 'basketball', name: 'Pro Hoops League', region: 'Northland', slotMs: 5 * 60000, perSlot: 2, offsetMs: 60000,
    teams: ['Bayport Breakers', 'Summit City Peaks', 'Ironwood Lumberjacks', 'Coral Coast Rays', 'Granite Falls Giants', 'Riverton Rapids', 'Desert Springs Suns', 'Lakeshore Loons'] },
  { id: 'eba', sport: 'basketball', name: 'EuroDemo Basket', region: 'Europa', slotMs: 7 * 60000, perSlot: 1, offsetMs: 3 * 60000,
    teams: ['Valdora Basket', 'Partizan Kroven', 'Olimpia Serena', 'Maccabi Tarsa', 'Zalgiris Vila', 'Panathen Delos'] },
  { id: 'dom', sport: 'tennis', name: 'Demo Open — Men', region: 'Hard court', slotMs: 4 * 60000, perSlot: 2, offsetMs: 30000,
    teams: ['A. Varga', 'L. Moreau', 'K. Tanaka', 'D. Petrov', 'M. Okafor', 'J. Lindqvist', 'R. Alvarez', 'T. Novak', 'S. Haddad', 'E. Costa'] },
  { id: 'dow', sport: 'tennis', name: 'Demo Open — Women', region: 'Hard court', slotMs: 4 * 60000, perSlot: 2, offsetMs: 150000,
    teams: ['N. Ivanova', 'C. Dubois', 'Y. Sato', 'M. Kowalska', 'A. Mensah', 'S. Berg', 'L. Rossi', 'I. Herrera', 'P. Novotna', 'H. Kim'] },
  { id: 'nil', sport: 'icehockey', name: 'North Ice League', region: 'Northland', slotMs: 6 * 60000, perSlot: 2, offsetMs: 90000,
    teams: ['Frostburg Wolves', 'Pine Hollow Bears', 'Glacier Bay Orcas', 'Ridgefield Rams', 'Cold Lake Comets', 'Timber Bay Moose'] },
  { id: 'fkm', sport: 'esports', name: 'Fakesino Masters', region: 'Online', slotMs: 5 * 60000, perSlot: 2, offsetMs: 150000,
    teams: ['Team Nebula', 'Crimson Owls', 'Vortex Gaming', 'Blue Lantern', 'Iron Pixels', 'Night Falcons', 'Apex Unity', 'Static Shock'] },
];
export const leagueById = Object.fromEntries(LEAGUES.map((l) => [l.id, l]));

// FNV-1a: stable, non-secret hashing for ratings and fixtures.
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
export const ratingFor = (team) => 1450 + (hash32(`rating:${team}`) % 400);

// ---- fixtures ----------------------------------------------------------------
// Slot `n` of a league kicks off at n × slotMs + offsetMs (ms since epoch).
export function fixturesForSlot(league, n) {
  const order = league.teams.map((t, i) => [hash32(`${league.id}:${n}:${i}`), t]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const out = [];
  for (let j = 0; j < league.perSlot && 2 * j + 1 < order.length; j++) {
    const [home, away] = [order[2 * j], order[2 * j + 1]];
    out.push({ id: `${league.id}.${n}.${j}`, sport: league.sport, league: league.id, leagueName: league.name, region: league.region, home, away, homeRating: ratingFor(home), awayRating: ratingFor(away), kickoff: n * league.slotMs + league.offsetMs });
  }
  return out;
}

export function parseMatchId(id) {
  const m = /^([a-z]+)\.(\d+)\.(\d+)$/.exec(String(id));
  if (!m || !leagueById[m[1]]) return null;
  const f = fixturesForSlot(leagueById[m[1]], Number(m[2]))[Number(m[3])];
  return f || null;
}

// ---- maths --------------------------------------------------------------------
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
function poissonPmf(lambda, max) {
  const out = [Math.exp(-lambda)];
  for (let k = 1; k <= max; k++) out.push((out[k - 1] * lambda) / k);
  return out;
}
function poissonInv(f, lambda, max = 12) {
  let k = 0;
  let p = Math.exp(-lambda);
  let cdf = p;
  while (f > cdf && k < max) {
    k++;
    p = (p * lambda) / k;
    cdf += p;
  }
  return k;
}
// Abramowitz–Stegun erf (|error| < 1.5e-7).
function erf(x) {
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
export const normCdf = (x, mu = 0, sd = 1) => (sd <= 0 ? (x >= mu ? 1 : 0) : 0.5 * (1 + erf((x - mu) / (sd * Math.SQRT2))));
function gauss(f1, f2) {
  return Math.sqrt(-2 * Math.log(Math.max(f1, 1e-12))) * Math.cos(2 * Math.PI * f2);
}

export function params(match) {
  const s = SPORTS[match.sport];
  const d = (match.homeRating - match.awayRating) / 400;
  if (s.model === 'goals') return { lh: s.base * Math.exp(s.k * d * 0.5 + s.homeAdv), la: s.base * Math.exp(-s.k * d * 0.5) };
  if (s.model === 'points') return { mh: s.base + (s.k * d) / 2 + s.homeAdv / 2, ma: s.base - (s.k * d) / 2 - s.homeAdv / 2, sd: s.sd };
  return { p: 1 / (1 + 10 ** (-d * s.k)) }; // sets / maps
}

// ---- simulation ---------------------------------------------------------------
// Returns { final: {home, away}, events, segments, durationMs } where event
// and segment times are fractions of `durationMs` from kick-off.
export function simulate(match, floats) {
  const s = SPORTS[match.sport];
  const p = params(match);
  if (s.model === 'goals') {
    const nh = poissonInv(floats[0], p.lh);
    const na = poissonInv(floats[1], p.la);
    const events = [];
    for (let i = 0; i < nh; i++) events.push({ t: floats[2 + i], team: 'home' });
    for (let i = 0; i < na; i++) events.push({ t: floats[14 + i], team: 'away' });
    events.sort((a, b) => a.t - b.t);
    return { final: { home: nh, away: na }, events, durationMs: s.durationMs };
  }
  if (s.model === 'points') {
    const quarters = [];
    let f = 0;
    for (let q = 0; q < 4; q++) {
      const h = Math.max(4, Math.round(p.mh / 4 + (p.sd / 2) * gauss(floats[f], floats[f + 1])));
      const a = Math.max(4, Math.round(p.ma / 4 + (p.sd / 2) * gauss(floats[f + 2], floats[f + 3])));
      quarters.push({ home: h, away: a, minutes: 12 });
      f += 4;
    }
    const tot = () => quarters.reduce((acc, q) => ({ home: acc.home + q.home, away: acc.away + q.away }), { home: 0, away: 0 });
    let ot = 0;
    while (tot().home === tot().away && ot < 3) {
      const sdOt = p.sd * Math.sqrt(5 / 48);
      const h = Math.max(0, Math.round((p.mh * 5) / 48 + sdOt * gauss(floats[16 + ot * 4], floats[17 + ot * 4])));
      const a = Math.max(0, Math.round((p.ma * 5) / 48 + sdOt * gauss(floats[18 + ot * 4], floats[19 + ot * 4])));
      quarters.push({ home: h, away: a, minutes: 5 });
      ot++;
    }
    if (tot().home === tot().away) quarters[quarters.length - 1][floats[28] < 0.5 ? 'home' : 'away'] += 1;
    const minutes = quarters.reduce((a, q) => a + q.minutes, 0);
    let start = 0;
    const segments = quarters.map((q) => {
      const seg = { ...q, start: start / 48, end: (start + q.minutes) / 48 };
      start += q.minutes;
      return seg;
    });
    return { final: tot(), segments, durationMs: (s.durationMs * minutes) / 48 };
  }
  // sets (tennis, best of 3) / maps (esports, best of 3 to 13 rounds)
  const segments = [];
  let sh = 0;
  let sa = 0;
  for (let i = 0; sh < 2 && sa < 2; i++) {
    const homeWins = floats[i * 2] < p.p;
    let w;
    let l;
    if (s.model === 'sets') {
      const r = floats[i * 2 + 1];
      // Loser's games: 0–4 (6–x), 5 (7–5) or 6 (7–6).
      const table = [0.04, 0.1, 0.18, 0.22, 0.2, 0.12, 0.14];
      let acc = 0;
      l = table.findIndex((x) => (acc += x) > r);
      if (l < 0) l = 6;
      w = l <= 4 ? 6 : 7;
    } else {
      l = Math.floor(floats[i * 2 + 1] * 12);
      w = 13;
    }
    segments.push({ home: homeWins ? w : l, away: homeWins ? l : w, winner: homeWins ? 'home' : 'away', start: i / 3, end: (i + 1) / 3 });
    if (homeWins) sh++;
    else sa++;
  }
  return { final: { home: sh, away: sa }, segments, durationMs: (s.durationMs * segments.length) / 3 };
}

// ---- public state at a moment -------------------------------------------------
// What a viewer may know `elapsedMs` after kick-off (never future events).
export function stateAt(match, sim, elapsedMs) {
  const s = SPORTS[match.sport];
  if (elapsedMs < 0) return { status: 'upcoming', score: null };
  if (elapsedMs >= sim.durationMs) return { status: 'ended', score: { ...sim.final }, ...finalDetail(match, sim) };
  const x = elapsedMs / s.durationMs; // fraction of regulation-length time
  if (s.model === 'goals') {
    const events = sim.events.filter((e) => e.t <= x).map((e) => ({ ...e, minute: Math.min(s.minutes, Math.floor(e.t * s.minutes) + 1) }));
    const minute = Math.min(s.minutes, Math.floor(x * s.minutes) + 1);
    const per = Math.min(s.periods.length - 1, Math.floor(x * s.periods.length));
    return { status: 'live', progress: x, clock: `${minute}'`, period: s.periods[per], score: { home: events.filter((e) => e.team === 'home').length, away: events.filter((e) => e.team === 'away').length }, events };
  }
  if (s.model === 'points') {
    const gameMin = x * 48;
    const score = { home: 0, away: 0 };
    const periods = [];
    let current = null;
    for (const [i, seg] of sim.segments.entries()) {
      const a = seg.start * 48;
      const b = seg.end * 48;
      if (gameMin >= b) {
        score.home += seg.home;
        score.away += seg.away;
        periods.push({ home: seg.home, away: seg.away });
      } else if (gameMin >= a) {
        const frac = (gameMin - a) / (b - a);
        const ph = Math.floor(seg.home * frac);
        const pa = Math.floor(seg.away * frac);
        score.home += ph;
        score.away += pa;
        periods.push({ home: ph, away: pa });
        const left = b - gameMin;
        current = { label: i < 4 ? `Q${i + 1}` : `OT${i > 4 ? i - 3 : ''}`, clock: `${String(Math.floor(left)).padStart(2, '0')}:${String(Math.floor((left % 1) * 60)).padStart(2, '0')}`, regulationLeft: Math.max(0, 48 - gameMin) / 48 };
      }
    }
    return { status: 'live', progress: Math.min(1, x), clock: current ? `${current.label} ${current.clock}` : '', period: current?.label, regulationLeft: current?.regulationLeft ?? 0, score, periods };
  }
  const setLen = 1 / 3;
  const won = { home: 0, away: 0 };
  const periods = [];
  let current = null;
  for (const [i, seg] of sim.segments.entries()) {
    if (x >= seg.end) {
      won[seg.winner]++;
      periods.push({ home: seg.home, away: seg.away });
    } else if (x >= seg.start) {
      const frac = (x - seg.start) / setLen;
      const total = seg.home + seg.away;
      const played = Math.min(total - 1, Math.floor(frac * total));
      const seq = segmentSequence(seg);
      const cur = { home: 0, away: 0 };
      for (let k = 0; k < played; k++) cur[seq[k]]++;
      periods.push(cur);
      current = { index: i, games: cur };
    }
  }
  const unit = s.model === 'sets' ? 'Set' : 'Map';
  return { status: 'live', progress: x, clock: current ? `${unit} ${current.index + 1}` : '', period: current ? `${unit} ${current.index + 1}` : '', score: won, periods, current };
}

function finalDetail(match, sim) {
  const s = SPORTS[match.sport];
  if (s.model === 'goals') return { events: sim.events.map((e) => ({ ...e, minute: Math.min(s.minutes, Math.floor(e.t * s.minutes) + 1) })), clock: 'FT' };
  return { periods: sim.segments.map((g) => ({ home: g.home, away: g.away })), clock: 'Final' };
}

// Order of games/rounds inside a set or map: the loser's wins are spread out
// and the winner takes the last one.
function segmentSequence(seg) {
  const total = seg.home + seg.away;
  const loser = seg.winner === 'home' ? 'away' : 'home';
  const L = seg[loser];
  const seq = new Array(total).fill(seg.winner);
  for (let j = 0; j < L; j++) seq[Math.min(total - 2, Math.floor(((j + 0.5) * (total - 1)) / L))] = loser;
  // Collisions can drop a loser game; top up from the front.
  let have = seq.filter((x) => x === loser).length;
  for (let k = 0; have < L && k < total - 1; k++) if (seq[k] !== loser) {
    seq[k] = loser;
    have++;
  }
  return seq;
}

// ---- prices -------------------------------------------------------------------
export function oddsFor(p) {
  if (!(p > 0.01 && p < 0.985)) return null; // suspended
  return Math.min(MAX_ODDS, Math.max(1.01, Math.floor(100 / (p * (1 + MARGIN))) / 100));
}

const half = (x) => Math.floor(x) + 0.5;
export function lines(match) {
  const s = SPORTS[match.sport];
  const p = params(match);
  if (s.model === 'points') return { spread: half(Math.abs(p.mh - p.ma)) * Math.sign(p.mh - p.ma || 1), total: half(p.mh + p.ma) };
  if (s.model === 'goals') return { total: s.totalLine };
  return { total: 2.5, handicap: 1.5 };
}

// Markets with probabilities and odds for the given public state.
export function markets(match, state = { status: 'upcoming' }) {
  if (state.status === 'ended') return [];
  const s = SPORTS[match.sport];
  const p = params(match);
  const L = lines(match);
  const live = state.status === 'live';
  const H = match.home;
  const A = match.away;
  const mk = (key, name, outcomes, extra = {}) => ({ key, name, ...extra, outcomes: outcomes.map(([k, label, prob]) => ({ key: k, name: label, p: prob, odds: oddsFor(prob) })) });

  if (s.model === 'goals') {
    const r = live ? Math.max(0, 1 - state.progress) : 1;
    const cur = live ? state.score : { home: 0, away: 0 };
    if (live && r < 0.015) return []; // closing seconds
    const ph = poissonPmf(p.lh * r, 14);
    const pa = poissonPmf(p.la * r, 14);
    let home = 0;
    let draw = 0;
    let away = 0;
    let over = 0;
    let btts = 0;
    for (let i = 0; i < ph.length; i++)
      for (let j = 0; j < pa.length; j++) {
        const q = ph[i] * pa[j];
        const fh = cur.home + i;
        const fa = cur.away + j;
        if (fh > fa) home += q;
        else if (fh === fa) draw += q;
        else away += q;
        if (fh + fa > L.total) over += q;
        if (fh > 0 && fa > 0) btts += q;
      }
    const n = home + draw + away;
    [home, draw, away, over, btts] = [home / n, draw / n, away / n, over / n, btts / n];
    const out = [mk('1x2', s.resultName, [['home', H, home], ['draw', 'Draw', draw], ['away', A, away]])];
    if (match.sport === 'soccer') out.push(mk('dc', 'Double Chance', [['1x', `${H} or Draw`, home + draw], ['12', `${H} or ${A}`, home + away], ['x2', `Draw or ${A}`, draw + away]]));
    out.push(mk('total', `Total ${match.sport === 'soccer' ? 'Goals' : 'Goals (Regulation)'}`, [['over', `Over ${L.total}`, over], ['under', `Under ${L.total}`, 1 - over]], { line: L.total }));
    if (match.sport === 'soccer') out.push(mk('btts', 'Both Teams to Score', [['yes', 'Yes', btts], ['no', 'No', 1 - btts]]));
    return out;
  }
  if (s.model === 'points') {
    const r = live ? state.regulationLeft ?? Math.max(0, 1 - state.progress) : 1;
    if (live && r < 0.01) return [];
    const cur = live ? state.score : { home: 0, away: 0 };
    const sdD = p.sd * Math.sqrt(2 * r);
    const muD = cur.home - cur.away + (p.mh - p.ma) * r;
    const muT = cur.home + cur.away + (p.mh + p.ma) * r;
    const tie = normCdf(0.5, muD, sdD) - normCdf(-0.5, muD, sdD);
    const home = 1 - normCdf(0.5, muD, sdD) + tie / 2;
    const cover = 1 - normCdf(L.spread, muD, sdD); // home wins by more than the spread
    const over = 1 - normCdf(L.total, muT, sdD);
    const fmt = (x) => (x > 0 ? `-${x}` : `+${-x}`);
    return [
      mk('ml', 'Winner (incl. overtime)', [['home', H, home], ['away', A, 1 - home]]),
      mk('spread', 'Handicap (incl. overtime)', [['home', `${H} ${fmt(L.spread)}`, cover], ['away', `${A} ${fmt(-L.spread)}`, 1 - cover]], { line: L.spread }),
      mk('total', 'Total Points (incl. overtime)', [['over', `Over ${L.total}`, over], ['under', `Under ${L.total}`, 1 - over]], { line: L.total }),
    ];
  }
  // best of 3
  const sw = live ? state.score : { home: 0, away: 0 };
  let pCur = p.p;
  if (live && state.current) {
    const g = state.current.games;
    const step = s.model === 'sets' ? 0.09 : 0.05;
    pCur = clamp(p.p + step * (g.home - g.away), 0.03, 0.97);
  }
  // P(home wins the match | sets won so far), first set uses pCur.
  const win = (h, a, first) => {
    if (h === 2) return 1;
    if (a === 2) return 0;
    const q = first ? pCur : p.p;
    return q * win(h + 1, a, false) + (1 - q) * win(h, a + 1, false);
  };
  const three = (h, a, first) => {
    if (h === 2 || a === 2) return h + a === 3 ? 1 : 0;
    const q = first ? pCur : p.p;
    return q * three(h + 1, a, false) + (1 - q) * three(h, a + 1, false);
  };
  const twoNil = (h, a, first) => {
    if (h === 2 || a === 2) return h === 2 && a === 0 ? 1 : 0;
    const q = first ? pCur : p.p;
    return q * twoNil(h + 1, a, false) + (1 - q) * twoNil(h, a + 1, false);
  };
  const home = win(sw.home, sw.away, true);
  const over = three(sw.home, sw.away, true);
  const homeMinus = twoNil(sw.home, sw.away, true);
  const nilTwo = (() => {
    const flip = (h, a, first) => {
      if (h === 2 || a === 2) return a === 2 && h === 0 ? 1 : 0;
      const q = first ? pCur : p.p;
      return q * flip(h + 1, a, false) + (1 - q) * flip(h, a + 1, false);
    };
    return flip(sw.home, sw.away, true);
  })();
  return [
    mk('ml', 'Match Winner', [['home', H, home], ['away', A, 1 - home]]),
    mk('total', `Total ${s.unit}`, [['over', 'Over 2.5', over], ['under', 'Under 2.5', 1 - over]], { line: 2.5 }),
    mk('handicap', `${s.unit} Handicap`, [['home', `${H} -1.5`, homeMinus], ['away', `${A} +1.5`, 1 - homeMinus], ['home_plus', `${H} +1.5`, 1 - nilTwo], ['away_minus', `${A} -1.5`, nilTwo]], { line: 1.5 }),
  ];
}

// ---- settlement ---------------------------------------------------------------
export function settleLeg(match, final, market, outcome) {
  const s = SPORTS[match.sport];
  const L = lines(match);
  const { home, away } = final;
  const res = (b) => (b ? 'won' : 'lost');
  switch (market) {
    case '1x2':
      return res({ home: home > away, draw: home === away, away: away > home }[outcome]);
    case 'dc':
      return res({ '1x': home >= away, 12: home !== away, x2: away >= home }[outcome]);
    case 'ml':
      return res(outcome === 'home' ? home > away : away > home);
    case 'total': {
      const t = home + away;
      return res(outcome === 'over' ? t > L.total : t < L.total);
    }
    case 'btts':
      return res(outcome === 'yes' ? home > 0 && away > 0 : !(home > 0 && away > 0));
    case 'spread':
      return res(outcome === 'home' ? home - away > L.spread : home - away < L.spread);
    case 'handicap':
      return res({ home: home === 2 && away === 0, away: away >= 1, home_plus: home >= 1, away_minus: away === 2 && home === 0 }[outcome]);
    default:
      throw new Error(`Unknown market ${market} for ${s.name}`);
  }
}

// Odds as decimal, fractional or American.
export function formatOdds(odds, format = 'decimal') {
  if (odds == null) return '—';
  if (format === 'american') return odds >= 2 ? `+${Math.round((odds - 1) * 100)}` : `-${Math.round(100 / (odds - 1))}`;
  if (format === 'fractional') {
    const x = odds - 1;
    let best = [Math.round(x), 1];
    for (let d = 1; d <= 20; d++) {
      const n = Math.round(x * d);
      if (Math.abs(n / d - x) < Math.abs(best[0] / best[1] - x) - 1e-9) best = [n, d];
    }
    return `${best[0]}/${best[1]}`;
  }
  return odds.toFixed(2);
}
