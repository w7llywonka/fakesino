import { el, esc, on } from '../dom.js';
import { amountField } from '../ui/controls.js';
import { createRoundClient, phaseProgress, roundPlayers } from '../ui/roundkit.js';
import { MIN_TARGET, MAX_TARGET, winChance, tier } from '../shared/games/slide.js';

const CARDS = 64;
const STOP = 52; // index of the result card
const CARD_W = 96;
const GAP = 8;
const QUICK = [1.5, 2, 5, 10, 20, 50, 100, 1000];
const TARGET_KEY = 'fakesino:slide:target';

const clampTarget = (t) => Math.min(MAX_TARGET, Math.max(MIN_TARGET, Math.floor(t * 100 + 1e-7) / 100));
// Filler cards follow the real distribution: P(x ≥ t) = 0.98 / t.
const fillerValue = () => Math.max(1, Math.floor((0.98 / (1 - Math.random())) * 100) / 100);
const easeOut = (t) => 1 - (1 - t) ** 3;

function recallTarget() {
  try {
    const v = Number(localStorage.getItem(TARGET_KEY));
    return v >= MIN_TARGET && v <= MAX_TARGET ? v : 2;
  } catch {
    return 2;
  }
}

export function renderPreview(result, params) {
  const won = result.point >= params.target;
  return `<div style="text-align:center"><div style="font-size:30px;font-weight:900;color:${won ? 'var(--accent)' : 'var(--text)'}">${result.point.toFixed(2)}×</div><div class="muted">Target ${Number(params.target).toFixed(2)}× · ${won ? 'won' : 'lost'}</div></div>`;
}

