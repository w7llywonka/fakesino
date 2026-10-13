import { el, esc, on, loadCss } from '../dom.js';
import { icon, gameArt } from '../icons.js';
import { state, bus, savePrefs } from '../state.js';
import { bySlug, loadGame } from '../games/registry.js';
import { createGameContext, session } from '../ui/gamekit.js';
import { createLiveBets } from '../ui/livebets.js';
import * as fmt from '../format.js';
import { notFound } from './misc.js';

const RECENT_KEY = 'fakesino:recent';
const FAV_KEY = 'fakesino:favs';

export function getList(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}
function setList(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
export const recentGames = () => getList(RECENT_KEY);
export const favouriteGames = () => getList(FAV_KEY);

export default async function gamePage(page, { slug }) {
  const meta = bySlug[slug];
  if (!meta) return notFound(page);
  document.title = `${meta.name} — Fakesino`;
  setList(RECENT_KEY, [slug, ...recentGames().filter((s) => s !== slug)].slice(0, 12));

  const root = el(`<div class="game-page">
    <div class="game-frame ${state.prefs.theatre ? 'theatre' : ''}">
      <div class="game-controls"></div>
      <div class="game-stage"><div class="spinner" style="margin:auto"></div></div>
    </div>
    <div class="game-footer">
      <button class="icon-btn" data-act="theatre" data-tip="Theatre mode">${icon('expand', 18)}</button>
      <button class="icon-btn" data-act="stats" data-tip="Live stats">${icon('stats', 18)}</button>
      <button class="icon-btn ${state.prefs.hotkeys ? 'active' : ''}" data-act="hotkeys" data-tip="Hotkeys">${icon('keyboard', 18)}</button>
      <button class="icon-btn" data-act="sound" data-tip="Sound">${icon(state.prefs.sound ? 'volume' : 'volumeOff', 18)}</button>
      <button class="icon-btn ${state.prefs.animations === false ? '' : 'active'}" data-act="anim" data-tip="Animations">${icon('bolt', 18)}</button>
      <button class="icon-btn ${favouriteGames().includes(slug) ? 'active' : ''}" data-act="fav" data-tip="Favourite">${icon('star', 18)}</button>
      <div class="brand">FAKE<b>SINO</b></div>
      <a class="fair-link" href="?modal=fairness">${icon('shield', 16)} Fairness</a>
    </div>
    <div class="game-info">
      <div class="game-info-head">${icon(slug, 20)}<span class="title">${esc(meta.name)}</span><span class="pill">${meta.category === 'slots' ? 'Fakesino Slots' : 'Fakesino Originals'}</span>
        <span class="pill green hide-mobile">RTP ${meta.rtp}%</span><span class="chev">${icon('down', 18)}</span></div>
      <div class="game-info-body"><div class="thumb">${gameArt(slug, meta.name)}</div>
        <div><p style="margin-top:0">${esc(meta.desc)}</p>
        <p>Every result is generated from your server seed, client seed and nonce, and can be checked independently in <a class="link" href="?modal=fairness&tab=verify">the verifier</a>. House edge ${(100 - meta.rtp).toFixed(1)}%.</p>
        <p class="dim">Hotkeys: <span class="kbd">Space</span> bet · <span class="kbd">S</span> double bet · <span class="kbd">A</span> halve bet · <span class="kbd">D</span> zero bet${meta.hotkeys ? ` · ${meta.hotkeys}` : ''}</p></div></div>
    </div>
    <div class="lb-slot"></div>
  </div>`);
  page.appendChild(root);

  const frame = root.querySelector('.game-frame');
  const controls = root.querySelector('.game-controls');
  const stage = root.querySelector('.game-stage');
  const footer = root.querySelector('.game-footer');
  const live = createLiveBets(root.querySelector('.lb-slot'), { game: slug });

  root.querySelector('.game-info-head').addEventListener('click', (e) => e.currentTarget.parentElement.classList.toggle('open'));

  let statsPanel = null;
  on(footer, 'click', '[data-act]', (e, b) => {
    const act = b.dataset.act;
    if (act === 'theatre') {
      savePrefs({ theatre: !state.prefs.theatre });
      frame.classList.toggle('theatre', state.prefs.theatre);
      document.querySelector('.shell')?.classList.toggle('sidebar-collapsed', state.prefs.theatre || state.prefs.sidebarCollapsed);
      bus.emit('resize');
    } else if (act === 'stats') {
      if (statsPanel) {
        statsPanel.destroy();
        statsPanel = null;
      } else statsPanel = liveStatsPanel(() => (statsPanel = null));
    } else if (act === 'hotkeys') {
      savePrefs({ hotkeys: !state.prefs.hotkeys });
      b.classList.toggle('active', state.prefs.hotkeys);
      import('../ui/toast.js').then(({ toast }) => toast({ title: state.prefs.hotkeys ? 'Hotkeys enabled' : 'Hotkeys disabled', message: state.prefs.hotkeys ? 'Space to bet, S/A to double/halve, D to reset.' : '' }));
    } else if (act === 'sound') {
      savePrefs({ sound: !state.prefs.sound });
      b.innerHTML = icon(state.prefs.sound ? 'volume' : 'volumeOff', 18);
    } else if (act === 'anim') {
      savePrefs({ animations: state.prefs.animations === false });
      b.classList.toggle('active', state.prefs.animations !== false);
    } else if (act === 'fav') {
      const favs = favouriteGames();
      const next = favs.includes(slug) ? favs.filter((s) => s !== slug) : [slug, ...favs];
      setList(FAV_KEY, next);
      b.classList.toggle('active', next.includes(slug));
    }
  });

  await loadCss(`/css/games/${slug}.css`);
  const ctx = createGameContext({ slug, controls, stage, footer });
  stage.innerHTML = '';
  let instance = null;
  try {
    const mod = await loadGame(slug);
    instance = (await mod.default(ctx)) || null;
  } catch (err) {
    console.error(err);
    stage.innerHTML = `<div class="empty" style="margin:auto">${icon('alert', 28)}<div>This game failed to load.</div><div class="dim" style="font-size:12px">${esc(err.message)}</div></div>`;
  }

  return () => {
    instance?.destroy?.();
    ctx.destroy();
    live.destroy();
    statsPanel?.destroy();
    if (state.prefs.theatre) document.querySelector('.shell')?.classList.toggle('sidebar-collapsed', !!state.prefs.sidebarCollapsed);
  };
}

// Draggable session stats window with a profit sparkline.
function liveStatsPanel(onClose) {
  const panel = el(`<div class="floating-panel" style="left:${Math.max(16, window.innerWidth - 360)}px;top:120px">
    <div class="fp-head">${icon('stats', 16)} Live Stats<button class="icon-btn" data-act="reset" data-tip="Reset">${icon('refresh', 16)}</button><button class="icon-btn" data-act="close" style="margin-left:0">${icon('close', 16)}</button></div>
    <div class="fp-body"><div class="live-stats-grid"></div><svg class="chart" viewBox="0 0 300 160" preserveAspectRatio="none" style="margin-top:10px;background:var(--bg-deep);border-radius:8px"></svg></div></div>`);
  document.body.appendChild(panel);
  const grid = panel.querySelector('.live-stats-grid');
  const chart = panel.querySelector('.chart');
  const render = () => {
    const profitUsd = session.points[session.points.length - 1];
    const wageredUsd = Object.entries(session.wagered).reduce((a, [c, v]) => a + fmt.usdOf(v, c), 0);
    grid.innerHTML = `<div><div class="k">Profit</div><div class="v ${profitUsd >= 0 ? 'win-text' : 'loss-text'}">${profitUsd < 0 ? '-' : ''}${fmt.fiat(Math.abs(profitUsd))}</div></div>
      <div><div class="k">Wins</div><div class="v win-text">${session.wins}</div></div>
      <div><div class="k">Wagered</div><div class="v">${fmt.fiat(wageredUsd)}</div></div>
      <div><div class="k">Losses</div><div class="v loss-text">${session.losses}</div></div>`;
    const pts = session.points;
    const min = Math.min(0, ...pts);
    const max = Math.max(0, ...pts);
    const span = max - min || 1;
    const x = (i) => (pts.length < 2 ? 0 : (i / (pts.length - 1)) * 300);
    const y = (v) => 150 - ((v - min) / span) * 140;
    const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    const zero = y(0);
    const last = pts[pts.length - 1];
    const color = last >= 0 ? '#22d36b' : '#ff4d5e';
    chart.innerHTML = `<line x1="0" x2="300" y1="${zero}" y2="${zero}" stroke="#304556" stroke-dasharray="4 4"/>
      <path d="${line} L300 ${zero} L0 ${zero}Z" fill="${color}" opacity=".15"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`;
  };
  render();
  const off = bus.on('bet:mine', () => setTimeout(render, 0));
  // drag
  const head = panel.querySelector('.fp-head');
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const sx = e.clientX - panel.offsetLeft;
    const sy = e.clientY - panel.offsetTop;
    const move = (ev) => {
      panel.style.left = `${Math.max(0, Math.min(window.innerWidth - 100, ev.clientX - sx))}px`;
      panel.style.top = `${Math.max(0, Math.min(window.innerHeight - 60, ev.clientY - sy))}px`;
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });
  const api = {
    destroy() {
      off();
      panel.remove();
    },
  };
  panel.querySelector('[data-act=close]').addEventListener('click', () => {
    api.destroy();
    onClose();
  });
  panel.querySelector('[data-act=reset]').addEventListener('click', () => {
    session.wagered = {};
    session.profit = {};
    session.wins = 0;
    session.losses = 0;
    session.points = [0];
    render();
  });
  return api;
}
