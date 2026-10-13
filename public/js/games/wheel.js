import { el, esc } from '../dom.js';
import { amountField } from '../ui/controls.js';
import { table, SEGMENTS } from '../shared/games/wheel.js';

const RISK_OPTIONS = [
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
];

// One colour per multiplier value, the same in every table, so a colour always
// means the same payout. Each table uses at most one of the "silver" values.
const COLORS = {
  0: '#3a4b5b',
  1.2: '#d3dfea',
  1.5: '#22d36b',
  1.6: '#d3dfea',
  1.7: '#d3dfea',
  1.8: '#d3dfea',
  1.9: '#d3dfea',
  2: '#f5b83d',
  3: '#9b6bff',
  4: '#ff8a3d',
  5: '#2f9bff',
};
const colorFor = (m) => COLORS[m] ?? '#ff4d5e';

// Geometry (SVG units, wheel centred on 0,0).
const R_OUT = 100;
const R_IN = 72;

function polar(r, deg) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
}

function sector(i, n) {
  const a0 = (i * 360) / n;
  const a1 = ((i + 1) * 360) / n;
  const [x0, y0] = polar(R_OUT, a0);
  const [x1, y1] = polar(R_OUT, a1);
  const [x2, y2] = polar(R_IN, a1);
  const [x3, y3] = polar(R_IN, a0);
  const f = (v) => v.toFixed(3);
  return `M${f(x0)} ${f(y0)}A${R_OUT} ${R_OUT} 0 0 1 ${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}A${R_IN} ${R_IN} 0 0 0 ${f(x3)} ${f(y3)}Z`;
}

const easeOut = (t) => 1 - Math.pow(1 - t, 4);
const mod = (a, n) => ((a % n) + n) % n;

