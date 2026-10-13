import { el } from '../dom.js';
import { amountField } from '../ui/controls.js';
import { timers } from '../ui/stepgame.js';
import { GEMS, PAYTABLE } from '../shared/games/diamonds.js';

const COLOR = { green: '#2fd36b', purple: '#a66bff', yellow: '#ffcf33', red: '#ff4d5e', cyan: '#2bd4ee', pink: '#ff74d4', blue: '#4f7dff' };
const GREY = '#3a4f61';

export function gem(color, size = 56, cls = '') {
  return `<svg class="dm-gem ${cls}" width="${size}" height="${Math.round(size * 0.875)}" viewBox="0 0 64 56" aria-hidden="true">
    <path d="M14 2h36l12 16-30 36L2 18z" fill="${color}"/>
    <path d="M14 2h36l12 16H2z" fill="#fff" opacity=".32"/>
    <path d="M2 18h60L32 54z" fill="#000" opacity=".14"/>
    <path d="M14 2l8 16 10-16 10 16 8-16M22 18l10 36 10-36" stroke="#fff" stroke-opacity=".45" fill="none" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M18 7l-5 8" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>
  </svg>`;
}

// Five mini gems illustrating a paytable row: groups in colour, singles grey.
const PATTERN_COLORS = ['purple', 'green', 'yellow'];
function patternGems(row, size = 16) {
  const out = [];
  row.pattern.forEach((n, g) => {
    for (let i = 0; i < n; i++) out.push(n > 1 ? COLOR[PATTERN_COLORS[g]] : GREY);
  });
  return out.map((c) => gem(c, size)).join('');
}

export function renderPreview(result) {
  const matched = new Set(result.matched || []);
  const row = PAYTABLE.find((r) => r.key === result.hand);
  return `<div style="text-align:center"><div style="display:flex;gap:6px;justify-content:center">${(result.gems || [])
    .map((g) => `<span style="opacity:${matched.has(g) ? 1 : 0.45}">${gem(COLOR[g], 40)}</span>`)
    .join('')}</div><div class="muted" style="margin-top:6px">${row ? row.name : ''}</div></div>`;
}

export default function mountDiamonds(ctx) {
  const { api, fmt, sound } = ctx;
  let busy = false;
  let destroyed = false;
  const t = timers();

  const panel = ctx.createBetPanel({
    fields: [amountField(), { key: 'profit', type: 'profit', label: 'Profit on Win' }],
    onBet: () => play(false),
    auto: { run: () => play(true) },
  });
  panel.setProfit(PAYTABLE[0].pays);
  panel.setLabel('profit', `Profit on Win (${fmt.multiplier(PAYTABLE[0].pays)} max)`);

  const stage = el(`<div class="dm-stage">
    <div class="stage-center"><div class="dm-board">
      <div class="dm-slots">${Array.from({ length: 5 }, (_, i) => `<div class="dm-slot" data-i="${i}"><div class="dm-gem-wrap"></div><div class="dm-pedestal"></div></div>`).join('')}</div>
      <div class="dm-result" aria-live="polite"></div>
    </div></div>
    <div class="stage-bottom"><div class="dm-paytable">${PAYTABLE.filter((r) => r.pays > 0)
      .map((r) => `<div class="dm-pay" data-key="${r.key}" data-tip="${r.name} · ${((r.ways / 7 ** 5) * 100).toFixed(2)}%"><div class="dm-pattern">${patternGems(r)}</div><div class="dm-pays">${fmt.multiplier(r.pays)}</div></div>`)
      .join('')}</div></div>
  </div>`);
  ctx.stage.appendChild(stage);
  const history = ctx.historyStrip(stage, { max: 8 });
  stage.prepend(history.el);
  const slots = [...stage.querySelectorAll('.dm-slot')];
  const resultEl = stage.querySelector('.dm-result');
  const pays = stage.querySelector('.dm-paytable');

  function clear() {
    slots.forEach((s) => {
      s.className = 'dm-slot';
      s.querySelector('.dm-gem-wrap').innerHTML = '';
    });
    pays.querySelectorAll('.dm-pay').forEach((p) => p.classList.remove('hit'));
    resultEl.className = 'dm-result';
    resultEl.textContent = '';
  }

  async function show(result, fast) {
    clear();
    const anim = ctx.animations();
    for (let i = 0; i < 5; i++) {
      const slot = slots[i];
      slot.querySelector('.dm-gem-wrap').innerHTML = gem(COLOR[result.gems[i]], 64);
      slot.classList.add('filled');
      if (anim) slot.classList.add('drop');
      slot.style.setProperty('--glow', COLOR[result.gems[i]]);
      sound.tick();
      if (anim) await t.wait(fast ? 60 : 130);
      if (destroyed) return;
    }
    const matched = new Set(result.matched);
    slots.forEach((s, i) => s.classList.add(matched.has(result.gems[i]) ? 'match' : 'dim'));
    pays.querySelector(`.dm-pay[data-key="${result.hand}"]`)?.classList.add('hit');
    const row = PAYTABLE.find((r) => r.key === result.hand);
    resultEl.textContent = row.pays ? `${row.name} · ${fmt.multiplier(row.pays)}` : row.name;
    resultEl.classList.add(row.pays >= 1 ? 'win' : 'show');
  }

  async function play(isAuto) {
    if (busy || !ctx.requireAuth()) return null;
    busy = true;
    if (!isAuto) panel.setBusy(true);
    try {
      const v = panel.values();
      const res = await api.post('/api/games/diamonds/bet', { amount: v.amount, currency: ctx.currency(), params: {} });
      if (destroyed) return null;
      ctx.debitView(res);
      sound.bet();
      await show(res.bet.result, isAuto);
      if (destroyed) return null;
      const bet = res.bet;
      const win = bet.payout > bet.amount;
      if (win) {
        bet.multiplier >= 5 ? sound.bigWin() : sound.win();
      } else if (!bet.payout) sound.lose();
      history.push({ label: fmt.multiplier(bet.multiplier), win, betId: bet.id });
      ctx.settle(res);
      return { win, profit: bet.payout - bet.amount };
    } finally {
      busy = false;
      if (!isAuto) panel.setBusy(false);
    }
  }

  // Idle board: five random gems, dimmed.
  slots.forEach((s) => {
    s.querySelector('.dm-gem-wrap').innerHTML = gem(COLOR[GEMS[Math.floor(Math.random() * GEMS.length)]], 64);
    s.classList.add('filled', 'idle');
  });

  return {
    destroy() {
      destroyed = true;
      t.clear();
    },
  };
}
