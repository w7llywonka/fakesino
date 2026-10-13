import { el, esc, on } from '../dom.js';
import { icon, coin } from '../icons.js';
import { amountField } from '../ui/controls.js';
import { state, serverNow } from '../state.js';
import { setQuery } from '../router.js';
import { crashMultiplierAt, crashTimeFor, CRASH_GROWTH } from '../shared/fair.js';

const BETTING_MS = 6000; // server/crash.js BETTING_MS (used for the countdown bar)
const MIN_CASHOUT = 1.01;
const MAX_CASHOUT = 1000000;
const CASHOUT_KEY = 'fakesino:crash:cashout';
const TAU = Math.PI * 2;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const curveAt = (t) => Math.exp(CRASH_GROWTH * Math.max(0, t));
const rand = (a, b) => a + Math.random() * (b - a);

function niceStep(range, count) {
  const raw = range / Math.max(1, count);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * pow;
}

function recallCashout() {
  try {
    const v = Number(localStorage.getItem(CASHOUT_KEY));
    return v >= MIN_CASHOUT && v <= MAX_CASHOUT ? v : 2;
  } catch {
    return 2;
  }
}

function rememberCashout(v) {
  try {
    if (v >= MIN_CASHOUT && v <= MAX_CASHOUT) localStorage.setItem(CASHOUT_KEY, String(v));
  } catch {
    /* storage unavailable */
  }
}