export default function mountWheel(ctx) {
  const { api, fmt, sound } = ctx;
  let risk = 'medium';
  let segments = 30;
  let busy = false;
  let alive = true;
  let raf = 0;
  let rot = 0; // current wheel rotation, degrees clockwise
  let tbl = table(risk, segments);

  const panel = ctx.createBetPanel({
    fields: [
      amountField(),
      { key: 'risk', type: 'select', label: 'Risk', options: RISK_OPTIONS, value: risk },
      { key: 'segments', type: 'select', label: 'Segments', options: SEGMENTS.map((s) => [s, String(s)]), value: segments },
    ],
    onBet: () => play(false),
    auto: { run: () => play(true) },
  });

  const stage = el(`<div class="wheel-stage">
    <div class="stage-center wheel-center">
      <div class="wheel-wrap">
        <svg class="wheel-svg" viewBox="-114 -122 228 236" aria-hidden="true">
          <defs>
            <radialGradient id="wheel-hub" cx="50%" cy="40%" r="65%">
              <stop offset="0" stop-color="#22323f"/><stop offset="1" stop-color="#0f1822"/>
            </radialGradient>
          </defs>
          <circle r="108" fill="#0a1118"/>
          <circle r="105" fill="none" stroke="#1f2e3b" stroke-width="2"/>
          <g class="wheel-rotor"></g>
          <circle r="${R_IN}" fill="url(#wheel-hub)"/>
          <circle r="${R_IN - 1}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="2"/>
          <circle r="${R_IN - 12}" fill="none" stroke="rgba(255,255,255,.04)" stroke-width="1"/>
          <g class="wheel-pointer">
            <path d="M0 -80 L-10 -100 A11 11 0 1 1 10 -100 Z" fill="currentColor" stroke="#0a1118" stroke-width="2.5" stroke-linejoin="round"/>
            <circle cy="-104.6" r="3.6" fill="#0a1118" opacity=".35"/>
          </g>
        </svg>
        <div class="wheel-result"><span></span></div>
      </div>
    </div>
    <div class="stage-bottom"><div class="wheel-legend"></div></div>
  </div>`);
  ctx.stage.appendChild(stage);
  const rotor = stage.querySelector('.wheel-rotor');
  const pointer = stage.querySelector('.wheel-pointer');
  const resultEl = stage.querySelector('.wheel-result');
  const resultText = resultEl.querySelector('span');
  const legend = stage.querySelector('.wheel-legend');
  let segEls = [];

  function build() {
    tbl = table(risk, segments);
    rotor.innerHTML = tbl
      .map((m, i) => `<path class="wseg" data-i="${i}" d="${sector(i, segments)}" fill="${colorFor(m)}"/>`)
      .join('');
    segEls = [...rotor.querySelectorAll('.wseg')];
    rotor.setAttribute('transform', `rotate(${rot.toFixed(3)})`);
    const counts = new Map();
    for (const m of tbl) counts.set(m, (counts.get(m) || 0) + 1);
    const distinct = [...counts.keys()].sort((a, b) => a - b);
    legend.style.setProperty('--n', distinct.length);
    legend.innerHTML = distinct
      .map((m) => {
        const c = counts.get(m);
        const tip = `${fmt.percent((c / segments) * 100)} chance · ${c}/${segments} segments`;
        return `<div class="wl-chip" data-m="${m}" style="--c:${colorFor(m)}" data-tip="${esc(tip)}"><span>${esc(fmt.multiplier(m))}</span></div>`;
      })
      .join('');
    pointer.style.color = '';
    clearResult();
  }

  function clearResult() {
    for (const s of segEls) {
      if (!s.classList.contains('hit')) continue;
      s.classList.remove('hit');
      s.removeAttribute('transform');
    }
    legend.querySelectorAll('.wl-chip').forEach((c) => c.classList.remove('active'));
    resultEl.classList.remove('show');
  }

  // Segment under the pointer for a given rotation.
  const segAt = (r) => Math.floor(mod(-r, 360) / (360 / segments)) % segments;

  function setRot(r, flap = 0) {
    rot = r;
    rotor.setAttribute('transform', `rotate(${r.toFixed(3)})`);
    pointer.setAttribute('transform', flap ? `rotate(${flap.toFixed(2)} 0 -104.6)` : '');
  }

  function spinTo(segment, ms, turns) {
    cancelAnimationFrame(raf);
    const seg = 360 / segments;
    // Land with segment's centre (± a little) under the pointer at 0°.
    const final = mod(-(segment + 0.5) * seg + (Math.random() - 0.5) * seg * 0.7, 360);
    const from = rot;
    let to = from - mod(from, 360) + final + 360 * turns;
    if (to - from < 360 * turns) to += 360;
    if (!ms || !alive) {
      setRot(mod(to, 360));
      return Promise.resolve();
    }
    const start = performance.now();
    let lastSeg = segAt(from);
    let lastTick = 0;
    let flapAt = -1e9;
    return new Promise((resolve) => {
      const frame = (now) => {
        if (!alive) return resolve();
        const t = Math.min(1, (now - start) / ms);
        const r = from + (to - from) * easeOut(t);
        const cur = segAt(r);
        if (cur !== lastSeg) {
          lastSeg = cur;
          flapAt = now;
          if (now - lastTick > 45) {
            lastTick = now;
            sound.tick();
          }
        }
        // The pointer flicks back as each segment edge passes, then settles.
        const fl = Math.max(0, 1 - (now - flapAt) / 110);
        setRot(t >= 1 ? mod(to, 360) : r, -14 * fl * Math.min(1, (1 - t) * 3));
        if (t < 1) raf = requestAnimationFrame(frame);
        else resolve();
      };
      raf = requestAnimationFrame(frame);
    });
  }

  function showResult(segment, multiplier) {
    const color = colorFor(multiplier);
    const hit = segEls[segment];
    if (hit) {
      hit.classList.add('hit');
      hit.setAttribute('transform', 'scale(1.05)'); // about the wheel centre
      rotor.appendChild(hit); // draw its outline on top
    }
    pointer.style.color = color;
    resultText.textContent = fmt.multiplier(multiplier);
    resultEl.style.setProperty('--c', color);
    resultEl.classList.toggle('zero', multiplier === 0);
    void resultEl.offsetWidth;
    resultEl.classList.add('show');
    legend.querySelectorAll('.wl-chip').forEach((c) => c.classList.toggle('active', Number(c.dataset.m) === multiplier));
  }

  panel.onChange((key, value) => {
    if (key === 'risk' || key === 'segments') {
      if (key === 'risk') risk = value;
      else segments = Number(value);
      build();
    }
  });

  async function play(isAuto) {
    if (busy) return null;
    if (!ctx.requireAuth()) return null;
    busy = true;
    if (!isAuto) panel.setBusy(true);
    try {
      const v = panel.values();
      const res = await api.post('/api/games/wheel/bet', { amount: v.amount, currency: ctx.currency(), params: { segments, risk } });
      ctx.debitView(res);
      sound.bet();
      const { segment, multiplier } = res.bet.result;
      if (res.bet.params.segments !== segments || res.bet.params.risk !== risk) {
        risk = res.bet.params.risk;
        segments = res.bet.params.segments;
        build();
      }
      clearResult();
      pointer.style.color = '';
      const anim = ctx.animations();
      if (anim) sound.spin();
      await spinTo(segment, anim ? (isAuto ? 1000 : 3000) : 0, isAuto ? 1 : 3 + Math.floor(Math.random() * 2));
      showResult(segment, multiplier);
      if (multiplier >= 5) sound.bigWin();
      else if (multiplier > 1) sound.win();
      else if (multiplier === 0) sound.lose();
      else sound.reveal();
      ctx.settle(res);
      return { win: res.bet.payout > res.bet.amount, profit: res.bet.payout - res.bet.amount };
    } finally {
      busy = false;
      if (!isAuto) panel.setBusy(false);
    }
  }

  build();
  function destroy() {
    alive = false;
    cancelAnimationFrame(raf);
  }
  ctx.onDestroy(destroy);
  return { destroy };
}
