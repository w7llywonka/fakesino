import { el } from '../dom.js';
import { playingCard } from '../icons.js';
import { amountField } from '../ui/controls.js';
import { timers, chanceLabel } from '../ui/stepgame.js';
import { MIN_TARGET, MAX_TARGET, chanceFor, multiplierFor } from '../shared/games/blitz.js';

export function renderPreview(result, params) {
  const cards = (result.cards || []).map((c, i) => {
    const bad = result.repeat != null && (i === result.repeat || (c.index === result.cards[result.repeat].index && i < result.repeat));
    return `<span style="display:inline-grid;place-items:center;width:30px;height:40px;border-radius:5px;background:${bad ? 'var(--red)' : '#fff'};color:${bad ? '#fff' : ['hearts', 'diamonds'].includes(c.suit) ? '#e0283c' : '#1c2633'};font-weight:800;font-size:12px">${c.rank}${{ hearts: '♥', diamonds: '♦', spades: '♠', clubs: '♣' }[c.suit]}</span>`;
  });
  return `<div style="text-align:center"><div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:center;max-width:380px">${cards.join('')}</div>
    <div class="muted" style="margin-top:6px">${result.win ? `All ${params.target} cards unique` : `Repeat on card ${result.repeat + 1} of ${params.target}`}</div></div>`;
}