function pill(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export default function mountCrash(ctx) {
  const { api, fmt, sound } = ctx;
  const myId = () => state.user?.id ?? null;

  // ---- round state (server-driven) ----
  let round = null; // snapshot.round
  let players = new Map(); // userId → public player
  let history = [];
  let lastServerTime = 0;
  let lastSync = 0; // Date.now() of the last applied snapshot
  let queued = null; // my bet for the next round: { amount, currency, autoCashout, after: roundId }
  let myAuto = null; // my auto-cashout target: { value, roundId, after }
  let pendingAuto = null; // auto runner waiting on a round: { resolve, roundId, after }
  let busyAction = null;
  let destroyed = false;
  let fetching = false;

  // ---- visual state ----
  let labels = []; // cashout tags drawn on the curve
  let particles = [];
  let explodePending = false;
  let flashUntil = 0;
  let lastTickSec = null;
  let playersDirty = true;
  let seenRows = new Set();
  let historyHead = null;
  let btnKey = '';
  let prefillTimer = 0;

  // ---- sidebar ----
  const panel = ctx.createBetPanel({
    fields: [
      amountField(),
      { key: 'cashout', type: 'number', label: 'Cashout At', value: recallCashout(), suffix: '×', min: MIN_CASHOUT, max: MAX_CASHOUT, decimals: 2 },
      { key: 'profit', type: 'profit', label: 'Profit on Win' },
    ],
    onBet: (v) => manualAction(v),
    auto: { run: (v) => autoRound(v), delay: 0 },
  });
  panel.set('cashout', recallCashout());

  const listWrap = el(`<div class="cr-players-wrap"><div class="cr-players">
    <div class="cr-players-head"><span class="cr-count">${icon('user', 15)}<b>0</b><span>players</span></span><span class="cr-total"></span></div>
    <div class="cr-cols"><span>Player</span><span>Cashout</span><span>Amount</span></div>
    <div class="cr-players-body"></div>
  </div></div>`);
  ctx.controls.appendChild(listWrap);
  ctx.onDestroy(() => listWrap.remove());
  const countEl = listWrap.querySelector('.cr-count b');
  const countLbl = listWrap.querySelector('.cr-count span');
  const totalEl = listWrap.querySelector('.cr-total');
  const bodyEl = listWrap.querySelector('.cr-players-body');

  // ---- stage ----
  const stage = el(`<div class="cr-stage">
    <div class="history-strip cr-history" aria-label="Previous rounds"></div>
    <div class="cr-graph">
      <canvas class="cr-canvas" aria-hidden="true"></canvas>
      <div class="cr-center"><div class="cr-card">
        <div class="cr-mult">Connecting…</div>
        <div class="cr-note"></div>
        <div class="cr-progress" hidden><div class="cr-progress-fill"></div></div>
      </div></div>
    </div>
    <div class="cr-foot"><span class="cr-round"><i class="cr-dot"></i><span></span></span><span class="cr-foot-stats"></span></div>
  </div>`);
  ctx.stage.appendChild(stage);
  const histEl = stage.querySelector('.cr-history');
  const graph = stage.querySelector('.cr-graph');
  const canvas = stage.querySelector('canvas');
  const g = canvas.getContext('2d');
  const center = stage.querySelector('.cr-center');
  const multEl = stage.querySelector('.cr-mult');
  const noteEl = stage.querySelector('.cr-note');
  const progEl = stage.querySelector('.cr-progress');
  const progFill = stage.querySelector('.cr-progress-fill');
  const roundEl = stage.querySelector('.cr-round span');
  const dotEl = stage.querySelector('.cr-dot');
  const footStats = stage.querySelector('.cr-foot-stats');

  const font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';

  // ---- helpers ----
  const myPlayer = () => (myId() ? players.get(myId()) : null);
  const isQueued = () => !!(queued && round && queued.after === round.id);
  const hasLiveBet = () => {
    const p = myPlayer();
    return !!(p && !p.cashedAt && round && round.phase !== 'crashed');
  };

  function liveAuto() {
    const p = myPlayer();
    if (!p || p.cashedAt || !round || round.phase === 'crashed' || !myAuto) return null;
    return myAuto.roundId === round.id ? myAuto.value : null;
  }

  function updateProfit() {
    const m = Number(panel.get('cashout'));
    panel.setProfit(m >= MIN_CASHOUT ? m : null);
  }

  panel.onChange((key, value) => {
    if (key === 'cashout') {
      updateProfit();
      rememberCashout(Number(value));
    }
    if (key === 'mode') {
      if (value === 'auto') {
        panel.resetButton();
        panel.lock(false);
      }
      btnKey = '';
    }
    if (key === 'autoStopped') btnKey = '';
  });
  updateProfit();

  // ---- snapshots & live events ----
  function mergeMe(s) {
    if (!s.me || !s.round) return;
    const uid = myId();
    if (s.me.bet && uid && round && s.round.id === round.id && !players.has(uid)) players.set(uid, s.me.bet);
    if (s.me.bet && s.me.autoCashout) myAuto = { value: s.me.autoCashout, roundId: s.round.id };
    queued = s.me.queued ? { ...s.me.queued, after: s.round.id } : null;
    if (s.me.queued?.autoCashout && !(s.me.bet && !s.me.bet.cashedAt)) myAuto = { value: s.me.queued.autoCashout, roundId: null, after: s.round.id };
  }

  function applySnapshot(s) {
    if (!s?.round || destroyed) return;
    if (s.serverTime < lastServerTime) {
      // Older than what we already show (e.g. a slow HTTP response): only take the per-user bits.
      mergeMe(s);
      resolveLazyRounds();
      playersDirty = true;
      btnKey = '';
      return;
    }
    lastServerTime = s.serverTime;
    lastSync = Date.now();
    const prev = round;
    round = s.round;
    players = new Map((s.players || []).map((p) => [p.userId, { ...p }]));
    mergeMe(s);
    resolveLazyRounds();
    if (queued && queued.after !== round.id) queued = null; // promoted into this round
    if (s.history) renderHistory(s.history);

    const newRound = !prev || prev.id !== round.id;
    if (newRound) {
      labels = [];
      seenRows = new Set();
      lastTickSec = null;
      flashUntil = 0;
      center.classList.remove('cr-flash');
    }
    if (round.phase === 'crashed' && prev && !(prev.id === round.id && prev.phase === 'crashed')) onCrash();
    // Rebuild cashout tags for anyone who already cashed (e.g. after a reconnect).
    for (const p of players.values()) if (p.cashedAt && !labels.some((l) => l.userId === p.userId)) addLabel(p, true);

    checkPendingAuto();
    playersDirty = true;
    btnKey = '';
  }

  // Bets placed while a round is running ride the next one; pin them once it appears.
  function resolveLazyRounds() {
    if (!round) return;
    if (myAuto && !myAuto.roundId && myAuto.after !== round.id) myAuto.roundId = round.id;
    if (pendingAuto && !pendingAuto.roundId && pendingAuto.after !== round.id) pendingAuto.roundId = round.id;
  }

  function onCrash() {
    explodePending = true;
    const p = myPlayer();
    if (p && !p.cashedAt) sound.lose();
  }

  function addLabel(p, silent = false) {
    const mine = p.userId === myId();
    labels = labels.filter((l) => l.userId !== p.userId);
    labels.push({
      userId: p.userId,
      mine,
      t: crashTimeFor(p.cashedAt),
      m: p.cashedAt,
      text: `${mine ? 'You' : p.username ? (p.username.length > 12 ? `${p.username.slice(0, 11)}…` : p.username) : 'Hidden'}  ${fmt.multiplier(p.cashedAt)}`,
      born: silent ? performance.now() - 2000 : performance.now(),
    });
    // Keep the curve readable: my own tag plus the latest few others.
    const others = labels.filter((l) => !l.mine);
    if (others.length > 6) labels = labels.filter((l) => l.mine || others.slice(-6).includes(l));
  }

  function onCashout(p) {
    addLabel(p);
    if (p.userId === myId()) {
      sound.cashout();
      flashUntil = performance.now() + 1100;
      center.classList.remove('cr-flash');
      void center.offsetWidth;
      center.classList.add('cr-flash');
    }
  }

  ctx.on('live:crash', applySnapshot);
  ctx.on('live:crash:bet', ({ roundId, player }) => {
    if (!round || roundId !== round.id || !player) return;
    players.set(player.userId, { ...player });
    playersDirty = true;
    btnKey = '';
  });
  ctx.on('live:crash:cashout', (e) => {
    if (!round || e.roundId !== round.id) return;
    let p = players.get(e.userId);
    const already = !!p?.cashedAt;
    if (!p) {
      p = { userId: e.userId, username: e.username, currency: e.currency, amount: e.payout / e.cashedAt, cashedAt: null, payout: 0 };
      players.set(e.userId, p);
    }
    p.cashedAt = e.cashedAt;
    p.payout = e.payout;
    if (!already) onCashout(p);
    playersDirty = true;
    btnKey = '';
  });
  ctx.on('live:crash:cancel', ({ roundId, userId }) => {
    if (!round || roundId !== round.id) return;
    players.delete(userId);
    playersDirty = true;
    btnKey = '';
  });
  ctx.on('user', () => {
    queued = null;
    myAuto = null;
    lastServerTime = 0;
    btnKey = '';
    fetchState();
  });
  ctx.on('currency', () => {
    btnKey = '';
  });
  ctx.on('resize', () => requestAnimationFrame(resize));

  async function fetchState() {
    if (fetching || destroyed) return;
    fetching = true;
    try {
      applySnapshot(await api.get('/api/crash/state'));
    } catch {
      /* the watchdog retries */
    } finally {
      fetching = false;
    }
  }

  // Resync if an expected phase change never arrived (SSE hiccup, sleeping tab).
  const watchdog = setInterval(() => {
    if (!round) return fetchState();
    const now = serverNow();
    const stale =
      (round.phase === 'betting' && now - round.bettingEndsAt > 2500) ||
      (round.phase === 'crashed' && now - (round.crashedAt || now) > 5500) ||
      (round.phase === 'running' && Date.now() - lastSync > 10000);
    if (stale) fetchState();
  }, 2000);

  // ---- actions ----
  async function placeBet(v) {
    const cashout = Number(v.cashout);
    if (!(cashout >= MIN_CASHOUT && cashout <= MAX_CASHOUT)) {
      ctx.toast({ type: 'error', title: 'Invalid cashout', message: `Cashout At must be between ${MIN_CASHOUT}× and ${fmt.multiplier(MAX_CASHOUT, 0)}.` });
      return null;
    }
    if (!panel.checkBalance(v.amount)) return null;
    const res = await api.post('/api/crash/bet', { amount: v.amount, currency: ctx.currency(), autoCashout: cashout });
    ctx.setBalance(res.balance);
    sound.bet();
    const rid = res.state?.round?.id;
    myAuto = { value: Math.floor(cashout * 100) / 100, roundId: res.queued ? null : rid, after: res.queued ? rid : null };
    if (res.queued) queued = { amount: v.amount, currency: ctx.currency(), autoCashout: cashout, after: rid };
    applySnapshot(res.state);
    return res;
  }

  async function cancelBet() {
    const res = await api.post('/api/crash/cancel');
    ctx.setBalance(res.balance);
    const uid = myId();
    if (round && res.state?.round?.id === round.id && !res.state.me?.bet) players.delete(uid);
    queued = null;
    myAuto = null;
    applySnapshot(res.state);
    sound.click();
    playersDirty = true;
    return res;
  }

  async function cashOut() {
    const res = await api.post('/api/crash/cashout');
    ctx.setBalance(res.balance);
    const p = myPlayer();
    if (p && !p.cashedAt) {
      p.cashedAt = res.cashedAt;
      p.payout = res.payout;
      onCashout(p);
    }
    playersDirty = true;
    return res;
  }

  async function manualAction(v) {
    if (busyAction) return;
    if (!ctx.requireAuth()) return;
    const s = controlState(view());
    busyAction = s.key;
    btnKey = '';
    try {
      if (s.key === 'cashout') await cashOut();
      else if (s.key === 'cancel' || s.key === 'cancel-next') await cancelBet();
      else await placeBet(v);
    } finally {
      busyAction = null;
      btnKey = '';
    }
  }

  // Auto: bet on the next available round, then resolve once that round crashes.
  async function autoRound(v) {
    if (!ctx.requireAuth()) return null;
    if (hasLiveBet() || isQueued()) return null;
    const res = await placeBet(v);
    if (!res || destroyed) return null;
    const rid = res.state?.round?.id;
    return new Promise((resolve) => {
      pendingAuto = { resolve, roundId: res.queued ? null : rid, after: res.queued ? rid : null };
      resolveLazyRounds();
      checkPendingAuto();
    });
  }

  function finishAuto(result) {
    const p = pendingAuto;
    pendingAuto = null;
    p?.resolve(result);
  }

  function checkPendingAuto() {
    const p = pendingAuto;
    if (!p || !round || !p.roundId) return;
    if (round.id !== p.roundId) return finishAuto(null); // missed that round entirely
    if (round.phase !== 'crashed') return;
    const mine = myPlayer();
    finishAuto(mine ? { win: mine.cashedAt != null, profit: (mine.payout || 0) - mine.amount } : null);
  }

  // "Stop Autobet" also withdraws a bet that has not started yet.
  panel.root.addEventListener(
    'click',
    (e) => {
      if (e.target.closest('.bp-bet') !== panel.button || panel.button.disabled) return;
      if (panel.mode !== 'auto' || !panel.autoRunning || !pendingAuto) return;
      const cancellable = isQueued() || (round?.phase === 'betting' && !!myPlayer());
      if (cancellable)
        cancelBet()
          .then(() => finishAuto(null))
          .catch(() => {});
    },
    true,
  );

  // ---- main button ----
  function controlState(v) {
    const p = myPlayer();
    const phase = round?.phase;
    if (p && phase === 'running' && !p.cashedAt) {
      return { key: 'cashout', label: 'Cash Out', sub: fmt.money(p.amount * v.m, p.currency), code: p.currency, variant: 'primary', cls: 'cr-cashout', lock: true };
    }
    if (isQueued()) return { key: 'cancel-next', label: 'Cancel', sub: 'Bet placed for next round', variant: 'secondary', cls: 'cr-cancel', lock: true };
    if (p && phase === 'betting') return { key: 'cancel', label: 'Cancel', sub: 'Waiting for round to start', variant: 'secondary', cls: 'cr-cancel', lock: true };
    if (!round || phase === 'betting') return { key: 'bet', label: 'Bet' };
    return { key: 'next', label: 'Bet (Next Round)' };
  }

  function renderButton(v) {
    if (panel.mode !== 'manual') return;
    const s = controlState(v);
    const key = `${s.key}|${s.code || ''}|${busyAction || ''}`;
    if (key !== btnKey) {
      btnKey = key;
      panel.setButton(s.label, { variant: s.variant || 'primary', disabled: !!busyAction });
      if (s.cls) panel.button.classList.add(s.cls);
      if (s.sub != null) {
        panel.button.classList.add('cr-two');
        panel.button.innerHTML = `<span class="cr-btn-l">${esc(s.label)}</span><span class="cr-btn-s"><span></span>${s.code ? coin(s.code, 13) : ''}</span>`;
      }
      if (busyAction) panel.button.classList.add('loading');
      panel.lock(!!s.lock || !!busyAction);
    }
    if (s.sub != null) {
      const sub = panel.button.querySelector('.cr-btn-s > span');
      if (sub && sub.textContent !== s.sub) sub.textContent = s.sub;
    }
  }

  // ---- players list ----
  function renderPlayers() {
    playersDirty = false;
    const uid = myId();
    const arr = [...players.values()];
    const usd = (p) => fmt.usdOf(p.amount, p.currency);
    arr.sort((a, b) => (b.userId === uid) - (a.userId === uid) || usd(b) - usd(a));
    const totalUsd = arr.reduce((a, p) => a + usd(p), 0);
    countEl.textContent = arr.length;
    countLbl.textContent = arr.length === 1 ? 'player' : 'players';
    totalEl.textContent = fmt.fiat(totalUsd);
    const crashed = round?.phase === 'crashed';
    bodyEl.innerHTML = arr.length
      ? arr
          .map((p) => {
            const st = p.cashedAt ? 'won' : crashed ? 'lost' : 'live';
            const fresh = !seenRows.has(p.userId);
            seenRows.add(p.userId);
            const name = p.username ? esc(p.username) : `<span class="user-hidden">${icon('eyeOff', 13)} Hidden</span>`;
            return `<div class="cr-row ${st} ${p.userId === uid ? 'me' : ''} ${fresh ? 'fresh' : ''}">
              <span class="cr-name">${name}</span>
              <span class="cr-at">${p.cashedAt ? fmt.multiplier(p.cashedAt) : crashed ? '—' : '<i class="cr-wait"></i>'}</span>
              <span class="cr-amt">${esc(fmt.money(p.cashedAt ? p.payout : p.amount, p.currency))}${coin(p.currency, 14)}</span>
            </div>`;
          })
          .join('')
      : `<div class="cr-empty">${round?.phase === 'betting' ? 'No bets yet — be the first.' : 'Nobody is playing this round.'}</div>`;
    footStats.innerHTML = `${icon('user', 13)} ${arr.length} · ${esc(fmt.fiat(totalUsd))}`;
    if (round) {
      roundEl.textContent = `Round ${round.id}`;
      dotEl.className = `cr-dot ${round.phase}`;
    }
  }

  // ---- history strip ----
  function renderHistory(list) {
    history = list;
    const head = list[0]?.id ?? null;
    if (head === historyHead && histEl.childElementCount) return;
    const animate = historyHead !== null;
    historyHead = head;
    histEl.innerHTML = list
      .slice(0, 16)
      .reverse()
      .map(
        (h, i, a) =>
          `<button class="chip ${h.crashPoint >= 2 ? 'win' : 'lose'} ${h.crashPoint >= 10 ? 'cr-hi' : ''} ${animate && i === a.length - 1 ? 'fresh' : ''}" data-hash="${esc(h.hash)}" data-tip="Round ${esc(h.id)} · verify">${fmt.multiplier(h.crashPoint)}</button>`,
      )
      .join('');
  }

  on(histEl, 'click', '.chip[data-hash]', (e, b) => openVerify(b.dataset.hash));

  // Open the fairness modal on its Crash tab and drop this round's hash into it.
  function openVerify(hash) {
    setQuery({ modal: 'fairness', tab: 'crash' });
    clearTimeout(prefillTimer);
    let tries = 0;
    const fill = () => {
      const input = document.querySelector('.modal input[name=hash]');
      if (input) {
        if (input.value !== hash) {
          input.value = hash;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return;
      }
      if (++tries < 40) prefillTimer = setTimeout(fill, 75);
    };
    fill();
  }

  // ---- canvas ----
  let W = 0;
  let H = 0;
  let dpr = 1;
  function resize() {
    if (destroyed) return;
    const r = graph.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
  }
  const ro = new ResizeObserver(() => resize());
  ro.observe(graph);
  window.addEventListener('resize', resize);
  resize();

  const scale = { xMax: 10000, yMax: 2 };
  let L = null;
  const px = (t) => L.x0 + (t / scale.xMax) * L.pw;
  const py = (m) => L.y0 - ((m - 1) / (scale.yMax - 1)) * L.ph;

  function view() {
    if (!round) return { phase: 'loading', t: 0, m: 1, mc: 1 };
    const now = serverNow();
    if (round.phase === 'betting') return { phase: 'betting', remaining: Math.max(0, round.bettingEndsAt - now), t: 0, m: 1, mc: 1 };
    if (round.phase === 'running') {
      const t = Math.max(0, now - round.startedAt);
      return { phase: 'running', t, m: Math.max(1, crashMultiplierAt(t)), mc: curveAt(t) };
    }
    const cp = round.crashPoint || 1;
    return { phase: 'crashed', t: crashTimeFor(cp), m: cp, mc: cp, since: Math.max(0, now - (round.crashedAt || now)) };
  }

  function updateScale(v, dt) {
    const tx = Math.max(10000, v.t * 1.15);
    const ty = Math.max(2, v.mc * 1.2);
    if (v.phase === 'running' || !ctx.animations()) {
      scale.xMax = tx;
      scale.yMax = ty;
      return;
    }
    const k = 1 - Math.exp(-dt * 5);
    scale.xMax = Math.exp(Math.log(scale.xMax) + (Math.log(tx) - Math.log(scale.xMax)) * k);
    scale.yMax = Math.exp(Math.log(scale.yMax) + (Math.log(ty) - Math.log(scale.yMax)) * k);
  }

  function drawGrid() {
    g.lineWidth = 1;
    g.font = `600 ${W < 520 ? 10 : 11}px ${font}`;
    // y axis (multiplier)
    const yStep = niceStep(scale.yMax - 1, Math.max(2, Math.floor(L.ph / 58)));
    const ys = [];
    for (let k = Math.ceil(1 / yStep - 1e-9); k * yStep <= scale.yMax + 1e-9; k++) ys.push(Math.round(k * yStep * 1000) / 1000);
    if (!ys.length || ys[0] - 1 > yStep * 0.45) ys.unshift(1);
    const yLabel = (v) => (v >= 1000 ? `${fmt.compact(v)}×` : `${v.toFixed(yStep < 1 ? 1 : 0)}×`);
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (const v of ys) {
      const y = Math.round(py(v)) + 0.5;
      if (y < L.y1 - 4) continue;
      g.strokeStyle = v === 1 ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.05)';
      g.beginPath();
      g.moveTo(L.x0, y);
      g.lineTo(L.x1, y);
      g.stroke();
      g.fillStyle = '#6f8399';
      g.fillText(yLabel(v), L.x0 - 8, y);
    }
    // x axis (seconds)
    const xStep = Math.max(1, niceStep(scale.xMax / 1000, Math.max(2, Math.floor(L.pw / 92))));
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (let s = 0; s * 1000 <= scale.xMax + 1; s += xStep) {
      const x = Math.round(px(s * 1000)) + 0.5;
      if (s > 0) {
        g.strokeStyle = 'rgba(255,255,255,0.035)';
        g.beginPath();
        g.moveTo(x, L.y1);
        g.lineTo(x, L.y0);
        g.stroke();
      }
      g.fillStyle = '#6f8399';
      g.fillText(`${s}s`, x, L.y0 + 9);
    }
    g.strokeStyle = 'rgba(255,255,255,0.13)';
    g.beginPath();
    g.moveTo(L.x0 + 0.5, L.y1);
    g.lineTo(L.x0 + 0.5, L.y0 + 0.5);
    g.stroke();
  }

  function drawIdle(now) {
    // Faint preview of the curve and a pulsing "launch pad" at the origin.
    g.save();
    g.setLineDash([3, 7]);
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    g.lineWidth = 2;
    g.beginPath();
    const tEnd = Math.min(scale.xMax, crashTimeFor(scale.yMax));
    for (let i = 0; i <= 40; i++) {
      const t = (tEnd * i) / 40;
      const x = px(t);
      const y = py(curveAt(t));
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
    g.restore();
    const pulse = 0.5 + 0.5 * Math.sin(now / 260);
    drawOrb(L.x0, L.y0, 0.55 + 0.45 * pulse, false);
  }

  function drawOrb(x, y, intensity, hot) {
    const r = 24 + 6 * intensity;
    const halo = g.createRadialGradient(x, y, 0, x, y, r);
    halo.addColorStop(0, `rgba(255,214,120,${0.75 * intensity})`);
    halo.addColorStop(0.35, `rgba(255,150,60,${0.32 * intensity})`);
    halo.addColorStop(1, 'rgba(255,120,60,0)');
    g.fillStyle = halo;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    g.fillStyle = hot ? '#fff' : '#ffe6b0';
    g.beginPath();
    g.arc(x, y, hot ? 5 : 4, 0, TAU);
    g.fill();
  }

  function drawCurve(v, now) {
    const crashed = v.phase === 'crashed';
    const tipX = px(v.t);
    const tipY = py(v.mc);
    const n = clamp(Math.round((tipX - L.x0) / 4), 8, 180);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = (v.t * i) / n;
      pts.push([px(t), py(curveAt(t))]);
    }
    const fade = crashed ? 1 - 0.6 * clamp(v.since / 900, 0, 1) : 1;
    g.save();
    g.globalAlpha = fade;
    // area
    g.beginPath();
    g.moveTo(L.x0, L.y0);
    for (const [x, y] of pts) g.lineTo(x, y);
    g.lineTo(tipX, L.y0);
    g.closePath();
    const area = g.createLinearGradient(0, Math.min(tipY, L.y0 - 1), 0, L.y0);
    area.addColorStop(0, crashed ? 'rgba(255,77,94,0.24)' : 'rgba(255,150,60,0.28)');
    area.addColorStop(1, crashed ? 'rgba(255,77,94,0.02)' : 'rgba(255,150,60,0.02)');
    g.fillStyle = area;
    g.fill();
    // line
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    let stroke = crashed ? '#ff4d5e' : '#ffb347';
    if (!crashed && tipX - L.x0 > 2) {
      stroke = g.createLinearGradient(L.x0, L.y0, tipX, tipY);
      stroke.addColorStop(0, '#ffd166');
      stroke.addColorStop(0.55, '#ff9f43');
      stroke.addColorStop(1, '#ff6b3d');
    }
    g.strokeStyle = stroke;
    g.lineWidth = W < 520 ? 3.5 : 4.5;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.shadowColor = crashed ? 'rgba(255,77,94,0.6)' : 'rgba(255,140,60,0.65)';
    g.shadowBlur = 18;
    g.stroke();
    g.restore();

    if (!crashed) {
      drawOrb(tipX, tipY, 0.8 + 0.2 * Math.sin(now / 120), true);
      if (ctx.animations()) {
        // sparks trailing off the tip, against the direction of travel
        const [ax, ay] = pts[Math.max(0, pts.length - 4)];
        const dx = tipX - ax;
        const dy = tipY - ay;
        const len = Math.hypot(dx, dy) || 1;
        for (let i = 0; i < 2; i++) {
          const sp = rand(30, 110);
          particles.push({
            x: tipX,
            y: tipY,
            vx: (-dx / len) * sp + rand(-35, 35),
            vy: (-dy / len) * sp + rand(-35, 35),
            life: rand(0.35, 0.75),
            max: 0.75,
            size: rand(1, 2.4),
            color: ['#ffd166', '#ff9f43', '#fff1c9'][(Math.random() * 3) | 0],
            g: 30,
          });
        }
      }
    } else {
      if (explodePending) {
        explodePending = false;
        if (ctx.animations()) explode(tipX, tipY);
      }
      const s = v.since / 1000;
      if (s < 0.7 && ctx.animations()) {
        g.strokeStyle = `rgba(255,77,94,${0.8 * (1 - s / 0.7)})`;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(tipX, tipY, 8 + s * 120, 0, TAU);
        g.stroke();
      }
      g.fillStyle = '#ff4d5e';
      g.beginPath();
      g.arc(tipX, tipY, 5, 0, TAU);
      g.fill();
    }
  }

  function explode(x, y) {
    for (let i = 0; i < 46; i++) {
      const a = rand(0, TAU);
      const sp = rand(60, 300);
      particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.5, 1.1),
        max: 1.1,
        size: rand(1.4, 3.4),
        color: ['#ff4d5e', '#ff8a4c', '#ffd166', '#ffffff'][(Math.random() * 4) | 0],
        g: 260,
      });
    }
  }

  function drawParticles(dt) {
    if (!particles.length) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      p.life -= dt;
      p.vy += p.g * dt;
      p.vx *= 1 - 1.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) continue;
      g.globalAlpha = clamp(p.life / p.max, 0, 1);
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, p.size, 0, TAU);
      g.fill();
    }
    g.restore();
    particles = particles.filter((p) => p.life > 0);
    if (particles.length > 400) particles = particles.slice(-400);
  }

  function drawTarget() {
    const target = liveAuto();
    if (!target || target > scale.yMax) return;
    const y = Math.round(py(target)) + 0.5;
    g.save();
    g.setLineDash([6, 6]);
    g.strokeStyle = 'rgba(34,211,107,0.45)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(L.x0, y);
    g.lineTo(L.x1, y);
    g.stroke();
    g.setLineDash([]);
    const text = `Auto ${fmt.multiplier(target)}`;
    g.font = `700 11px ${font}`;
    const w = g.measureText(text).width + 14;
    pill(g, L.x1 - w, y - 10, w, 20, 10);
    g.fillStyle = 'rgba(10,17,24,0.92)';
    g.fill();
    g.strokeStyle = 'rgba(34,211,107,0.55)';
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = '#22d36b';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, L.x1 - w / 2, y + 0.5);
    g.restore();
  }

  function drawLabels(now) {
    if (!labels.length) return;
    const placed = [];
    g.save();
    g.font = `700 11px ${font}`;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    for (const lb of labels) {
      const age = (now - lb.born) / 1000;
      const alpha = lb.mine ? 1 : age < 2.6 ? 1 : 1 - (age - 2.6) / 0.6;
      if (alpha <= 0) continue;
      const x = px(lb.t);
      const y = py(lb.m);
      if (x < L.x0 - 2 || y < L.y1 - 30) continue;
      const w = g.measureText(lb.text).width + 16;
      const h = 20;
      let lx = clamp(x - w / 2, L.x0 + 2, L.x1 - w);
      let ly = y - h - 14;
      for (let i = 0; i < 6 && placed.some((r) => lx < r.x + r.w + 4 && lx + w + 4 > r.x && ly < r.y + r.h + 3 && ly + h + 3 > r.y); i++) ly -= h + 4;
      ly = Math.max(L.y1 - 14, ly);
      placed.push({ x: lx, y: ly, w, h });
      const pop = ctx.animations() ? clamp(age / 0.18, 0, 1) : 1;
      g.globalAlpha = alpha * pop;
      g.strokeStyle = lb.mine ? 'rgba(34,211,107,0.8)' : 'rgba(255,255,255,0.28)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x + 0.5, y - 4);
      g.lineTo(x + 0.5, ly + h);
      g.stroke();
      g.fillStyle = lb.mine ? '#22d36b' : '#f4f7fb';
      g.beginPath();
      g.arc(x, y, 3.5, 0, TAU);
      g.fill();
      pill(g, lx, ly, w, h, 10);
      g.fillStyle = lb.mine ? '#22d36b' : 'rgba(29,43,56,0.95)';
      g.fill();
      if (!lb.mine) {
        g.strokeStyle = 'rgba(255,255,255,0.12)';
        g.stroke();
      }
      g.fillStyle = lb.mine ? '#052812' : '#f4f7fb';
      g.fillText(lb.text, lx + w / 2, ly + h / 2 + 0.5);
    }
    g.restore();
  }

  // ---- centre overlay ----
  const ov = { phase: '', mult: '', note: '', noteCls: '', prog: -1 };
  function renderOverlay(v, now) {
    const p = myPlayer();
    let mult = '';
    let note = '';
    let noteCls = '';
    let prog = -1;
    if (v.phase === 'loading') mult = 'Connecting…';
    else if (v.phase === 'betting') {
      mult = v.remaining > 50 ? `Starting in ${(v.remaining / 1000).toFixed(1)}s` : 'Starting…';
      prog = clamp(v.remaining / BETTING_MS, 0, 1);
      if (p) note = 'Your bet is in — good luck!';
      else if (isQueued()) note = 'Your bet is queued';
    } else if (v.phase === 'running') {
      mult = fmt.multiplier(v.m);
      if (p?.cashedAt) {
        note = `+${esc(fmt.money(p.payout, p.currency))}${coin(p.currency, 16)}`;
        noteCls = 'win';
      }
    } else {
      mult = `Crashed @ ${fmt.multiplier(v.m)}`;
      if (p?.cashedAt) {
        note = `Cashed out @ ${fmt.multiplier(p.cashedAt)} · +${esc(fmt.money(p.payout, p.currency))}${coin(p.currency, 16)}`;
        noteCls = 'win';
      } else if (p) {
        note = `−${esc(fmt.money(p.amount, p.currency))}${coin(p.currency, 16)}`;
        noteCls = 'lose';
      }
    }
    const phase = `${v.phase}${now < flashUntil ? ' cr-flash' : ''}`;
    if (phase !== ov.phase) {
      ov.phase = phase;
      center.className = `cr-center is-${phase}`;
    }
    if (mult !== ov.mult) {
      ov.mult = mult;
      multEl.textContent = mult;
    }
    if (note !== ov.note || noteCls !== ov.noteCls) {
      ov.note = note;
      ov.noteCls = noteCls;
      noteEl.innerHTML = note;
      noteEl.className = `cr-note ${noteCls}`;
    }
    if (prog !== ov.prog) {
      ov.prog = prog;
      progEl.hidden = prog < 0;
      if (prog >= 0) progFill.style.transform = `scaleX(${prog.toFixed(4)})`;
    }
  }

  // ---- frame loop ----
  let raf = 0;
  let last = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    const v = view();

    if (v.phase === 'betting') {
      const sec = Math.ceil(v.remaining / 1000);
      if (lastTickSec !== null && sec !== lastTickSec && sec >= 1) sound.tick();
      lastTickSec = sec;
    }

    updateScale(v, dt);
    const small = W < 520;
    const l = small ? 40 : 54;
    const r = small ? 14 : 26;
    const t = small ? 22 : 30;
    const b = small ? 28 : 34;
    L = { x0: l, x1: W - r, y0: H - b, y1: t, pw: Math.max(1, W - l - r), ph: Math.max(1, H - t - b) };

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    drawGrid();
    if (v.phase === 'running' || v.phase === 'crashed') drawCurve(v, now);
    else drawIdle(now);
    drawTarget();
    drawLabels(now);
    drawParticles(dt);

    renderOverlay(v, now);
    renderButton(v);
    if (playersDirty) renderPlayers();
  }
  raf = requestAnimationFrame(frame);

  fetchState();

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      clearInterval(watchdog);
      clearTimeout(prefillTimer);
      ro.disconnect();
      window.removeEventListener('resize', resize);
      finishAuto(null);
    },
  };
}
