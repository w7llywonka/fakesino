import { el, esc, sleep } from '../dom.js';
import { amountField } from '../ui/controls.js';
import { TABLES, ROWS } from '../shared/games/plinko.js';

// Board geometry. x is in units of the horizontal peg spacing `g`, y in rows
// (one row = VR * g px). Peg (row i, index j) sits at x = j - (i + 2) / 2, y = i.
// Row 0 has 3 pegs. Sizes below are in units of g.
const VR = 0.88;
const PEG_R = 0.1;
const BALL_R = 0.24;
const CONTACT = PEG_R + BALL_R; // ball centre distance when touching a peg
const SPAWN_Y = -1.15;
const BUCKET_GAP = 0.62; // from the last peg row to the bucket tops
const BUCKET_H = 0.78;
const BUCKET_W = 0.9;
const FLASH_MS = 280;
const PULSE_MS = 380;
const MAX_IN_FLIGHT = 30;
const LAST_MAX = 6;

const RISK_OPTIONS = [
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
];

// Bucket colours: yellow in the centre, through orange, to red at the edges.
const STOPS = [
  [255, 196, 0],
  [255, 122, 8],
  [255, 32, 72],
];

function bucketRgb(k, rows) {
  const half = rows / 2;
  const t = Math.min(1, Math.abs(k - half) / half);
  const [a, b, u] = t < 0.5 ? [STOPS[0], STOPS[1], t * 2] : [STOPS[1], STOPS[2], (t - 0.5) * 2];
  return a.map((v, i) => v + (b[i] - v) * u);
}

const css = (c, f = 1) => `rgb(${c.map((v) => Math.round(v * f)).join(',')})`;
const rand = (a, b) => a + Math.random() * (b - a);
export const multLabel = (m) => `${Number(m)}×`;

function roundRect(g2d, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g2d.beginPath();
  g2d.moveTo(x + r, y);
  g2d.arcTo(x + w, y, x + w, y + h, r);
  g2d.arcTo(x + w, y + h, x, y + h, r);
  g2d.arcTo(x, y + h, x, y, r);
  g2d.arcTo(x, y, x + w, y, r);
  g2d.closePath();
}

