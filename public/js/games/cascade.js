import { el, esc, on } from '../dom.js';
import { coin } from '../icons.js';
import { amountField } from '../ui/controls.js';
import { COLS, ROWS, PAYS, STAR_PAYS, FREE_SPINS, RETRIGGER, NAMES, PAYING, MAX_WIN, ORBS } from '../shared/games/cascade.js';

// Our own symbol art (40×40).
const ART = {
  ringed: '<circle cx="20" cy="20" r="10" fill="#ff922b"/><path d="M12 17c4 2 12 3 16 1" stroke="#e8590c" stroke-width="2" fill="none"/><ellipse cx="20" cy="21" rx="18" ry="5" fill="none" stroke="#ffe066" stroke-width="3" transform="rotate(-16 20 21)"/><path d="M10 15a10 10 0 0 1 20 0" fill="#ffa94d" opacity=".6"/>',
  comet: '<path d="M6 34L26 14" stroke="#74c0fc" stroke-width="7" stroke-linecap="round" opacity=".35"/><path d="M10 31L27 14" stroke="#a5d8ff" stroke-width="4" stroke-linecap="round" opacity=".7"/><circle cx="28" cy="12" r="7" fill="#e7f5ff"/><circle cx="28" cy="12" r="4" fill="#fff"/>',
  ufo: '<ellipse cx="20" cy="17" rx="8" ry="7" fill="#63e6be" opacity=".85"/><ellipse cx="20" cy="23" rx="17" ry="6" fill="#adb5bd"/><ellipse cx="20" cy="21.5" rx="12" ry="3" fill="#dee2e6"/><circle cx="11" cy="24" r="1.6" fill="#ffd43b"/><circle cx="20" cy="26" r="1.6" fill="#ffd43b"/><circle cx="29" cy="24" r="1.6" fill="#ffd43b"/>',
  moon: '<circle cx="20" cy="20" r="14" fill="#e9ecef"/><circle cx="26" cy="15" r="12" fill="#1b1f3a" opacity=".92"/><circle cx="13" cy="22" r="2.4" fill="#ced4da"/><circle cx="17" cy="29" r="1.6" fill="#ced4da"/>',
  ruby: '<path d="M20 5l13 8v14l-13 8-13-8V13z" fill="#e03131"/><path d="M20 5l13 8-13 7-13-7z" fill="#ff6b6b"/><path d="M20 20v15" stroke="#c92a2a" stroke-width="1.5"/>',
  sapphire: '<circle cx="20" cy="20" r="14" fill="#1c7ed6"/><circle cx="20" cy="20" r="9" fill="#4dabf7"/><path d="M14 15a8 8 0 0 1 8-3" stroke="#d0ebff" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  emerald: '<rect x="8" y="8" width="24" height="24" rx="5" fill="#2f9e44"/><rect x="13" y="13" width="14" height="14" rx="3" fill="#69db7c"/><path d="M15 16h6" stroke="#ebfbee" stroke-width="2.2" stroke-linecap="round"/>',
  topaz: '<path d="M20 5l15 27H5z" fill="#f59f00"/><path d="M20 12l8 15H12z" fill="#ffd43b"/>',
  amethyst: '<path d="M20 4l14 16-14 16L6 20z" fill="#9c36b5"/><path d="M20 10l8 10-8 10-8-10z" fill="#da77f2"/>',
  star: '<path d="M20 3l4.9 10 11 1.6-8 7.8 1.9 11L20 28.2l-9.8 5.2 1.9-11-8-7.8 11-1.6z" fill="#ffd43b" stroke="#fff3bf" stroke-width="1.5"/><circle cx="20" cy="19" r="4" fill="#fff9db"/>',
  orb: '<circle cx="20" cy="20" r="15" fill="#e64980"/><circle cx="20" cy="20" r="15" fill="url(#ccOrb)"/><circle cx="15" cy="14" r="4" fill="#fff" opacity=".45"/>',
};
const DEFS = '<defs><radialGradient id="ccOrb" cx="35%" cy="30%"><stop offset="0" stop-color="#ffdeeb"/><stop offset="1" stop-color="#a61e4d" stop-opacity=".2"/></radialGradient></defs>';
const sym = (s, cls = 'cc-sym') => `<svg class="${cls}" viewBox="0 0 40 40" aria-label="${esc(NAMES[s] || s)}">${DEFS}${ART[s]}</svg>`;