export default function mountSlide(ctx) {
  const { fmt, sound } = ctx;
  let destroyed = false;
  let raf = 0;
  let strip = null; // { roundId, values, jitter }
  let shownRound = null;
  let busy = false;

  const panel = ctx.createBetPanel({
    fields: [
      amountField(),
      { key: 'target', type: 'number', label: 'Target Multiplier', value: recallTarget(), suffix: '×', min: MIN_TARGET, max: MAX_TARGET, decimals: 2 },
      { key: 'chance', type: 'readonly', label: 'Win Chance', suffix: '%' },
      { key: 'profit', type: 'profit', label: 'Profit on Win' },
    ],
    onBet: (v) => manualBet(v),
    auto: { run: (v) => autoRound(v), delay: 0 },
    hotkeys: { w: () => panel.step('target', -1), e: () => panel.step('target', 1) },
  });

  const players = roundPlayers(ctx, { columns: ['Player', 'Target', 'Amount'], cells: (b) => [`${b.params.target.toFixed(2)}×`] });

  const stage = el(`<div class="sl2-stage">
    <div class="history-strip sl2-history" aria-label="Previous rounds"></div>
    <div class="sl2-track">
      <div class="sl2-pointer top"></div><div class="sl2-pointer bottom"></div>
      <div class="sl2-cards"></div>
      <div class="sl2-overlay"><div class="sl2-count"></div><div class="sl2-bar"><i></i></div></div>
    </div>
    <div class="stage-caption sl2-caption" aria-live="polite"><div class="main"></div><div class="sub"></div></div>
    <div class="stage-bottom"><div class="sl2-quick">${QUICK.map((q) => `<button type="button" data-q="${q}">${q >= 1000 ? `${q / 1000}K` : q}×</button>`).join('')}</div></div>
  </div>`);
  ctx.stage.appendChild(stage);
  const histEl = stage.querySelector('.sl2-history');
  const track = stage.querySelector('.sl2-track');
  const cardsEl = stage.querySelector('.sl2-cards');
  const overlay = stage.querySelector('.sl2-overlay');
  const countEl = stage.querySelector('.sl2-count');
  const barEl = stage.querySelector('.sl2-bar i');
  const caption = stage.querySelector('.sl2-caption');

  const client = createRoundClient(ctx, 'slide', {
    onState: () => onState(),
    onBet: () => renderPlayers(),
    onCancel: () => renderPlayers(),
  });
  ctx.onDestroy(() => client.destroy());

  const target = () => clampTarget(Number(panel.get('target')) || 2);

  function syncTarget() {
    const t = target();
    panel.set('chance', winChance(t).toFixed(4));
    panel.setProfit(t);
    stage.querySelectorAll('[data-q]').forEach((b) => b.classList.toggle('active', Number(b.dataset.q) === t));
    try {
      localStorage.setItem(TARGET_KEY, String(t));
    } catch {
      /* private mode */
    }
  }

  function setCaption(main, sub = '', cls = '') {
    caption.className = `stage-caption sl2-caption ${cls}`;
    caption.querySelector('.main').textContent = main;
    caption.querySelector('.sub').innerHTML = sub;
  }

  // ---- strip ----
  function buildStrip(roundId, result) {
    const values = Array.from({ length: CARDS }, (_, i) => (i === STOP ? result : fillerValue()));
    strip = { roundId, values, jitter: (Math.random() - 0.5) * CARD_W * 0.7 };
    cardsEl.innerHTML = values.map((v, i) => `<div class="sl2-card ${tier(v)}" data-i="${i}">${fmt.multiplier(v)}</div>`).join('');
  }

  function idleStrip() {
    if (strip) return;
    const values = Array.from({ length: CARDS }, fillerValue);
    strip = { roundId: null, values, jitter: 0 };
    cardsEl.innerHTML = values.map((v, i) => `<div class="sl2-card ${tier(v)}" data-i="${i}">${fmt.multiplier(v)}</div>`).join('');
  }

  // Offset (px) that centres card `pos` (fractional) under the pointer.
  const offsetFor = (pos) => track.clientWidth / 2 - (pos * (CARD_W + GAP) + CARD_W / 2);

  function placeStrip(p) {
    const start = 6;
    const pos = start + (STOP - start) * easeOut(p);
    const extra = strip?.jitter ? strip.jitter * easeOut(p) : 0;
    cardsEl.style.transform = `translateX(${(offsetFor(pos) - extra).toFixed(1)}px)`;
  }

  // ---- rendering ----
  function renderHistory() {
    histEl.innerHTML = client.s.history
      .slice(0, 14)
      .reverse()
      .map((h) => `<button class="chip sl2-h ${tier(h.result.point)}" data-hash="${esc(h.hash)}" data-tip="Round ${esc(h.id)} · verify">${fmt.multiplier(h.result.point)}</button>`)
      .join('');
  }

  function renderPlayers() {
    players.render(client.s.bets, { phase: client.s.round?.phase, isMine: client.isMine, onCancel: (id) => cancel(id) });
  }

  function renderButton() {
    if (panel.mode !== 'manual') return;
    const phase = client.s.round?.phase;
    const label = !phase || phase === 'betting' ? 'Bet' : 'Bet (Next Round)';
    panel.setButton(label, { disabled: busy });
  }

  function onState() {
    const r = client.s.round;
    if (!r) return;
    if (r.phase !== 'betting' && r.result && strip?.roundId !== r.id) buildStrip(r.id, r.result.point);
    if (r.phase === 'betting') {
      idleStrip();
      track.classList.remove('done');
      cardsEl.querySelectorAll('.sl2-card.hit').forEach((c) => c.classList.remove('hit'));
    }
    if (r.phase === 'result' && shownRound !== r.id) {
      shownRound = r.id;
      track.classList.add('done');
      cardsEl.querySelector(`.sl2-card[data-i="${STOP}"]`)?.classList.add('hit');
      const mine = client.myBets();
      const won = mine.filter((b) => b.payout > 0);
      if (mine.length) {
        const paid = won.reduce((a, b) => a + b.payout, 0);
        if (won.length) {
          sound.win();
          setCaption(`${fmt.multiplier(r.result.point)} — you won!`, `${won.length} of ${mine.length} bet${mine.length > 1 ? 's' : ''} hit · ${esc(fmt.money(paid, won[0].currency))}`, 'win');
        } else {
          sound.lose();
          setCaption(fmt.multiplier(r.result.point), mine.length > 1 ? `None of your ${mine.length} targets were reached` : 'Your target was not reached', 'lose');
        }
      } else setCaption(fmt.multiplier(r.result.point), `Round ${esc(r.id)}`);
    }
    if (r.phase === 'betting') {
      const mine = client.myBets().length;
      setCaption(mine ? `${mine} bet${mine > 1 ? 's' : ''} in this round` : 'Place your bets', mine ? 'Add more targets, or wait for the slide' : `Pick a target — up to 10 bets per round`);
    } else if (r.phase === 'playing') setCaption('Sliding…', client.s.queued.length ? `${client.s.queued.length} bet${client.s.queued.length > 1 ? 's' : ''} queued for the next round` : '');
    renderHistory();
    renderPlayers();
    renderButton();
  }

  function frame() {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const r = client.s.round;
    if (!r) return;
    const { left, p } = phaseProgress(client);
    if (r.phase === 'betting') {
      overlay.hidden = false;
      countEl.textContent = `Rolling in ${(left / 1000).toFixed(1)}s`;
      barEl.style.transform = `scaleX(${1 - p})`;
      placeStrip(0);
    } else {
      overlay.hidden = true;
      placeStrip(r.phase === 'playing' ? (ctx.animations() ? p : 1) : 1);
    }
  }

  // ---- actions ----
  async function place(v) {
    const t = clampTarget(Number(v.target) || 2);
    if (!panel.checkBalance(v.amount)) return null;
    const res = await client.place({ amount: v.amount, target: t });
    sound.bet();
    renderPlayers();
    return res;
  }

  async function manualBet(v) {
    if (busy || !ctx.requireAuth()) return;
    busy = true;
    renderButton();
    try {
      const res = await place(v);
      if (res?.queued) ctx.toast({ title: 'Bet queued', message: 'Your bet joins the next round.' });
    } finally {
      busy = false;
      renderButton();
    }
  }

  async function cancel(id) {
    try {
      await client.cancel(id);
      sound.click();
      renderPlayers();
    } catch (err) {
      ctx.toastError(err);
    }
  }

  async function autoRound(v) {
    if (!ctx.requireAuth()) return null;
    const res = await place(v);
    if (!res || destroyed) return null;
    const bet = await client.settled(res.bet.id);
    if (!bet || destroyed) return null;
    return { win: bet.payout > bet.amount, profit: bet.payout - bet.amount };
  }

  on(stage, 'click', '[data-q]', (e, b) => {
    if (panel.autoRunning) return;
    panel.set('target', Number(b.dataset.q));
    syncTarget();
  });
  on(histEl, 'click', '[data-hash]', async (e, b) => {
    const { openFairnessModal } = await import('../ui/fairness.js');
    openFairnessModal({ tab: 'crash', prefill: { game: 'slide', hash: b.dataset.hash } });
  });
  panel.onChange((key) => {
    if (key === 'target') syncTarget();
    if (key === 'mode' || key === 'autoStopped') renderButton();
  });
  ctx.on('resize', () => placeStrip(1));

  syncTarget();
  idleStrip();
  client.fetchState();
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
    },
  };
}