export default function mountPlinko(ctx) {
  const { api, sound } = ctx;
  let risk = 'medium';
  let rows = 16;
  let requesting = false;
  let alive = true;

  const panel = ctx.createBetPanel({
    fields: [
      amountField(),
      { key: 'risk', type: 'select', label: 'Risk', options: RISK_OPTIONS, value: risk },
      { key: 'rows', type: 'select', label: 'Rows', options: ROWS.map((r) => [r, String(r)]), value: rows },
    ],
    onBet: () => play(false),
    auto: { run: () => play(true) },
  });

  const stage = el(`<div class="plinko-stage">
    <div class="plinko-board">
      <canvas class="plinko-canvas" aria-label="Plinko board"></canvas>
      <div class="plinko-last" aria-label="Last results"></div>
    </div>
  </div>`);
  ctx.stage.appendChild(stage);
  const board = stage.querySelector('.plinko-board');
  const canvas = board.querySelector('canvas');
  const g2d = canvas.getContext('2d');
  const lastEl = board.querySelector('.plinko-last');

  let L = null; // current layout
  const pegFlash = new Map(); // row * 64 + index → hit time
  const bucketPulse = new Map(); // bucket → land time
  const balls = [];
  let raf = 0;
  let lastPegSound = 0;

  // ---- layout ----
  function layout() {
    const w = board.clientWidth;
    const h = board.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const narrow = w < 640;
    const side = narrow ? 6 : 92; // keep the results column clear on wide boards
    const padY = narrow ? 8 : 18;
    // Height (in g) from the top of a fresh ball to the bottom of the buckets.
    const tall = (rows - 1 - SPAWN_Y) * VR + BALL_R + BUCKET_GAP + BUCKET_H + 0.2;
    const g = Math.max(8, Math.min(62, (w - side * 2) / (rows + 1.3), (h - padY * 2) / tall));
    const oy = h / 2 - (g * tall) / 2 + (BALL_R - SPAWN_Y * VR) * g;
    const table = TABLES[risk][rows];
    const family = getComputedStyle(board).fontFamily || 'system-ui, sans-serif';

    // One font size for every bucket label: shrink until the widest fits.
    const maxW = BUCKET_W * g - 4;
    let size = Math.max(7, Math.min(15, g * 0.36));
    const widest = (withX) => {
      g2d.font = `800 ${size}px ${family}`;
      return Math.max(...table.map((m) => g2d.measureText(withX ? multLabel(m) : String(m)).width));
    };
    let withX = true;
    let tw = widest(true);
    if (tw > maxW) size = Math.max(6, (size * maxW) / tw);
    if (widest(true) > maxW) {
      withX = false;
      size = Math.max(7, Math.min(15, g * 0.36));
      tw = widest(false);
      if (tw > maxW) size = Math.max(5.5, (size * maxW) / tw);
    }
    L = {
      w,
      h,
      dpr,
      g,
      cx: w / 2,
      oy,
      rows,
      table,
      font: `800 ${size}px ${family}`,
      labels: table.map((m) => (withX ? multLabel(m) : String(m))),
      colors: table.map((_, k) => bucketRgb(k, rows)),
    };
    draw(performance.now());
  }

  // ---- drawing ----
  function draw(now) {
    if (!L) return;
    const { g, cx, oy, dpr } = L;
    const X = (x) => cx + x * g;
    const Y = (y) => oy + y * g * VR;
    g2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2d.clearRect(0, 0, L.w, L.h);

    // Pegs
    const pr = Math.max(1.8, PEG_R * g);
    g2d.fillStyle = '#ffffff';
    g2d.beginPath();
    const flashing = [];
    for (let i = 0; i < L.rows; i++) {
      for (let j = 0; j < i + 3; j++) {
        const key = i * 64 + j;
        const t = pegFlash.get(key);
        if (t != null) {
          const e = 1 - (now - t) / FLASH_MS;
          if (e > 0) {
            flashing.push([X(j - (i + 2) / 2), Y(i), e]);
            continue;
          }
          pegFlash.delete(key);
        }
        const x = X(j - (i + 2) / 2);
        const y = Y(i);
        g2d.moveTo(x + pr, y);
        g2d.arc(x, y, pr, 0, Math.PI * 2);
      }
    }
    g2d.fill();
    for (const [x, y, e] of flashing) {
      g2d.fillStyle = `rgba(255,255,255,${0.22 * e})`;
      g2d.beginPath();
      g2d.arc(x, y, pr * (2.2 + 1.4 * (1 - e)), 0, Math.PI * 2);
      g2d.fill();
      g2d.fillStyle = '#ffffff';
      g2d.beginPath();
      g2d.arc(x, y, pr * (1 + 0.6 * e), 0, Math.PI * 2);
      g2d.fill();
    }

    // Buckets
    const bw = BUCKET_W * g;
    const bh = BUCKET_H * g;
    const lip = Math.max(2, g * 0.1);
    const by = Y(L.rows - 1) + BUCKET_GAP * g;
    const radius = Math.max(3, g * 0.12);
    g2d.font = L.font;
    g2d.textAlign = 'center';
    g2d.textBaseline = 'middle';
    for (let k = 0; k <= L.rows; k++) {
      const x = X(k - L.rows / 2) - bw / 2;
      const t = bucketPulse.get(k);
      let p = 1;
      if (t != null) {
        p = (now - t) / PULSE_MS;
        if (p >= 1) bucketPulse.delete(k);
      }
      const pulsing = p < 1;
      const push = pulsing ? Math.sin(Math.PI * p) : 0;
      const col = L.colors[k];
      g2d.fillStyle = css(col, 0.58);
      roundRect(g2d, x, by + lip, bw, bh - lip, radius);
      g2d.fill();
      const dy = push * lip * 1.6;
      g2d.fillStyle = css(col);
      roundRect(g2d, x, by + dy, bw, bh - lip, radius);
      g2d.fill();
      if (pulsing) {
        g2d.fillStyle = `rgba(255,255,255,${0.45 * (1 - p)})`;
        roundRect(g2d, x, by + dy, bw, bh - lip, radius);
        g2d.fill();
      }
      g2d.fillStyle = 'rgba(20,10,0,.88)';
      g2d.fillText(L.labels[k], x + bw / 2, by + dy + (bh - lip) / 2 + 0.5);
    }

    // Balls
    const br = BALL_R * g;
    for (const b of balls) {
      if (!b.pos) continue;
      const x = X(b.pos.x);
      const y = Y(b.pos.y);
      const grad = g2d.createRadialGradient(x - br * 0.35, y - br * 0.4, br * 0.1, x, y, br);
      grad.addColorStop(0, '#ffd6e4');
      grad.addColorStop(0.38, '#ff4f86');
      grad.addColorStop(1, '#c3104a');
      g2d.fillStyle = grad;
      g2d.beginPath();
      g2d.arc(x, y, br, 0, Math.PI * 2);
      g2d.fill();
    }
  }

  // ---- balls ----
  // Contact points in board units: spawn → one peg per row → bucket.
  function makeBall(res, isAuto) {
    const { path } = res.bet.result;
    const R = path.length;
    const pts = [{ x: (path[0] ? 1 : -1) * rand(0.02, 0.1), y: SPAWN_Y }];
    let right = 0;
    for (let i = 0; i < R; i++) {
      const dir = path[i] ? 1 : -1;
      const jx = dir * rand(0.03, 0.16); // hit the side of the peg it bounces off
      pts.push({ x: right - i / 2 + jx, y: i - Math.sqrt(CONTACT * CONTACT - jx * jx) / VR, peg: i * 64 + right + 1, row: i });
      right += path[i];
    }
    pts.push({ x: right - R / 2 + rand(-0.12, 0.12), y: R - 1 + (BUCKET_GAP + 0.12) / VR });
    const total = (1700 + R * 70) * (isAuto ? 0.6 : 1);
    const unit = total / (R + 1.2);
    return {
      res,
      bucket: right,
      pts,
      bounce: pts.map(() => rand(0.14, 0.3)),
      start: performance.now(),
      t0: unit * 1.2,
      ts: unit,
      hit: 0,
      pos: { x: pts[0].x, y: pts[0].y },
    };
  }

  function step(b, now) {
    const elapsed = now - b.start;
    let seg;
    let s;
    if (elapsed < b.t0) {
      seg = 0;
      s = Math.max(0, elapsed / b.t0);
    } else {
      seg = 1 + Math.floor((elapsed - b.t0) / b.ts);
      s = (elapsed - b.t0 - (seg - 1) * b.ts) / b.ts;
    }
    // Contacts passed since the last frame flash their peg.
    const reached = Math.min(seg, b.pts.length - 2);
    while (b.hit < reached) {
      b.hit++;
      const p = b.pts[b.hit];
      if (p.peg != null) {
        pegFlash.set(p.peg, now);
        if (now - lastPegSound > 28) {
          lastPegSound = now;
          sound.peg(p.row);
        }
      }
    }
    if (seg >= b.pts.length - 1) return false;
    const a = b.pts[seg];
    const c = b.pts[seg + 1];
    let f;
    if (seg === 0) f = s * s; // falling from rest
    else {
      // Parabola through (0,0) and (1,1) that first rises by `k`: constant gravity.
      const k = b.bounce[seg];
      const bb = -2 * k - 2 * Math.sqrt(k * k + k);
      f = (1 - bb) * s * s + bb * s;
    }
    b.pos = { x: a.x + (c.x - a.x) * s, y: a.y + (c.y - a.y) * f };
    return true;
  }

  function frame(now) {
    raf = 0;
    if (!alive) return;
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      if (!step(b, now)) {
        balls.splice(i, 1);
        land(b);
      }
    }
    draw(now);
    if (balls.length || pegFlash.size || bucketPulse.size) raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (!raf && alive) raf = requestAnimationFrame(frame);
  }

  // ---- balance bookkeeping for overlapping balls ----
  // The server has already credited every payout; show the newest balance
  // minus whatever is still falling, and settle each ball as it lands.
  const latest = {};
  const pending = new Map();
  const shownBalance = (code) => {
    let a = latest[code] ?? 0;
    for (const p of pending.values()) if (p.currency === code) a -= p.payout;
    return Math.max(0, a);
  };

  function land(b, { quiet = false } = {}) {
    const { bet } = b.res;
    pending.delete(bet.id);
    if (!quiet && alive) {
      bucketPulse.set(b.bucket, performance.now());
      const m = bet.result.multiplier;
      if (m >= 10) sound.bigWin();
      else if (m > 1) sound.win();
      else sound.reveal();
      pushLast(bet);
      kick();
    }
    ctx.settle({ bet, balance: { currency: bet.currency, amount: shownBalance(bet.currency) } });
    syncLocks();
  }

  function pushLast(bet) {
    const col = bucketRgb(bet.result.bucket, bet.params.rows);
    const item = el(
      `<button class="plinko-last-item" style="--c:${css(col)};--c2:${css(col, 0.58)}" aria-label="${esc(multLabel(bet.result.multiplier))}">${esc(multLabel(bet.result.multiplier))}</button>`,
    );
    item.addEventListener('click', () => ctx.showBet(bet.id));
    lastEl.prepend(item);
    while (lastEl.children.length > LAST_MAX) lastEl.lastElementChild.remove();
  }

  // Risk / rows stay locked while any ball is in the air.
  function syncLocks() {
    const lock = balls.length > 0 || requesting || panel.autoRunning;
    for (const k of ['risk', 'rows']) {
      const s = panel.field(k)?.querySelector('select');
      if (s && lock) s.disabled = true;
      else if (s && !panel.autoRunning && !requesting) s.disabled = false;
    }
  }

  panel.onChange((key, value) => {
    if (key === 'risk' || key === 'rows') {
      if (key === 'risk') risk = value;
      else rows = Number(value);
      layout();
    } else if (key === 'mode') queueMicrotask(syncLocks);
    else if (key === 'autoStopped') syncLocks();
  });

  async function play(isAuto) {
    if (requesting) return null;
    if (!ctx.requireAuth()) return null;
    requesting = true;
    if (!isAuto) panel.setBusy(true);
    syncLocks();
    let res;
    try {
      const v = panel.values();
      res = await api.post('/api/games/plinko/bet', { amount: v.amount, currency: ctx.currency(), params: { rows, risk } });
    } finally {
      requesting = false;
      if (!isAuto) panel.setBusy(false);
      syncLocks();
    }
    const { bet, balance } = res;
    latest[balance.currency] = balance.amount;
    pending.set(bet.id, { currency: bet.currency, payout: bet.payout });
    // debitView subtracts this bet's payout; the others still falling are taken off here.
    ctx.debitView({ bet, balance: { currency: balance.currency, amount: shownBalance(balance.currency) + bet.payout } });
    sound.bet();

    const ball = makeBall(res, isAuto);
    const sameBoard = bet.params.rows === L?.rows && bet.params.risk === risk;
    if (!ctx.animations() || !sameBoard || !alive) land(ball);
    else {
      balls.push(ball);
      syncLocks();
      kick();
    }

    if (isAuto) {
      if (ctx.animations()) await sleep(200);
      while (alive && balls.length >= MAX_IN_FLIGHT) await sleep(60);
    }
    return { win: bet.payout > bet.amount, profit: bet.payout - bet.amount };
  }

  // ---- sizing ----
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => layout()) : null;
  ro?.observe(board);
  const onResize = () => layout();
  window.addEventListener('resize', onResize);
  ctx.on('resize', onResize);
  layout();

  function destroy() {
    if (!alive) return;
    alive = false;
    cancelAnimationFrame(raf);
    ro?.disconnect();
    window.removeEventListener('resize', onResize);
    // Settle anything still falling so the balance and bet feed stay right.
    for (const b of balls.splice(0)) land(b, { quiet: true });
  }
  ctx.onDestroy(destroy);
  return { destroy };
}
