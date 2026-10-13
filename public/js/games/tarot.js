import { el } from '../dom.js';
import { amountField } from '../ui/controls.js';
import { timers } from '../ui/stepgame.js';
import { TABLES, DIFFICULTIES } from '../shared/games/tarot.js';

const DIFF_OPTIONS = DIFFICULTIES.map((d) => [d, d[0].toUpperCase() + d.slice(1)]);

// Simple line glyphs (24×24) for card faces, from humble to grand.
const GLYPHS = [
  '<path d="M6 6l12 12M18 6L6 18"/>', // void
  '<circle cx="12" cy="12" r="3"/>', // seed
  '<path d="M12 4v16M8 8l4-4 4 4"/>', // wand
  '<path d="M7 5h10l-1 6a4 4 0 0 1-8 0zM12 15v4M9 19h6"/>', // cup
  '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.3 6L12 16.4 6.6 19.4l1.3-6L3.4 9.3l6-.7z"/>', // star
  '<path d="M16 4a8 8 0 1 0 4 12 6.5 6.5 0 1 1-4-12z"/>', // moon
  '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>', // sun
];
const MAJOR_NAMES = ['The Fool', 'The Magician', 'The Star', 'The Moon', 'The Sun', 'The World'];
const MINOR_NAMES = ['Ruin', 'Ace', 'Page', 'Knight', 'Queen', 'King'];

function rowIndex(rows, m) {
  return Math.max(0, rows.findIndex(([x]) => x === m));
}

function face(kind, m, rows) {
  const i = rowIndex(rows, m);
  const glyph = kind === 'major' ? GLYPHS[Math.min(GLYPHS.length - 1, i + 1 + (i >= 2 ? 1 : 0))] : GLYPHS[Math.min(GLYPHS.length - 1, i)];
  const name = kind === 'major' ? MAJOR_NAMES[i] : MINOR_NAMES[i];
  return `<div class="tr-face ${kind} ${m === 0 ? 'zero' : ''}" style="--tier:${i}">
    <div class="tr-kind">${kind === 'major' ? 'Major Arcana' : 'Minor Arcana'}</div>
    <svg class="tr-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg>
    <div class="tr-name">${name}</div>
    <div class="tr-mult">${m}×</div>
  </div>`;
}

export function renderPreview(result, params) {
  const chip = (m, kind) => `<span style="display:inline-grid;place-items:center;min-width:52px;height:64px;border-radius:8px;background:${kind === 'major' ? '#ffd43b' : '#d0bfff'};color:#1b1340;font-weight:900">${m == null ? '—' : `${m}×`}</span>`;
  const c = result.cards || {};
  return `<div style="text-align:center"><div style="display:flex;gap:8px;justify-content:center">${chip(c.left, 'minor')}${chip(c.middle, 'major')}${chip(c.right, 'minor')}</div>
    <div class="muted" style="margin-top:6px">${c.left ?? '—'} × ${c.middle} × ${c.right ?? '—'} = ${result.multiplier}×${params.difficulty ? ` · ${params.difficulty}` : ''}</div></div>`;
}

