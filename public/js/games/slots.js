import { el, esc, on } from '../dom.js';
import { amountField } from '../ui/controls.js';
import { coin } from '../icons.js';
import { CURRENCIES, roundDown } from '../shared/currencies.js';
import { REELS, PAYLINES, PAYS, SCATTER_PAYS, LINES, FREE_SPINS, FREE_SPIN_MULTIPLIER } from '../shared/games/slots.js';

const NAMES = { cherry: 'Cherry', lemon: 'Lemon', orange: 'Orange', plum: 'Plum', grape: 'Grapes', bell: 'Bell', bar: 'BAR', seven: 'Seven', wild: 'Wild', scatter: 'Scatter' };
const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
const LINE_COLORS = PAYLINES.map((_, i) => `hsl(${Math.round((i * 137.5 + 320) % 360)} 100% 64%)`);

const starPoints = (cx, cy, R, r) =>
  Array.from({ length: 10 }, (_, k) => {
    const a = ((-90 + k * 36) * Math.PI) / 180;
    const rr = k % 2 ? r : R;
    return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

const grape = [
  [30, 42],
  [50, 42],
  [70, 42],
  [40, 60],
  [60, 60],
  [50, 78],
]
  .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="12" fill="url(#nf-g-grape)" stroke="#2e1065" stroke-width="1.6"/><circle cx="${x - 4}" cy="${y - 4.5}" r="3.4" fill="#fff" opacity=".7"/>`)
  .join('');

// One hidden sprite: gradients + every symbol, instanced with <use>.
const SPRITE = `<svg class="sl-sprite" width="0" height="0" aria-hidden="true" focusable="false">
<defs>
  <linearGradient id="nf-g-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8a99"/><stop offset=".5" stop-color="#ec1c41"/><stop offset="1" stop-color="#9c0623"/></linearGradient>
  <linearGradient id="nf-g-yellow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff9b8"/><stop offset=".45" stop-color="#ffdd1f"/><stop offset="1" stop-color="#d49b00"/></linearGradient>
  <linearGradient id="nf-g-orange" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd59a"/><stop offset=".45" stop-color="#ff921f"/><stop offset="1" stop-color="#cc4a00"/></linearGradient>
  <linearGradient id="nf-g-plum" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eab3ff"/><stop offset=".45" stop-color="#a24ee8"/><stop offset="1" stop-color="#4e1287"/></linearGradient>
  <radialGradient id="nf-g-grape" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#e7d3ff"/><stop offset=".45" stop-color="#8f5cf7"/><stop offset="1" stop-color="#3b1585"/></radialGradient>
  <linearGradient id="nf-g-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff7c9"/><stop offset=".4" stop-color="#ffd23f"/><stop offset=".75" stop-color="#e59a00"/><stop offset="1" stop-color="#a86400"/></linearGradient>
  <linearGradient id="nf-g-leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b4f7a8"/><stop offset=".5" stop-color="#33b84a"/><stop offset="1" stop-color="#1a6e2b"/></linearGradient>
  <linearGradient id="nf-g-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a5076"/><stop offset="1" stop-color="#15172d"/></linearGradient>
  <linearGradient id="nf-g-seven" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9db0"/><stop offset=".45" stop-color="#ff1f4f"/><stop offset="1" stop-color="#a1002b"/></linearGradient>
  <linearGradient id="nf-g-wild" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9be8"/><stop offset=".5" stop-color="#e21cf0"/><stop offset="1" stop-color="#6d0b99"/></linearGradient>
  <radialGradient id="nf-g-star" cx=".5" cy=".42" r=".62"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#9ff5ff"/><stop offset=".75" stop-color="#14c4f0"/><stop offset="1" stop-color="#0569a8"/></radialGradient>
</defs>
<symbol id="nf-cherry" viewBox="0 0 100 100">
  <path d="M53 15c-7 18-16 30-22 43M53 15c4 16 10 28 17 37" fill="none" stroke="#25913b" stroke-width="5" stroke-linecap="round"/>
  <path d="M53 15c9-10 25-11 34-3-9 10-25 11-34 3z" fill="url(#nf-g-leaf)"/>
  <path d="M57 14c8-2 16-2 25 0" stroke="#17642a" stroke-width="1.5" fill="none"/>
  <circle cx="31" cy="68" r="19" fill="url(#nf-g-red)" stroke="#5c0014" stroke-width="2"/>
  <circle cx="70" cy="63" r="19" fill="url(#nf-g-red)" stroke="#5c0014" stroke-width="2"/>
  <ellipse cx="23.5" cy="60.5" rx="6.5" ry="4" transform="rotate(-35 23.5 60.5)" fill="#fff" opacity=".85"/>
  <ellipse cx="62.5" cy="55.5" rx="6.5" ry="4" transform="rotate(-35 62.5 55.5)" fill="#fff" opacity=".85"/>
</symbol>
<symbol id="nf-lemon" viewBox="0 0 100 100">
  <path d="M7 52c4-3 8-4 12-5 6-16 20-25 34-25 16 0 30 10 34 25 3 1 6 3 8 5-2 3-5 5-8 6-4 15-18 24-34 24-15 0-29-9-34-24-4-1-8-3-12-6z" fill="url(#nf-g-yellow)" stroke="#8f6a00" stroke-width="2"/>
  <ellipse cx="40" cy="36" rx="15" ry="5.5" transform="rotate(-16 40 36)" fill="#fff" opacity=".75"/>
  <path d="M28 67c11 8 31 9 45 0" stroke="#b68700" stroke-width="2.4" fill="none" opacity=".55" stroke-linecap="round"/>
  <circle cx="66" cy="44" r="1.6" fill="#b68700" opacity=".5"/><circle cx="58" cy="58" r="1.6" fill="#b68700" opacity=".5"/><circle cx="72" cy="56" r="1.6" fill="#b68700" opacity=".5"/>
</symbol>
<symbol id="nf-orange" viewBox="0 0 100 100">
  <circle cx="50" cy="56" r="33" fill="url(#nf-g-orange)" stroke="#8a3300" stroke-width="2"/>
  <path d="M51 24c3-9 13-13 24-10-3 10-13 14-24 10z" fill="url(#nf-g-leaf)"/>
  <circle cx="50" cy="24.5" r="3.2" fill="#6b3a00"/>
  <ellipse cx="37" cy="41" rx="11.5" ry="6.5" transform="rotate(-32 37 41)" fill="#fff" opacity=".65"/>
  <g fill="#8a3300" opacity=".25"><circle cx="62" cy="50" r="1.6"/><circle cx="54" cy="68" r="1.6"/><circle cx="68" cy="66" r="1.6"/><circle cx="40" cy="64" r="1.6"/><circle cx="72" cy="56" r="1.4"/></g>
</symbol>
<symbol id="nf-plum" viewBox="0 0 100 100">
  <path d="M50 25c-20 0-32 15-32 33 0 18 14 30 32 30s32-12 32-30c0-18-12-33-32-33z" fill="url(#nf-g-plum)" stroke="#310762" stroke-width="2"/>
  <path d="M50 27c-6 14-6 40 0 60" stroke="#310762" stroke-width="2.2" fill="none" opacity=".45"/>
  <path d="M50 27c1-6 3-10 7-14" stroke="#6b4423" stroke-width="4" stroke-linecap="round" fill="none"/>
  <path d="M56 16c6-7 17-7 23-2-6 8-16 9-23 2z" fill="url(#nf-g-leaf)"/>
  <ellipse cx="35" cy="45" rx="7" ry="12" transform="rotate(22 35 45)" fill="#fff" opacity=".5"/>
</symbol>
<symbol id="nf-grape" viewBox="0 0 100 100">
  <path d="M50 30c0-8 2-13 6-17" stroke="#6b4423" stroke-width="4" stroke-linecap="round" fill="none"/>
  <path d="M53 23c-8-11-23-11-31-4 8 11 23 11 31 4z" fill="url(#nf-g-leaf)"/>
  ${grape}
</symbol>
<symbol id="nf-bell" viewBox="0 0 100 100">
  <circle cx="50" cy="14" r="5.5" fill="url(#nf-g-gold)" stroke="#7a4a00" stroke-width="1.6"/>
  <path d="M50 18c-15 0-24 12-24 28v12c0 7-5 11-10 15h68c-5-4-10-8-10-15V46c0-16-9-28-24-28z" fill="url(#nf-g-gold)" stroke="#7a4a00" stroke-width="2"/>
  <circle cx="50" cy="85" r="7" fill="url(#nf-g-gold)" stroke="#7a4a00" stroke-width="2"/>
  <rect x="13" y="70" width="74" height="10" rx="5" fill="url(#nf-g-gold)" stroke="#7a4a00" stroke-width="2"/>
  <path d="M38 30c-4 6-5 16-5 28" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".6" fill="none"/>
</symbol>
<symbol id="nf-bar" viewBox="0 0 100 100">
  <rect x="7" y="27" width="86" height="46" rx="11" fill="url(#nf-g-bar)" stroke="#5ef2ff" stroke-width="3"/>
  <rect x="13" y="33" width="74" height="34" rx="7" fill="none" stroke="#5ef2ff" stroke-width="1.2" opacity=".45"/>
  <text x="50" y="60" text-anchor="middle" font-family="${FONT}" font-size="27" font-weight="900" font-style="italic" fill="url(#nf-g-gold)" stroke="#2a1700" stroke-width="1.2" letter-spacing="1">BAR</text>
</symbol>
<symbol id="nf-seven" viewBox="0 0 100 100">
  <path d="M20 17h62v14L53 87H31l29-54H20z" fill="none" stroke="url(#nf-g-gold)" stroke-width="11" stroke-linejoin="round"/>
  <path d="M20 17h62v14L53 87H31l29-54H20z" fill="url(#nf-g-seven)" stroke="#fff" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M25 22h52" stroke="#fff" stroke-width="3" opacity=".65" stroke-linecap="round"/>
</symbol>
<symbol id="nf-wild" viewBox="0 0 100 100">
  <rect x="5" y="24" width="90" height="52" rx="14" fill="url(#nf-g-wild)" stroke="#ffd6f6" stroke-width="3"/>
  <rect x="11" y="29" width="78" height="19" rx="9" fill="#fff" opacity=".2"/>
  <text x="50" y="61" text-anchor="middle" font-family="${FONT}" font-size="28" font-weight="900" font-style="italic" fill="#fff" stroke="#4d0870" stroke-width="3" paint-order="stroke" letter-spacing=".5">WILD</text>
  <path d="M86 12l2.6 6.4L95 21l-6.4 2.6L86 30l-2.6-6.4L77 21l6.4-2.6z" fill="#fff"/>
  <path d="M14 70l1.6 4L19.6 75.6l-4 1.6L14 81.2l-1.6-4-4-1.6 4-1.6z" fill="#fff" opacity=".8"/>
</symbol>
<symbol id="nf-scatter" viewBox="0 0 100 100">
  <circle cx="50" cy="51" r="43" fill="none" stroke="#5ef2ff" stroke-width="2" stroke-dasharray="3 6" opacity=".7"/>
  <polygon points="${starPoints(50, 52, 42, 18)}" fill="url(#nf-g-star)" stroke="#e6fdff" stroke-width="3" stroke-linejoin="round"/>
  <polygon points="${starPoints(50, 52, 22, 9.5)}" fill="#fff" opacity=".45"/>
</symbol>
</svg>`;

const symSvg = (s, cls = 'sl-icon') => `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true"><use href="#nf-${s}"/></svg>`;
const symHtml = (s) => `<div class="sl-sym" data-s="${s}">${symSvg(s)}</div>`;

const PAY_ORDER = ['seven', 'bar', 'bell', 'grape', 'plum', 'orange', 'lemon', 'cherry'];

export default function mountSlots(ctx) {
  const { api, fmt, sound } = ctx;
  let busy = false;
  let destroyed = false;
  let turbo = false;
  try {
    turbo = localStorage.getItem('fakesino:slots-turbo') === '1';
  } catch {
    /* ignore */
  }
  const timers = new Set();
  const wait = (ms) =>
    new Promise((resolve) => {
      const t = setTimeout(() => {
        timers.delete(t);
        resolve();
      }, ms);
      timers.add(t);
    });

  const panel = ctx.createBetPanel({
    betLabel: 'Spin',
    fields: [amountField(), { key: 'line', type: 'readonly', label: 'Line bet (20 lines)', value: '', suffix: coin(ctx.currency()) }],
    onBet: () => play(false),
    auto: { run: () => play(true), delay: 200 },
  });

  const tools = el(`<div class="bp-two sl-tools">
    <button class="btn btn-secondary" data-act="paytable">Paytable</button>
    <button class="btn btn-secondary sl-turbo" data-act="turbo" aria-pressed="false">⚡ Turbo</button></div>`);
  panel.extra.appendChild(tools);
  const turboBtn = tools.querySelector('[data-act=turbo]');

  const stage = el(`<div class="slots-stage">
    ${SPRITE}
    <div class="sl-cabinet">
      <div class="sl-marquee"><span class="sl-bulbs"></span><h2 class="sl-title"><span>NEON</span> FRUITS</h2><span class="sl-bulbs"></span></div>
      <div class="sl-window">
        <div class="sl-reels">${Array.from({ length: 5 }, (_, i) => `<div class="sl-reel" data-reel="${i}"><div class="sl-strip"></div></div>`).join('')}</div>
        <svg class="sl-lines" aria-hidden="true"></svg>
        <div class="sl-overlay" hidden></div>
      </div>
      <div class="sl-bar">
        <div class="sl-meter sl-win"><span class="k">WIN</span><span class="v">0.00</span></div>
        <div class="sl-msg"><span class="dim">20 lines · wilds · free spins ×${FREE_SPIN_MULTIPLIER}</span></div>
        <div class="sl-meter sl-betm"><span class="k">BET</span><span class="v">0.00</span></div>
      </div>
    </div>
    <div class="sl-paytable" hidden></div>
  </div>`);
  ctx.stage.appendChild(stage);
  const cabinet = stage.querySelector('.sl-cabinet');
  const windowEl = stage.querySelector('.sl-window');
  const reelsEl = stage.querySelector('.sl-reels');
  const reelEls = [...stage.querySelectorAll('.sl-reel')];
  const strips = reelEls.map((r) => r.querySelector('.sl-strip'));
  const linesSvg = stage.querySelector('.sl-lines');
  const overlay = stage.querySelector('.sl-overlay');
  const winV = stage.querySelector('.sl-win .v');
  const betV = stage.querySelector('.sl-betm .v');
  const msg = stage.querySelector('.sl-msg');
  const msgIdle = msg.innerHTML;
  const paytable = stage.querySelector('.sl-paytable');
  stage.querySelectorAll('.sl-bulbs').forEach((b) => (b.innerHTML = '<i></i>'.repeat(6)));

  // ---- formatting ----
  const code = () => ctx.currency();
  const money = (v, c = code()) => fmt.amount(roundDown(c, v), c);
  function lineBetText(amount, c = code()) {
    const d = CURRENCIES[c].decimals;
    return (amount / LINES).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d + 2 });
  }
  function refreshBetInfo() {
    const amount = panel.get('amount') || 0;
    panel.set('line', lineBetText(amount));
    const suffix = panel.field('line')?.querySelector('.suffix');
    if (suffix) suffix.innerHTML = coin(code());
    betV.textContent = money(amount);
    if (!paytable.hidden) renderPaytable();
  }

  // ---- reels ----
  let current = REELS.map((reel, i) => [0, 1, 2].map((r) => reel[(i * 7 + 3 + r) % reel.length]));
  function setGrid(grid) {
    current = grid.map((col) => [...col]);
    strips.forEach((s, i) => {
      s.getAnimations().forEach((a) => a.cancel());
      s.style.transform = '';
      s.innerHTML = current[i].map(symHtml).join('');
    });
  }

  let activeAnims = [];
  function spinReels(spin, { fast }) {
    const anim = ctx.animations();
    clearWins();
    if (!anim) {
      setGrid(spin.grid);
      return Promise.resolve();
    }
    const cellH = reelEls[0].clientHeight / 3;
    activeAnims = [];
    const landed = strips.map((strip, i) => {
      const reel = REELS[i];
      const stop = spin.stops[i];
      const fill = fast ? 7 + i * 3 : 14 + i * 6;
      const syms = [];
      for (let k = 0; k < 3 + fill; k++) syms.push(reel[(stop + k) % reel.length]);
      syms.push(...current[i]);
      strip.innerHTML = syms.map(symHtml).join('');
      const from = -(3 + fill) * cellH;
      const duration = fast ? 330 + i * 95 : 720 + i * 215;
      const a = strip.animate(
        [
          { transform: `translateY(${from}px)`, easing: 'ease-out' },
          { transform: `translateY(${from - cellH * 0.16}px)`, offset: fast ? 0.05 : 0.08, easing: 'cubic-bezier(.5,0,.75,.6)' },
          { transform: `translateY(${from * 0.55}px)`, offset: 0.42, easing: 'cubic-bezier(.2,.4,.35,1)' },
          { transform: `translateY(${cellH * 0.13}px)`, offset: 0.9, easing: 'ease-in-out' },
          { transform: 'translateY(0)' },
        ],
        { duration, fill: 'forwards' },
      );
      activeAnims.push(a);
      reelEls[i].classList.add('spinning');
      const unblur = setTimeout(() => reelEls[i].classList.remove('spinning'), duration * 0.82);
      timers.add(unblur);
      return a.finished
        .catch(() => {})
        .then(() => {
          reelEls[i].classList.remove('spinning');
          if (destroyed) return;
          strip.innerHTML = spin.grid[i].map(symHtml).join('');
          a.cancel();
          strip.style.transform = '';
          current[i] = [...spin.grid[i]];
          if (spin.grid[i].includes('scatter')) {
            sound.reveal();
            strip.querySelectorAll('[data-s=scatter]').forEach((n) => n.classList.add('land'));
          } else sound.tick();
        });
    });
    return Promise.all(landed).then(() => {
      activeAnims = [];
    });
  }

  // Click the reels to slam-stop a spin.
  windowEl.addEventListener('click', () => {
    if (activeAnims.length) activeAnims.forEach((a) => a.playState === 'running' && a.finish());
  });

  // ---- win presentation ----
  let cycleToken = 0;
  let counterToken = 0;
  let shownLines = [];
  let winTotal = 0;

  function cellsOf(reel) {
    return [...strips[reel].children];
  }

  function clearWins() {
    cycleToken++;
    shownLines = [];
    linesSvg.innerHTML = '';
    reelsEl.classList.remove('has-win');
    reelsEl.querySelectorAll('.sl-sym.win, .sl-sym.land').forEach((n) => n.classList.remove('win', 'land'));
  }

  function drawLines(lines) {
    shownLines = lines;
    const box = reelsEl.getBoundingClientRect();
    if (!box.width) return;
    linesSvg.setAttribute('viewBox', `0 0 ${box.width.toFixed(1)} ${box.height.toFixed(1)}`);
    const centers = reelEls.map((r) => {
      const b = r.getBoundingClientRect();
      return { x: b.left - box.left + b.width / 2, top: b.top - box.top, h: b.height / 3 };
    });
    linesSvg.innerHTML = lines
      .map((line) => {
        const pts = PAYLINES[line].map((row, i) => [centers[i].x, centers[i].top + centers[i].h * (row + 0.5)]);
        pts.unshift([0, pts[0][1]]);
        pts.push([box.width, pts[pts.length - 1][1]]);
        const p = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
        const c = LINE_COLORS[line];
        return `<g style="--c:${c}"><polyline points="${p}" class="glow"/><polyline points="${p}" class="core"/><circle cx="${pts[1][0].toFixed(1)}" cy="${pts[1][1].toFixed(1)}" r="11" class="tag"/><text x="${pts[1][0].toFixed(1)}" y="${pts[1][1].toFixed(1)}" class="tag-t">${line + 1}</text></g>`;
      })
      .join('');
  }

  function markCells(spin, wins, withScatter) {
    reelsEl.querySelectorAll('.sl-sym.win').forEach((n) => n.classList.remove('win'));
    for (const w of wins) {
      PAYLINES[w.line].slice(0, w.count).forEach((row, reel) => cellsOf(reel)[row]?.classList.add('win'));
    }
    if (withScatter) spin.scatters.forEach(([reel, row]) => cellsOf(reel)[row]?.classList.add('win'));
    reelsEl.classList.toggle('has-win', wins.length > 0 || withScatter);
  }

  function showAllWins(spin) {
    const scatterWin = spin.scatterWin > 0 || spin.scatters.length >= 3;
    markCells(spin, spin.lineWins, scatterWin);
    drawLines(spin.lineWins.map((w) => w.line));
  }

  function lineLabel(w, lineBet, c) {
    return `<span class="sl-chip" style="--c:${LINE_COLORS[w.line]}">LINE ${w.line + 1}</span> ${w.count}× ${symSvg(w.symbol, 'sl-mini')} <b>${esc(money(w.pay * lineBet, c))}</b>`;
  }

  // After a manual spin, keep cycling through the winning lines until the next spin.
  async function cycleWins(spin, lineBet, c) {
    const token = ++cycleToken;
    const items = [...spin.lineWins.map((w) => ({ w })), ...(spin.scatterWin > 0 ? [{ scatter: true }] : [])];
    if (items.length < 2 && !spin.scatterWin) return;
    await wait(1200);
    while (token === cycleToken && !destroyed) {
      for (const it of items) {
        if (token !== cycleToken || destroyed) return;
        if (it.scatter) {
          markCells(spin, [], true);
          drawLines([]);
          msg.innerHTML = `${spin.scatters.length}× ${symSvg('scatter', 'sl-mini')} scatter <b>${esc(money(spin.scatterWin * lineBet, c))}</b>`;
        } else {
          markCells(spin, [it.w], false);
          drawLines([it.w.line]);
          msg.innerHTML = lineLabel(it.w, lineBet, c);
        }
        await wait(1100);
      }
      if (token !== cycleToken || destroyed) return;
      showAllWins(spin);
      msg.innerHTML = `<b>${spin.lineWins.length}</b> winning line${spin.lineWins.length === 1 ? '' : 's'}`;
      await wait(1400);
    }
  }

  function countTo(target, ms, c) {
    const token = ++counterToken;
    const from = winTotal;
    winTotal = target;
    winV.parentElement.classList.toggle('hot', target > 0);
    if (!ctx.animations() || ms <= 0 || target <= from) {
      winV.textContent = money(target, c);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const start = performance.now();
      const step = (now) => {
        if (token !== counterToken || destroyed) return resolve();
        const t = Math.min(1, (now - start) / ms);
        winV.textContent = money(from + (target - from) * (1 - (1 - t) ** 2), c);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  function resetMeter(c) {
    counterToken++;
    winTotal = 0;
    winV.textContent = money(0, c);
    winV.parentElement.classList.remove('hot');
  }

  // ---- overlays (free spins banner, summary, big win) ----
  function showOverlay(html, cls) {
    overlay.className = `sl-overlay ${cls || ''}`;
    overlay.innerHTML = html;
    overlay.hidden = false;
  }
  function hideOverlay() {
    overlay.hidden = true;
    overlay.innerHTML = '';
  }
  function burst(n = 26) {
    if (!ctx.animations()) return '';
    return `<div class="sl-burst">${Array.from({ length: n }, () => {
      const a = Math.random() * Math.PI * 2;
      const d = 90 + Math.random() * 160;
      return `<i style="--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px;--r:${Math.round(Math.random() * 720 - 360)}deg;--t:${(0.7 + Math.random() * 0.7).toFixed(2)}s;--h:${Math.round(Math.random() * 360)}"></i>`;
    }).join('')}</div>`;
  }

  async function holdOverlay(ms) {
    // Clicking the overlay skips the remaining hold.
    let skip;
    const skipped = new Promise((r) => (skip = r));
    overlay.addEventListener('click', skip, { once: true });
    await Promise.race([wait(ms), skipped]);
    overlay.removeEventListener('click', skip);
  }

  // ---- play ----
  async function play(isAuto) {
    if (busy) return null;
    if (!ctx.requireAuth()) return null;
    const v = panel.values();
    if (!isAuto && !panel.checkBalance(v.amount)) return null;
    busy = true;
    if (!isAuto) panel.setBusy(true);
    refreshBetInfo();
    clearWins();
    hideOverlay();
    const c = code();
    try {
      const res = await api.post('/api/games/slots/bet', { amount: v.amount, currency: c, params: {} });
      if (destroyed) return null;
      ctx.debitView(res);
      sound.spin();
      resetMeter(c);
      const bet = res.bet;
      const { spins, freeSpins } = bet.result;
      const lineBet = bet.amount / LINES;
      const fast = isAuto || turbo;
      const anim = ctx.animations();
      msg.innerHTML = '<span class="sl-good">Good luck!</span>';

      // Paid spin
      const base = spins[0];
      await spinReels(base, { fast });
      if (destroyed) return null;
      let acc = base.units * lineBet;
      if (base.units > 0) {
        showAllWins(base);
        if (bet.multiplier < 10 || spins.length > 1) sound.win();
        msg.innerHTML = base.lineWins.length ? `<b>${base.lineWins.length}</b> winning line${base.lineWins.length === 1 ? '' : 's'}` : `${base.scatters.length}× ${symSvg('scatter', 'sl-mini')} scatter`;
        await countTo(acc, fast ? 300 : Math.min(1600, 500 + base.units * 12), c);
      } else msg.innerHTML = msgIdle;

      // Free spins, already decided by the server, played out in order.
      if (spins.length > 1) {
        if (base.scatters.length >= 3) markCells(base, base.lineWins, true);
        sound.bigWin();
        if (anim) await wait(fast ? 300 : 700);
        cabinet.classList.add('free');
        showOverlay(
          `<div class="sl-banner-in"><div class="sl-b-top">${symSvg('scatter', 'sl-b-icon')}</div><div class="sl-b-big">${FREE_SPINS} FREE SPINS</div><div class="sl-b-sub">ALL WINS ×${FREE_SPIN_MULTIPLIER}</div></div>${burst(18)}`,
          'banner',
        );
        if (anim) await holdOverlay(fast ? 1300 : 2200);
        hideOverlay();
        let awarded = FREE_SPINS;
        for (let i = 1; i < spins.length && !destroyed; i++) {
          const s = spins[i];
          msg.innerHTML = `<span class="sl-free">FREE SPIN <b>${i}</b> / ${awarded}</span> <span class="sl-x3">×${FREE_SPIN_MULTIPLIER}</span>`;
          sound.spin();
          clearWins();
          await spinReels(s, { fast: true });
          if (destroyed) return null;
          if (s.units > 0) {
            showAllWins(s);
            sound.win();
            acc += s.units * lineBet;
            await countTo(acc, fast ? 280 : 650, c);
            if (anim) await wait(fast ? 250 : 650);
          } else if (anim) await wait(fast ? 120 : 320);
          if (s.retrigger) {
            awarded += s.retrigger;
            sound.bigWin();
            showOverlay(`<div class="sl-banner-in"><div class="sl-b-big">+${s.retrigger} FREE SPINS</div><div class="sl-b-sub">RETRIGGER</div></div>`, 'banner');
            if (anim) await holdOverlay(fast ? 900 : 1500);
            hideOverlay();
          }
        }
        cabinet.classList.remove('free');
        clearWins();
        const big = bet.multiplier >= 10;
        if (big) sound.bigWin();
        else if (bet.payout > 0) sound.win();
        showOverlay(
          `<div class="sl-banner-in"><div class="sl-b-sub">${freeSpins} FREE SPINS COMPLETE</div><div class="sl-b-big">${big ? 'BIG WIN' : 'TOTAL WIN'}</div>
            <div class="sl-b-amt">${esc(money(bet.payout, c))} ${coin(c, 22)}</div><div class="sl-b-mult">${fmt.multiplier(bet.multiplier)}</div></div>${burst(big ? 34 : 18)}`,
          `banner summary ${big ? 'big' : ''}`,
        );
        if (anim) await holdOverlay(fast ? 1500 : 2800);
        hideOverlay();
      } else if (bet.multiplier >= 10) {
        sound.bigWin();
        const mega = bet.multiplier >= 50;
        showOverlay(
          `<div class="sl-banner-in"><div class="sl-b-big">${mega ? 'MEGA WIN' : 'BIG WIN'}</div><div class="sl-b-amt"><span class="sl-big-amt">${esc(money(0, c))}</span> ${coin(c, 22)}</div><div class="sl-b-mult">${fmt.multiplier(bet.multiplier)}</div></div>${burst(mega ? 44 : 30)}`,
          `banner big ${mega ? 'mega' : ''}`,
        );
        const amtEl = overlay.querySelector('.sl-big-amt');
        if (anim) {
          const start = performance.now();
          const ms = fast ? 700 : 1500;
          await new Promise((resolve) => {
            const step = (now) => {
              if (destroyed) return resolve();
              const t = Math.min(1, (now - start) / ms);
              amtEl.textContent = money(bet.payout * (1 - (1 - t) ** 3), c);
              if (t < 1) requestAnimationFrame(step);
              else resolve();
            };
            requestAnimationFrame(step);
          });
          await holdOverlay(fast ? 700 : 1600);
        } else amtEl.textContent = money(bet.payout, c);
        hideOverlay();
      }

      if (destroyed) return null;
      await countTo(bet.payout, 0, c);
      ctx.settle(res);
      const won = bet.payout > bet.amount;
      if (spins.length > 1) {
        msg.innerHTML = `<b>${freeSpins}</b> free spins · total <b>${esc(money(bet.payout, c))}</b>`;
      } else if (base.units > 0) {
        if (!fast) cycleWins(base, lineBet, c);
        else if (isAuto && anim) await wait(won ? 420 : 200);
      }
      return { win: won, profit: bet.payout - bet.amount };
    } catch (err) {
      if (isAuto) throw err;
      ctx.toastError(err);
      return null;
    } finally {
      busy = false;
      if (!isAuto) panel.setBusy(false);
    }
  }

  // ---- paytable ----
  function renderPaytable() {
    const c = code();
    const lineBet = (panel.get('amount') || 0) / LINES;
    const amt = (units) => (lineBet > 0 ? esc(money(units * lineBet, c)) : `${units}×`);
    const payRow = (s) =>
      `<div class="pt-sym">${symSvg(s, 'pt-icon')}<div class="pt-pays">${[5, 4, 3].map((n) => `<div><span>${n}×</span><b>${amt(PAYS[s][n])}</b></div>`).join('')}</div></div>`;
    const lines = PAYLINES.map(
      (rows, i) =>
        `<div class="pt-line" style="--c:${LINE_COLORS[i]}"><span>${i + 1}</span><div class="pt-grid">${[0, 1, 2]
          .map((r) => rows.map((row) => `<i class="${row === r ? 'on' : ''}"></i>`).join(''))
          .join('')}</div></div>`,
    ).join('');
    paytable.innerHTML = `<div class="pt-head"><h3>Paytable</h3><span class="pill">${lineBet > 0 ? `Line bet ${esc(lineBetText(panel.get('amount') || 0, c))}` : 'Pays × line bet'}</span><button class="icon-btn pt-close" aria-label="Close">✕</button></div>
      <div class="pt-body">
        <div class="pt-specials">
          <div class="pt-special">${symSvg('wild', 'pt-icon')}<div><b>WILD</b><p>Substitutes for every symbol except Scatter. A line of wilds pays ${PAYS.wild[3]}× / ${PAYS.wild[4]}× / ${PAYS.wild[5]}× line bet.</p>
            <div class="pt-pays inline">${[5, 4, 3].map((n) => `<div><span>${n}×</span><b>${amt(PAYS.wild[n])}</b></div>`).join('')}</div></div></div>
          <div class="pt-special">${symSvg('scatter', 'pt-icon')}<div><b>SCATTER</b><p>Pays anywhere: 3, 4 or 5 scatters pay ${SCATTER_PAYS[3]}×, ${SCATTER_PAYS[4]}× or ${SCATTER_PAYS[5]}× the total bet and award <b>${FREE_SPINS} free spins</b> where all wins are ×${FREE_SPIN_MULTIPLIER}. Free spins can retrigger (up to 50).</p></div></div>
        </div>
        <div class="pt-grid-syms">${PAY_ORDER.map(payRow).join('')}</div>
        <h4>20 paylines</h4>
        <p class="dim">Wins pay left to right from the first reel on adjacent reels. Only the highest win per line is paid; line wins are added together. RTP 96.3%.</p>
        <div class="pt-lines">${lines}</div>
      </div>`;
  }

  function togglePaytable(open = paytable.hidden) {
    if (open) renderPaytable();
    paytable.hidden = !open;
  }

  function setTurbo(on) {
    turbo = on;
    turboBtn.classList.toggle('active', on);
    turboBtn.setAttribute('aria-pressed', String(on));
    try {
      localStorage.setItem('fakesino:slots-turbo', on ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  on(tools, 'click', '[data-act]', (e, b) => (b.dataset.act === 'paytable' ? togglePaytable() : setTurbo(!turbo)));
  on(paytable, 'click', '.pt-close', () => togglePaytable(false));
  const onKey = (e) => {
    if (e.key === 'Escape' && !paytable.hidden) togglePaytable(false);
  };
  document.addEventListener('keydown', onKey);

  panel.onChange((key) => {
    if (key === 'amount') refreshBetInfo();
  });
  // ½ / 2× and the S/A/D hotkeys change the amount without an onChange event.
  const deferRefresh = () => setTimeout(() => !destroyed && refreshBetInfo(), 0);
  const amountNode = panel.field('amount');
  amountNode?.addEventListener('click', deferRefresh);
  amountNode?.addEventListener('focusout', deferRefresh);
  document.addEventListener('keydown', deferRefresh);
  ctx.on('currency', () => setTimeout(refreshBetInfo, 0));

  const ro = new ResizeObserver(() => shownLines.length && drawLines(shownLines));
  ro.observe(reelsEl);

  setGrid(current);
  setTurbo(turbo);
  refreshBetInfo();
  resetMeter(code());

  return {
    destroy() {
      destroyed = true;
      cycleToken++;
      counterToken++;
      activeAnims.forEach((a) => a.cancel());
      timers.forEach(clearTimeout);
      timers.clear();
      ro.disconnect();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keydown', deferRefresh);
    },
  };
}
