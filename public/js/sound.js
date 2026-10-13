import { state } from './state.js';

// Synthesised sound effects (no audio files to download).
let ctx = null;
function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ freq = 440, to = null, dur = 0.08, type = 'sine', gain = 0.15, delay = 0 }) {
  if (!state.prefs.sound) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  const vol = gain * (state.prefs.volume ?? 0.5);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sound = {
  bet: () => tone({ freq: 520, to: 680, dur: 0.07, type: 'triangle', gain: 0.12 }),
  click: () => tone({ freq: 900, dur: 0.03, type: 'square', gain: 0.04 }),
  tick: () => tone({ freq: 1400, dur: 0.02, type: 'square', gain: 0.03 }),
  peg: (i = 0) => tone({ freq: 700 + (i % 8) * 60, dur: 0.035, type: 'triangle', gain: 0.05 }),
  reveal: () => tone({ freq: 660, to: 990, dur: 0.09, type: 'sine', gain: 0.12 }),
  card: () => tone({ freq: 300, to: 180, dur: 0.06, type: 'triangle', gain: 0.08 }),
  win: () => {
    tone({ freq: 660, dur: 0.1, type: 'triangle', gain: 0.14 });
    tone({ freq: 880, dur: 0.12, type: 'triangle', gain: 0.14, delay: 0.08 });
    tone({ freq: 1320, dur: 0.18, type: 'triangle', gain: 0.12, delay: 0.16 });
  },
  bigWin: () => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ freq: f, dur: 0.16, type: 'triangle', gain: 0.14, delay: i * 0.08 }));
  },
  lose: () => tone({ freq: 220, to: 110, dur: 0.22, type: 'sawtooth', gain: 0.06 }),
  bomb: () => {
    tone({ freq: 140, to: 40, dur: 0.4, type: 'sawtooth', gain: 0.18 });
    tone({ freq: 90, to: 30, dur: 0.5, type: 'square', gain: 0.08, delay: 0.02 });
  },
  cashout: () => {
    tone({ freq: 880, dur: 0.08, type: 'sine', gain: 0.14 });
    tone({ freq: 1175, dur: 0.14, type: 'sine', gain: 0.14, delay: 0.07 });
  },
  spin: () => tone({ freq: 200, to: 400, dur: 0.15, type: 'triangle', gain: 0.06 }),
};