export default function mountTarot(ctx) {
  const { api, fmt, sound } = ctx;
  let busy = false;
  let destroyed = false;
  let difficulty = 'medium';
  const t = timers();

  const panel = ctx.createBetPanel({
    fields: [amountField(), { key: 'difficulty', type: 'select', label: 'Difficulty', options: DIFF_OPTIONS, value: difficulty }, { key: 'profit', type: 'profit', label: 'Max Profit' }],
    onBet: () => play(false),
    auto: { run: () => play(true) },
  });

  const slot = (pos) => `<div class="tr-card" data-pos="${pos}"><div class="tr-inner"><div class="tr-back"><div class="tr-back-art"></div></div><div class="tr-front"></div></div></div>`;
  const stage = el(`<div class="tr-stage">
    <div class="stage-center"><div class="tr-table">
      <div class="tr-cards">${slot('left')}${slot('middle')}${slot('right')}</div>
      <div class="tr-sum" aria-live="polite"><span data-k="left">?</span> × <span data-k="middle">?</span> × <span data-k="right">?</span> = <b data-k="total">?</b></div>
    </div></div>
    <div class="stage-bottom"><div class="tr-tables"></div></div>
  </div>`);
  ctx.stage.appendChild(stage);
  const history = ctx.historyStrip(stage, { max: 8 });
  stage.prepend(history.el);
  const cards = Object.fromEntries([...stage.querySelectorAll('.tr-card')].map((c) => [c.dataset.pos, c]));
  const sum = stage.querySelector('.tr-sum');
  const tablesEl = stage.querySelector('.tr-tables');

  function build() {
    const tb = TABLES[difficulty];
    const row = (label, rows, kind) => `<div class="tr-row"><div class="tr-row-label">${label}</div><div class="tr-chips">${rows
      .map(([m, p]) => `<span class="tr-chip ${kind}" data-tip="${p}% chance">${m}×<small>${p}%</small></span>`)
      .join('')}</div></div>`;
    tablesEl.innerHTML = row('Major (middle)', tb.major, 'major') + row('Minor (left & right)', tb.minor, 'minor');
    const max = Math.max(...tb.minor.map(([m]) => m)) ** 2 * Math.max(...tb.major.map(([m]) => m));
    panel.setProfit(max);
    panel.setLabel('profit', `Max Profit (${fmt.multiplier(max)})`);
  }

  function resetCards() {
    for (const c of Object.values(cards)) c.className = 'tr-card';
    sum.className = 'tr-sum';
    sum.querySelectorAll('[data-k]').forEach((s) => (s.textContent = '?'));
  }

  async function flip(pos, m, kind, rows, fast) {
    const card = cards[pos];
    card.querySelector('.tr-front').innerHTML = m == null ? '' : face(kind, m, rows);
    if (m == null) {
      card.classList.add('skipped');
      sum.querySelector(`[data-k=${pos}]`).textContent = '—';
      return;
    }
    card.classList.add('flipped');
    if (m === 0) card.classList.add('zero');
    else if (m >= (kind === 'major' ? 3 : 2)) card.classList.add('good');
    sound.card();
    sum.querySelector(`[data-k=${pos}]`).textContent = `${m}×`;
    if (ctx.animations()) await t.wait(fast ? 180 : 460);
  }

  async function reveal(result, fast) {
    resetCards();
    if (ctx.animations()) await t.wait(fast ? 40 : 120);
    const tb = TABLES[difficulty];
    await flip('middle', result.cards.middle, 'major', tb.major, fast);
    if (destroyed) return;
    await flip('left', result.cards.left, 'minor', tb.minor, fast);
    if (destroyed) return;
    await flip('right', result.cards.right, 'minor', tb.minor, fast);
    sum.querySelector('[data-k=total]').textContent = fmt.multiplier(result.multiplier);
    sum.classList.add(result.multiplier >= 1 ? 'win' : 'lose');
  }

  async function play(isAuto) {
    if (busy || !ctx.requireAuth()) return null;
    busy = true;
    if (!isAuto) panel.setBusy(true);
    try {
      const v = panel.values();
      const res = await api.post('/api/games/tarot/bet', { amount: v.amount, currency: ctx.currency(), params: { difficulty } });
      if (destroyed) return null;
      ctx.debitView(res);
      sound.bet();
      await reveal(res.bet.result, isAuto);
      if (destroyed) return null;
      const bet = res.bet;
      const win = bet.payout > bet.amount;
      if (win) bet.multiplier >= 10 ? sound.bigWin() : sound.win();
      else sound.lose();
      history.push({ label: fmt.multiplier(bet.multiplier), win, betId: bet.id });
      ctx.settle(res);
      return { win, profit: bet.payout - bet.amount };
    } finally {
      busy = false;
      if (!isAuto) panel.setBusy(false);
    }
  }

  panel.onChange((key, value) => {
    if (key === 'difficulty' && value !== difficulty) {
      difficulty = value;
      build();
      resetCards();
    }
  });

  build();
  return {
    destroy() {
      destroyed = true;
      t.clear();
    },
  };
}
