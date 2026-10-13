import { el, esc } from '../dom.js';
import { icon, coin } from '../icons.js';
import { state } from '../state.js';

// Client side of the shared-round games (Slide, Zoo): keeps the round state
// in sync from the live feed (with a REST fallback), places and cancels
// bets, and resolves auto-bet rounds once they settle.
export function createRoundClient(ctx, slug, { onState = () => {}, onBet = () => {}, onCancel = () => {} } = {}) {
  const { api } = ctx;
  const s = {
    round: null,
    bets: [], // public bets in the current round
    history: [],
    phases: null,
    mine: new Set(), // ids of my bets (current + queued)
    queued: [], // my bets waiting for the next round
    lastSync: 0,
  };
  let destroyed = false;
  let fetching = false;
  const waiters = new Map(); // bet id → resolve(bet) once settled

  const serverNow = () => Date.now() + (state.serverOffset || 0);

  function apply(snap) {
    if (!snap || destroyed) return;
    if (snap.serverTime) state.serverOffset = snap.serverTime - Date.now();
    const prevId = s.round?.id;
    s.round = snap.round;
    s.bets = snap.bets || [];
    s.history = snap.history || s.history;
    s.phases = snap.phases || s.phases;
    s.lastSync = Date.now();
    if (snap.me) {
      s.queued = snap.me.queued || [];
      for (const id of snap.me.bets || []) s.mine.add(id);
      for (const q of s.queued) s.mine.add(q.id);
    } else if (s.round && s.round.id !== prevId) {
      // A new round: queued bets have joined it.
      s.queued = s.queued.filter((q) => !s.bets.some((b) => b.id === q.id));
    }
    if (s.round?.phase === 'result') {
      for (const b of s.bets) {
        const w = waiters.get(b.id);
        if (w) {
          waiters.delete(b.id);
          w(b);
        }
      }
    }
    // A waiter whose bet vanished (cancelled elsewhere) resolves empty.
    if (s.round?.phase !== 'betting')
      for (const [id, w] of waiters) {
        const inRound = s.bets.some((b) => b.id === id);
        const inQueue = s.queued.some((b) => b.id === id);
        if (!inRound && !inQueue) {
          waiters.delete(id);
          w(null);
        }
      }
    onState(s);
  }

  async function fetchState() {
    if (fetching || destroyed) return;
    fetching = true;
    try {
      apply(await api.get(`/api/${slug}/state`));
    } catch {
      /* the watchdog retries */
    } finally {
      fetching = false;
    }
  }

  ctx.on(`live:${slug}:state`, apply);
  ctx.on(`live:${slug}:bet`, (b) => {
    if (!s.round || b.roundId !== s.round.id || s.bets.some((x) => x.id === b.id)) return;
    s.bets.push(b);
    onBet(b, s);
  });
  ctx.on(`live:${slug}:cancel`, ({ roundId, id }) => {
    if (s.round?.id !== roundId) return;
    s.bets = s.bets.filter((b) => b.id !== id);
    onCancel(id, s);
  });
  ctx.on('user', () => fetchState());
  ctx.on('live:hello', () => fetchState());

  // Resync if a phase change never arrived (SSE hiccup, sleeping tab).
  const watchdog = setInterval(() => {
    if (!s.round) return fetchState();
    if (serverNow() - s.round.endsAt > 2500 || Date.now() - s.lastSync > 30000) fetchState();
  }, 1500);

  return {
    s,
    serverNow,
    fetchState,
    isMine: (b) => s.mine.has(b.id),
    myBets: () => s.bets.filter((b) => s.mine.has(b.id)),
    async place(body) {
      const res = await api.post(`/api/${slug}/bet`, { currency: ctx.currency(), ...body });
      s.mine.add(res.bet.id);
      ctx.setBalance(res.balance);
      apply(res.state);
      return res;
    },
    async cancel(betId) {
      const res = await api.post(`/api/${slug}/cancel`, betId ? { betId } : {});
      ctx.setBalance(res.balance);
      apply(res.state);
      return res;
    },
    // Resolves with the settled public bet (payout set), or null if it never played.
    settled: (betId) => new Promise((resolve) => waiters.set(betId, resolve)),
    destroy() {
      destroyed = true;
      clearInterval(watchdog);
      for (const w of waiters.values()) w(null);
      waiters.clear();
    },
  };
}

// Countdown/progress for the current phase, 0 → 1.
export function phaseProgress(client) {
  const r = client.s.round;
  if (!r) return { left: 0, p: 0 };
  const total = r.phase === 'betting' ? client.s.phases?.betting : r.phase === 'playing' ? client.s.phases?.playing : client.s.phases?.result;
  const left = Math.max(0, r.endsAt - client.serverNow());
  return { left, p: total ? Math.min(1, 1 - left / total) : 0 };
}

// Players list in the sidebar, under the bet panel.
export function roundPlayers(ctx, { columns, cells }) {
  const wrap = el(`<div class="rk-players"><div class="rk-head"><span class="rk-count">${icon('user', 15)}<b>0</b><span>players</span></span><span class="rk-total"></span></div>
    <div class="rk-cols">${columns.map((c) => `<span>${esc(c)}</span>`).join('')}</div><div class="rk-body"></div></div>`);
  ctx.controls.appendChild(wrap);
  ctx.onDestroy(() => wrap.remove());
  const body = wrap.querySelector('.rk-body');
  return {
    render(bets, { phase, isMine, onCancel } = {}) {
      const fmt = ctx.fmt;
      const usd = (b) => fmt.usdOf(b.amount, b.currency);
      const list = [...bets].sort((a, b) => isMine(b) - isMine(a) || usd(b) - usd(a));
      const players = new Set(list.map((b) => b.username || b.id)).size;
      wrap.querySelector('.rk-count b').textContent = players;
      wrap.querySelector('.rk-count span').textContent = players === 1 ? 'player' : 'players';
      wrap.querySelector('.rk-total').textContent = fmt.fiat(list.reduce((a, b) => a + usd(b), 0));
      body.innerHTML = list.length
        ? list
            .map((b) => {
              const st = b.payout == null ? 'live' : b.payout > 0 ? 'won' : 'lost';
              const name = b.username ? esc(b.username) : `<span class="user-hidden">${icon('eyeOff', 13)} Hidden</span>`;
              const cancel = isMine(b) && phase === 'betting' && onCancel ? `<button class="rk-x" data-cancel="${esc(b.id)}" aria-label="Cancel bet">${icon('close', 12)}</button>` : '';
              return `<div class="rk-row ${st} ${isMine(b) ? 'me' : ''}"><span class="rk-name">${cancel}${name}</span>${cells(b)
                .map((c) => `<span>${c}</span>`)
                .join('')}<span class="rk-amt">${esc(fmt.money(b.payout > 0 ? b.payout : b.amount, b.currency))}${coin(b.currency, 14)}</span></div>`;
            })
            .join('')
        : `<div class="rk-empty">${phase === 'betting' ? 'No bets yet — be the first.' : 'Nobody is playing this round.'}</div>`;
      if (onCancel) body.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => onCancel(b.dataset.cancel)));
    },
  };
}