export default function mountBlitz(ctx) {
  const { api, fmt, sound } = ctx;
  let busy = false;
  let destroyed = false;
  let target = 10;
  const t = timers();

  const panel = ctx.createBetPanel({
    fields: [amountField(), { key: 'profit', type: 'profit', label: 'Profit on Win' }],
    onBet: () => play(false),
    auto: { run: () => play(true) },
    hotkeys: { w: () => !busy && !panel.autoRunning && setTarget(target - 1), e: () => !busy && !panel.autoRunning && setTarget(target + 1) },
  });

  const stage = el(`<div class="bz-stage">
    <div class="stage-center"><div class="bz-table">
      <div class="bz-grid"></div>
      <div class="stage-caption bz-caption" aria-live="polite"><div class="main">Deal ${target} unique cards</div><div class="sub">Any repeated card ends the run</div></div>
    </div></div>
    <div class="stage-bottom">
      <div class="bz-slider"><span>${MIN_TARGET}</span><input type="range" min="${MIN_TARGET}" max="${MAX_TARGET}" step="1" value="${target}" aria-label="Cards to deal"><span>${MAX_TARGET}</span></div>
      <div class="stat-tiles">
        <div class="bp-field"><div class="bp-label">Cards</div><div class="input-suffix"><input class="input" data-k="target" inputmode="numeric" autocomplete="off" aria-label="Cards to deal"></div></div>
        <div class="bp-field bp-readonly"><div class="bp-label">Multiplier</div><div class="input-suffix"><input class="input" data-k="mult" readonly tabindex="-1"><span class="suffix">×</span></div></div>
        <div class="bp-field bp-readonly"><div class="bp-label">Win Chance</div><div class="input-suffix"><input class="input" data-k="chance" readonly tabindex="-1"><span class="suffix">%</span></div></div>
      </div>
    </div>
  </div>`);
  ctx.stage.appendChild(stage);
  const history = ctx.historyStrip(stage, { max: 8 });
  stage.prepend(history.el);
  const grid = stage.querySelector('.bz-grid');
  const caption = stage.querySelector('.bz-caption');
  const slider = stage.querySelector('input[type=range]');
  const targetIn = stage.querySelector('[data-k=target]');
  const multIn = stage.querySelector('[data-k=mult]');
  const chanceIn = stage.querySelector('[data-k=chance]');

  function setCaption(main, sub, cls = '') {
    caption.className = `stage-caption bz-caption ${cls}`;
    caption.querySelector('.main').textContent = main;
    caption.querySelector('.sub').textContent = sub;
  }

  function emptyGrid() {
    grid.dataset.n = target;
    grid.innerHTML = Array.from({ length: target }, (_, i) => `<div class="bz-slot" data-i="${i}"><span>${i + 1}</span></div>`).join('');
  }

  function render(keep) {
    const m = multiplierFor(target);
    if (keep !== 'target') targetIn.value = target;
    slider.value = target;
    slider.style.setProperty('--p', `${((target - MIN_TARGET) / (MAX_TARGET - MIN_TARGET)) * 100}%`);
    multIn.value = m.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    chanceIn.value = chanceLabel(chanceFor(target)).replace('%', '');
    panel.setProfit(m);
    if (!busy) {
      emptyGrid();
      setCaption(`Deal ${target} unique cards`, 'Any repeated card ends the run');
    }
  }

  function setTarget(n, keep) {
    if (!Number.isFinite(n)) return;
    target = Math.min(MAX_TARGET, Math.max(MIN_TARGET, Math.round(n)));
    render(keep);
  }

  slider.addEventListener('input', () => setTarget(Number(slider.value)));
  targetIn.addEventListener('input', () => {
    const n = Number(targetIn.value);
    if (n >= MIN_TARGET && n <= MAX_TARGET) setTarget(n, 'target');
  });
  targetIn.addEventListener('blur', () => setTarget(Number(targetIn.value) || target));
  targetIn.addEventListener('keydown', (e) => e.key === 'Enter' && targetIn.blur());

  function setInputsDisabled(d) {
    slider.disabled = d;
    targetIn.disabled = d;
  }

  async function deal(result, n, fast) {
    emptyGrid();
    grid.dataset.n = n;
    const slots = [...grid.children];
    const anim = ctx.animations();
    const step = fast ? Math.max(18, 140 / n) : Math.max(40, 900 / n);
    for (let i = 0; i < result.cards.length; i++) {
      const c = result.cards[i];
      slots[i].innerHTML = playingCard(c, anim ? 'bz-deal' : '');
      sound.card();
      if (result.repeat === i) {
        const first = result.cards.findIndex((x) => x.index === c.index);
        slots[i].classList.add('repeat');
        slots[first].classList.add('repeat');
        break;
      }
      if (anim) await t.wait(step);
      if (destroyed) return;
    }
    if (result.repeat != null) slots.slice(result.repeat + 1).forEach((s) => s.classList.add('unused'));
  }

  async function play(isAuto) {
    if (busy || !ctx.requireAuth()) return null;
    busy = true;
    setInputsDisabled(true);
    if (!isAuto) panel.setBusy(true);
    try {
      const v = panel.values();
      const n = target;
      const res = await api.post('/api/games/blitz/bet', { amount: v.amount, currency: ctx.currency(), params: { target: n } });
      if (destroyed) return null;
      ctx.debitView(res);
      sound.bet();
      setCaption('Dealing…', `${n} cards · ${fmt.multiplier(multiplierFor(n))}`);
      const result = res.bet.result;
      await deal(result, n, isAuto);
      if (destroyed) return null;
      const bet = res.bet;
      const win = bet.payout > bet.amount;
      if (result.win) {
        setCaption(`${n} unique cards!`, `Won ${fmt.multiplier(bet.multiplier)}`, 'win');
        n >= 15 ? sound.bigWin() : sound.win();
        grid.classList.add('won');
        if (ctx.animations()) setTimeout(() => grid.classList.remove('won'), 700);
      } else {
        const c = result.cards[result.repeat];
        setCaption(`Repeat: ${c.rank} of ${c.suit}`, `Card ${result.repeat + 1} of ${n} matched an earlier card`, 'lose');
        sound.lose();
      }
      history.push({ label: fmt.multiplier(bet.multiplier), win, betId: bet.id });
      ctx.settle(res);
      if (isAuto && ctx.animations()) await t.wait(result.win ? 400 : 250);
      return { win, profit: bet.payout - bet.amount };
    } finally {
      busy = false;
      if (!isAuto) {
        panel.setBusy(false);
        setInputsDisabled(false);
      }
    }
  }

  panel.onChange((key) => {
    if (key === 'autoStopped') setInputsDisabled(false);
  });

  render();
  return {
    destroy() {
      destroyed = true;
      t.clear();
    },
  };
}
