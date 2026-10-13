import { el, esc, on, sleep } from '../dom.js';
import { amountField } from '../ui/controls.js';
import { TABLES, NUMBERS, DRAWN } from '../shared/games/keno.js';
import { combinations } from '../shared/games/util.js';

const MAX_PICKS = 10;
const RISK_OPTIONS = [
  ['classic', 'Classic'],
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
];

const GEM = `<svg class="kt-gem" viewBox="0 0 40 36" aria-hidden="true"><path d="M10 2h20l8 10-18 22L2 12z" fill="currentColor" opacity=".9"/><path d="M2 12h36L20 34z" fill="currentColor" opacity=".55"/><path d="M10 2l4 10h12l4-10z" fill="#fff" opacity=".45"/><path d="M14 12l6 22 6-22z" fill="#fff" opacity=".18"/></svg>`;

const multText = (m) => (m >= 100 ? `${m}×` : `${m.toFixed(2)}×`);
const shortText = (m) => `${Number(m.toFixed(2))}×`; // 17×, 1.4×, 0×

// Probability of exactly k hits with n picks when 10 of 40 are drawn.
function hitChance(n, k) {
  return (combinations(n, k) * combinations(NUMBERS - n, DRAWN - k)) / combinations(NUMBERS, DRAWN);
}

const tiny = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 2 });
const chanceText = (pct) => (pct >= 0.01 ? `${pct.toFixed(2)}%` : `${tiny.format(pct)}%`);