export function renderPreview(result) {
  const s = result.spins?.[0];
  if (!s) return '';
  const grid = s.steps[s.steps.length - 1].grid;
  const cells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) cells.push(grid[c][r]);
  return `<div style="display:grid;grid-template-columns:repeat(6,34px);gap:3px;justify-content:center">${cells
    .map((x) => `<span style="position:relative;display:grid;place-items:center;background:#1d2b4a;border-radius:6px;height:34px">${sym(x.s, '')}${x.v ? `<b style="position:absolute;font-size:10px;color:#fff">${x.v}×</b>` : ''}</span>`)
    .join('')}</div><div class="muted" style="text-align:center;margin-top:8px">${result.freeSpins ? `${result.freeSpins} free spins · ` : ''}${result.spins.reduce((a, x) => a + x.steps.length - 1, 0)} tumble wins</div>`;
}

export default function mountCascade(ctx) {
  const { api, fmt, sound } = ctx;
  let busy = false;
  let destroyed = false;
  const timers = new Set();
  const wait = (ms) =>
    new Promise((resolve) => {
      if (!ms) return resolve();
      const t = setTimeout(() => {
        timers.delete(t);
        resolve();
      }, ms);
      timers.add(t);
    });
  const code = () => ctx.currency();
  const money = (v, c) => fmt.money(v, c);

  const panel = ctx.createBetPanel({
    betLabel: 'Spin',
    fields: [amountField()],
    onBet: () => play(false),
    auto: { run: () => play(true), delay: 200 },
  });

  const stage = el(`<div class="cc-stage">
    <div class="cc-top"><div class="cc-title">COSMIC <b>CASCADE</b></div><div class="cc-meter"><span class="dim">Win</span><b class="cc-win">0.00</b></div><button class="btn btn-secondary btn-sm cc-pt-btn" data-act="paytable">Paytable</button></div>
    <div class="cc-board"><div class="cc-grid"></div><div class="cc-overlay" hidden></div></div>
    <div class="cc-msg">Eight or more anywhere pay · tumbles keep going until no wins are left</div>
    <div class="cc-paytable" hidden></div>
  </div>`);
  ctx.stage.appendChild(stage);
  const gridEl = stage.querySelector('.cc-grid');
  const overlay = stage.querySelector('.cc-overlay');
  const msg = stage.querySelector('.cc-msg');
  const winEl = stage.querySelector('.cc-win');
  const ptEl = stage.querySelector('.cc-paytable');
  const msgIdle = msg.innerHTML;

  // Columns hold absolutely-positioned cells; --row sets their slot.
  const cols = Array.from({ length: COLS }, () => {
    const c = el('<div class="cc-col"></div>');
    gridEl.appendChild(c);
    return c;
  });
  const cellEl = (x, row) => {
    const n = el(`<div class="cc-cell ${x.s}" style="--row:${row}">${sym(x.s)}${x.v ? `<b class="cc-orb-v">${x.v}×</b>` : ''}</div>`);
    n.dataset.s = x.s;
    return n;
  };
  let colEls = cols.map(() => []); // per column, top→bottom elements

  function setGrid(grid, { drop = false } = {}) {
    colEls = grid.map((col, c) => {
      cols[c].innerHTML = '';
      return col.map((x, r) => {
        const n = cellEl(x, drop ? r - ROWS : r);
        cols[c].appendChild(n);
        return n;
      });
    });
    if (drop) {
      void gridEl.offsetWidth;
      colEls.forEach((list, c) => list.forEach((n, r) => {
        n.style.transitionDelay = `${c * 45 + (ROWS - r) * 18}ms`;
        n.style.setProperty('--row', r);
      }));
    }
  }

  async function tumble(fromStep, toStep, fast) {
    const gone = new Set(fromStep.wins.map((w) => w.symbol));
    // 1) highlight and pop the winners
    colEls.forEach((list) => list.forEach((n) => n.classList.toggle('win', gone.has(n.dataset.s))));
    await wait(ctx.animations() ? (fast ? 260 : 620) : 0);
    colEls.forEach((list) => list.forEach((n) => gone.has(n.dataset.s) && n.classList.add('pop')));
    sound.tick?.();
    await wait(ctx.animations() ? (fast ? 160 : 280) : 0);
    // 2) survivors fall, new symbols drop in from the top
    colEls = colEls.map((list, c) => {
      const kept = list.filter((n) => !gone.has(n.dataset.s));
      list.filter((n) => gone.has(n.dataset.s)).forEach((n) => n.remove());
      const fresh = toStep.grid[c].slice(0, ROWS - kept.length).map((x, i) => {
        const n = cellEl(x, i - (ROWS - kept.length));
        cols[c].prepend(n);
        return n;
      });
      const all = [...fresh, ...kept];
      void cols[c].offsetWidth;
      all.forEach((n, r) => {
        n.style.transitionDelay = '';
        n.classList.remove('win');
        n.style.setProperty('--row', r);
      });
      return all;
    });
    await wait(ctx.animations() ? (fast ? 220 : 380) : 0);
  }

  function showOverlay(html, cls = '') {
    overlay.className = `cc-overlay ${cls}`;
    overlay.innerHTML = html;
    overlay.hidden = false;
  }
  const hideOverlay = () => (overlay.hidden = true);

  async function playSpin(spin, { fast, acc, c, amount, label }) {
    msg.innerHTML = label;
    setGrid(spin.steps[0].grid, { drop: ctx.animations() });
    sound.spin();
    await wait(ctx.animations() ? (fast ? 420 : 700) : 0);
    let tumbleWin = 0;
    for (let k = 0; k + 1 < spin.steps.length; k++) {
      const step = spin.steps[k];
      const stepWin = step.wins.reduce((a, w) => a + w.pay, 0);
      tumbleWin += stepWin;
      msg.innerHTML = step.wins.map((w) => `${sym(w.symbol, 'cc-mini')} ×${w.count} <b>${esc(money(w.pay * amount, c))}</b>`).join(' · ');
      sound.win();
      winEl.textContent = money(acc + tumbleWin * amount, c);
      await tumble(step, spin.steps[k + 1], fast);
      if (destroyed) return 0;
    }
    if (spin.free && spin.orbSum > 0 && tumbleWin > 0) {
      colEls.forEach((list) => list.forEach((n) => n.dataset.s === 'orb' && n.classList.add('win')));
      msg.innerHTML = `Orbs <b>×${spin.orbSum}</b> → <b>${esc(money(tumbleWin * spin.orbSum * amount, c))}</b>`;
      sound.bigWin();
      await wait(ctx.animations() ? (fast ? 500 : 1100) : 0);
    }
    if (spin.starPay) {
      colEls.forEach((list) => list.forEach((n) => n.dataset.s === 'star' && n.classList.add('win')));
      await wait(ctx.animations() ? (fast ? 400 : 800) : 0);
    }
    return spin.win;
  }

  async function play(isAuto) {
    if (busy) return null;
    if (!ctx.requireAuth()) return null;
    const v = panel.values();
    if (!isAuto && !panel.checkBalance(v.amount)) return null;
    busy = true;
    if (!isAuto) panel.setBusy(true);
    hideOverlay();
    const c = code();
    try {
      const res = await api.post('/api/games/cascade/bet', { amount: v.amount, currency: c, params: {} });
      if (destroyed) return null;
      ctx.debitView(res);
      const bet = res.bet;
      const { spins, freeSpins } = bet.result;
      const fast = isAuto;
      winEl.textContent = money(0, c);
      let acc = 0;
      acc += (await playSpin(spins[0], { fast, acc, c, amount: bet.amount, label: 'Good luck!' })) * bet.amount;
      winEl.textContent = money(acc, c);
      if (spins.length > 1) {
        sound.bigWin();
        showOverlay(`<div class="cc-banner">${sym('star', 'cc-b-icon')}<div class="cc-b-big">${FREE_SPINS} FREE SPINS</div><div class="cc-b-sub">Multiplier orbs boost every win</div></div>`, 'banner');
        await wait(ctx.animations() ? (fast ? 1200 : 2200) : 0);
        hideOverlay();
        stage.classList.add('free');
        let awarded = FREE_SPINS;
        for (let i = 1; i < spins.length && !destroyed; i++) {
          const s = spins[i];
          acc += (await playSpin(s, { fast: true, acc, c, amount: bet.amount, label: `<span class="cc-free">FREE SPIN <b>${i}</b> / ${awarded}</span>` })) * bet.amount;
          winEl.textContent = money(acc, c);
          if (s.retrigger) {
            awarded += s.retrigger;
            sound.bigWin();
            showOverlay(`<div class="cc-banner"><div class="cc-b-big">+${s.retrigger} FREE SPINS</div></div>`, 'banner');
            await wait(ctx.animations() ? 1200 : 0);
            hideOverlay();
          }
        }
        stage.classList.remove('free');
      }
      if (bet.multiplier >= 10 || spins.length > 1) {
        const big = bet.multiplier >= 10;
        showOverlay(
          `<div class="cc-banner"><div class="cc-b-sub">${freeSpins ? `${freeSpins} free spins` : ''}</div><div class="cc-b-big">${bet.multiplier >= 50 ? 'MEGA WIN' : big ? 'BIG WIN' : 'TOTAL WIN'}</div><div class="cc-b-amt">${esc(money(bet.payout, c))} ${coin(c, 22)}</div><div class="cc-b-sub">${fmt.multiplier(bet.multiplier)}${bet.result.maxWin ? ' · MAX WIN' : ''}</div></div>`,
          'banner summary',
        );
        await wait(ctx.animations() ? (fast ? 1300 : 2600) : 0);
        hideOverlay();
      }
      winEl.textContent = money(bet.payout, c);
      msg.innerHTML = bet.payout > 0 ? `Won <b>${esc(money(bet.payout, c))}</b> ${coin(c, 14)} · ${fmt.multiplier(bet.multiplier)}` : msgIdle;
      if (bet.payout === 0) sound.lose();
      ctx.settle(res);
      if (bet.payout > bet.amount && spins.length === 1) ctx.resultPop(stage.querySelector('.cc-board'), { multiplier: bet.multiplier, payout: bet.payout, currency: bet.currency, duration: fast ? 900 : 1500 });
      return { win: bet.payout > bet.amount, profit: bet.payout - bet.amount };
    } catch (err) {
      if (isAuto) throw err;
      ctx.toastError(err);
      return null;
    } finally {
      busy = false;
      if (!isAuto) panel.setBusy(false);
    }
  }

  function renderPaytable() {
    const c = code();
    const amount = panel.get('amount') || 0;
    const amt = (x) => (amount > 0 ? esc(money(x * amount, c)) : `${x}×`);
    ptEl.innerHTML = `<div class="cc-pt-head"><h3>Paytable</h3><button class="icon-btn" data-act="pt-close" aria-label="Close">✕</button></div>
      <div class="cc-pt-grid">${PAYING.map((s) => `<div class="cc-pt-row">${sym(s, 'cc-pt-icon')}<div>${[['12+', 2], ['10–11', 1], ['8–9', 0]].map(([n, t]) => `<div><span class="dim">${n}</span><b>${amt(PAYS[s][t])}</b></div>`).join('')}</div></div>`).join('')}</div>
      <div class="cc-pt-special">${sym('star', 'cc-pt-icon')}<p><b>Star (scatter)</b> — 4, 5 or 6+ anywhere pay ${STAR_PAYS[4]}×, ${STAR_PAYS[5]}× or ${STAR_PAYS[6]}× the bet and award <b>${FREE_SPINS} free spins</b>. 3+ stars during free spins add ${RETRIGGER} more.</p></div>
      <div class="cc-pt-special">${sym('orb', 'cc-pt-icon')}<p><b>Multiplier orb</b> — free spins only, ${ORBS[0][0]}× to ${ORBS[ORBS.length - 1][0]}×. Orbs on the grid at the end of a winning spin add together and multiply that spin’s win.</p></div>
      <p class="dim">Wins are multiples of the total bet. All wins in a tumble sequence add up. Maximum win ${MAX_WIN.toLocaleString()}×. RTP 96.6%.</p>`;
  }
  on(stage, 'click', '[data-act=paytable]', () => {
    renderPaytable();
    ptEl.hidden = !ptEl.hidden;
  });
  on(stage, 'click', '[data-act=pt-close]', () => (ptEl.hidden = true));

  // Idle grid: a fixed, friendly arrangement.
  const idle = Array.from({ length: COLS }, (_, c) => Array.from({ length: ROWS }, (_, r) => ({ s: PAYING[(c * 2 + r * 3) % PAYING.length] })));
  idle[2][2] = { s: 'star' };
  setGrid(idle);
  winEl.textContent = money(0, code());

  return {
    destroy() {
      destroyed = true;
      timers.forEach(clearTimeout);
      timers.clear();
    },
  };
}