export default function mountKeno(ctx) {
  const { api, sound } = ctx;
  let risk = 'classic';
  const picks = new Set();
  let busy = false;
  let alive = true;
  let marked = false; // a finished draw is still shown on the board

  const panel = ctx.createBetPanel({
    fields: [
      amountField(),
      { key: 'risk', type: 'select', label: 'Risk', options: RISK_OPTIONS, value: risk },
      {
        key: 'tools',
        type: 'custom',
        render(box) {
          box.innerHTML = `<div class="keno-tools">
            <button class="btn btn-secondary btn-block" data-act="autopick">Auto Pick</button>
            <button class="btn btn-secondary btn-block" data-act="clear">Clear Table</button></div>`;
          on(box, 'click', '[data-act]', (e, b) => {
            if (b.disabled) return;
            if (b.dataset.act === 'autopick') autoPick();
            else clearTable();
          });
        },
      },
    ],
    onBet: () => play(false),
    auto: { run: () => play(true) },
    hotkeys: { q: () => !busy && !panel.autoRunning && autoPick(), w: () => !busy && !panel.autoRunning && clearTable() },
  });

  const tiles = Array.from({ length: NUMBERS }, (_, i) => i + 1)
    .map((n) => `<button class="keno-tile" data-n="${n}" aria-pressed="false">${GEM}<span class="kt-num">${n}</span></button>`)
    .join('');
  const stage = el(`<div class="keno-stage">
    <div class="keno-board">
      <div class="keno-grid" role="group" aria-label="Keno numbers">${tiles}</div>
      <div class="keno-pay"></div>
    </div>
  </div>`);
  ctx.stage.appendChild(stage);
  const board = stage.querySelector('.keno-board');
  const grid = stage.querySelector('.keno-grid');
  const pay = stage.querySelector('.keno-pay');
  const tileEls = [null, ...grid.querySelectorAll('.keno-tile')];

  // ---- picks ----
  function renderPicks() {
    for (let n = 1; n <= NUMBERS; n++) {
      const on_ = picks.has(n);
      tileEls[n].classList.toggle('picked', on_);
      tileEls[n].setAttribute('aria-pressed', String(on_));
    }
    grid.classList.toggle('full', picks.size >= MAX_PICKS);
    renderPay();
  }

  function clearMarks() {
    if (!marked) return;
    marked = false;
    for (let n = 1; n <= NUMBERS; n++) tileEls[n].classList.remove('hit', 'miss', 'pop');
    pay.querySelectorAll('.active').forEach((x) => x.classList.remove('active', 'won'));
    board.querySelector('.result-pop')?.remove();
  }

  const locked = () => busy || panel.autoRunning;

  function toggle(n) {
    if (locked()) return;
    clearMarks();
    if (picks.has(n)) picks.delete(n);
    else if (picks.size < MAX_PICKS) {
      picks.add(n);
      tileEls[n].classList.remove('pop');
      void tileEls[n].offsetWidth;
      tileEls[n].classList.add('pop');
    } else {
      grid.classList.remove('shake');
      void grid.offsetWidth;
      grid.classList.add('shake');
      return;
    }
    sound.click();
    renderPicks();
  }

  function autoPick() {
    if (locked()) return;
    clearMarks();
    picks.clear();
    const pool = Array.from({ length: NUMBERS }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    pool.slice(0, MAX_PICKS).forEach((n, i) => {
      picks.add(n);
      const t = tileEls[n];
      t.classList.remove('pop');
      void t.offsetWidth;
      t.style.animationDelay = `${i * 25}ms`;
      t.classList.add('pop');
    });
    sound.click();
    renderPicks();
  }

  function clearTable() {
    if (locked()) return;
    clearMarks();
    picks.clear();
    renderPicks();
  }

  on(grid, 'click', '.keno-tile', (e, t) => toggle(Number(t.dataset.n)));
  grid.addEventListener('animationend', (e) => {
    if (e.target === grid) grid.classList.remove('shake');
    else if (e.target.classList?.contains('keno-tile')) e.target.style.animationDelay = '';
  });

  // ---- payout table ----
  function renderPay() {
    const n = picks.size;
    if (!n) {
      pay.innerHTML = '<div class="keno-pay-msg">Select 1–10 numbers to play</div>';
      return;
    }
    const row = TABLES[risk][n];
    pay.innerHTML = `<div class="keno-pay-row kp-mults ${n >= 8 ? 'dense' : ''}" style="--cols:${n + 1}">${row
      .map((m, k) => `<div class="kp-m" data-k="${k}"><span class="kp-long">${esc(multText(m))}</span><span class="kp-short">${esc(shortText(m))}</span></div>`)
      .join('')}</div>
      <div class="keno-pay-row kp-hits ${n >= 8 ? 'dense' : ''}" style="--cols:${n + 1}">${row
        .map((m, k) => `<div class="kp-h" data-k="${k}" data-tip="${esc(`${multText(m)} · ${chanceText(hitChance(n, k) * 100)} chance`)}"><b>${k}</b><span class="kp-word">${k === 1 ? 'hit' : 'hits'}</span>${GEM}</div>`)
        .join('')}</div>`;
  }

  panel.onChange((key, value) => {
    if (key === 'risk') {
      risk = value;
      clearMarks();
      renderPay();
    }
  });

  // ---- betting ----
  async function play(isAuto) {
    if (busy) return null;
    if (!ctx.requireAuth()) return null;
    if (!picks.size) {
      ctx.toast({ type: 'error', title: 'No numbers picked', message: 'Select 1–10 numbers to play.' });
      return null;
    }
    busy = true;
    if (!isAuto) panel.setBusy(true);
    grid.classList.add('drawing');
    clearMarks();
    try {
      const v = panel.values();
      const res = await api.post('/api/games/keno/bet', {
        amount: v.amount,
        currency: ctx.currency(),
        params: { risk, picks: [...picks].sort((a, b) => a - b) },
      });
      ctx.debitView(res);
      sound.bet();
      marked = true;
      const { drawn, hits, multiplier } = res.bet.result;
      const hitSet = new Set(hits);
      const gap = ctx.animations() ? (isAuto ? 45 : 90) : 0;
      for (const n of drawn) {
        const t = tileEls[n];
        if (!t) continue;
        t.classList.remove('pop');
        void t.offsetWidth;
        t.classList.add(hitSet.has(n) ? 'hit' : 'miss', 'pop');
        if (gap && alive) {
          hitSet.has(n) ? sound.reveal() : sound.tick();
          await sleep(gap);
        }
      }
      const k = hits.length;
      pay.querySelectorAll(`[data-k="${k}"]`).forEach((x) => x.classList.add('active', ...(multiplier > 0 ? ['won'] : [])));
      if (multiplier >= 1 && res.bet.payout > 0) {
        multiplier >= 10 ? sound.bigWin() : sound.win();
        ctx.resultPop(board, { multiplier, payout: res.bet.payout, currency: res.bet.currency, duration: isAuto ? 900 : 1800 });
      } else if (multiplier === 0) sound.lose();
      ctx.settle(res);
      return { win: res.bet.payout > res.bet.amount, profit: res.bet.payout - res.bet.amount };
    } finally {
      busy = false;
      grid.classList.remove('drawing');
      if (!isAuto) panel.setBusy(false);
    }
  }

  renderPicks();
  function destroy() {
    alive = false;
  }
  ctx.onDestroy(destroy);
  return { destroy };
}
