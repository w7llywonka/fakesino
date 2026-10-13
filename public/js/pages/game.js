import { el, esc, on, loadCss } from '../dom.js';
import { icon, gameArt, coin } from '../icons.js';
import { api } from '../api.js';
import { state, bus, savePrefs } from '../state.js';
import { setQuery } from '../router.js';
import { bySlug, GAMES, loadGame } from '../games/registry.js';
import { tile, loadPresence, refreshTiles, playing, rowNav, wireRows } from '../ui/tiles.js';
import { openGameSettings } from '../ui/gamesettings.js';
import { toast } from '../ui/toast.js';
import { challengeCard, tickCountdowns } from '../ui/challenges.js';
import { createGameContext, session } from '../ui/gamekit.js';
import { createLiveBets } from '../ui/livebets.js';
import * as fmt from '../format.js';
import { notFound } from './misc.js';
import { showGameTip, dismissGameTip, setGameTips } from '../ui/onboarding.js';

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

const CATEGORY_LABEL = { originals: 'Fakesino Originals', table: 'Table Games', slots: 'Fakesino Slots', live: 'Live Casino' };
const KIND_TAGS = { multiplayer: 'Multiplayer', stateful: 'Multi-step', chips: 'Table', instant: 'Instant' };

export default async function gamePage(page, { slug }) {
  const meta = bySlug[slug];
  if (!meta) return notFound(page);
  document.title = `${meta.name} — Fakesino`;
  setList(RECENT_KEY, [slug, ...recentGames().filter((s) => s !== slug)].slice(0, 12));
  const more = GAMES.filter((g) => g.category === meta.category && g.slug !== slug);
  const catName = CATEGORY_LABEL[meta.category] || 'Fakesino Originals';

  const root = el(`<div class="game-page">
    ${quickStart(meta)}
    <div class="game-frame ${state.prefs.theatre ? 'theatre' : ''}">
      <div class="game-controls"></div>
      <div class="game-stage"><div class="spinner" style="margin:auto"></div></div>
    </div>
    <div class="game-footer">
      <button class="icon-btn" data-act="theatre" data-tip="Theatre mode">${icon('theatre', 18)}</button>
      ${document.fullscreenEnabled ? `<button class="icon-btn" data-act="fullscreen" data-tip="Fullscreen">${icon('expand', 18)}</button>` : ''}
      <button class="icon-btn" data-act="stats" data-tip="Live stats">${icon('stats', 18)}</button>
      <button class="icon-btn" data-act="hotkeys" data-tip="Hotkeys">${icon('keyboard', 18)}</button>
      <button class="icon-btn" data-act="settings" data-tip="Settings">${icon('settings', 18)}</button>
      <button class="icon-btn ${favouriteGames().includes(slug) ? 'active' : ''}" data-act="fav" data-tip="Favourite">${icon('star', 18)}</button>
      <div class="brand">FAKE<b>SINO</b></div>
      <a class="fair-link" href="?modal=fairness">${icon('shield', 16)} Fairness</a>
    </div>
    <div class="game-info open">
      <div class="game-info-head">${icon(slug, 20)}<span class="title">${esc(meta.name)}</span><span class="pill">${esc(catName)}</span>
        <span class="pill green hide-mobile">RTP ${meta.rtp}%</span><span class="pill gi-playing" hidden><span class="dot-live"></span><span></span></span></div>
      <div class="gi-tabs tabs"><button class="tab active" data-gt="big">${icon('trophy', 15)} Big Wins</button><button class="tab" data-gt="lucky">${icon('sparkle', 15)} Lucky Wins</button><button class="tab" data-gt="challenges">${icon('gift', 15)} Challenges</button><button class="tab" data-gt="desc">${icon('info', 15)} Description</button></div>
      <div class="gi-body"></div>
    </div>
    ${more.length ? `<div class="section-title gi-more-title">${icon('fire', 18)} More from ${esc(catName)}<span class="spacer"></span>${rowNav()}<a class="btn btn-ghost btn-sm" href="/casino/group/${meta.category}">View all</a></div><div class="game-row gi-more">${more.map(tile).join('')}</div>` : ''}
    <div class="lb-slot"></div>
  </div>`);
  page.appendChild(root);

  const frame = root.querySelector('.game-frame');
  const controls = root.querySelector('.game-controls');
  const stage = root.querySelector('.game-stage');
  const footer = root.querySelector('.game-footer');
  const live = createLiveBets(root.querySelector('.lb-slot'), { game: slug });
  const info = root.querySelector('.game-info');
  const giBody = root.querySelector('.gi-body');
  const playingPill = root.querySelector('.gi-playing');
  const rows = wireRows(root);
  rows.sync();

  // ---- Big Wins / Lucky Wins / Description ----
  let giTab = 'big';
  let bigPeriod = '30d';
  function describe() {
    const how = meta.howTo || [];
    const keys = [['Space', 'bet'], ['S', 'double bet'], ['A', 'halve bet'], ['D', 'zero bet'], ...(meta.hotkeys || []).map(([k, l]) => [k, l.toLowerCase()])];
    giBody.innerHTML = `<div class="gi-desc"><div class="thumb">${gameArt(slug, meta.name)}</div><div>
      <div class="gi-tags"><span class="pill">Provably Fair</span><span class="pill">${esc(catName)}</span><span class="pill">${esc(KIND_TAGS[meta.kind] || 'Instant')}</span><span class="pill green">RTP ${meta.rtp}%</span><span class="pill"><span>House Edge</span> ${(100 - meta.rtp).toFixed(2).replace(/\.?0+$/, '')}%</span></div>
      <p>${esc(meta.desc)}</p>
      ${how.length ? `<div class="gi-how"><b>How to play</b><ol>${how.map((h) => `<li>${esc(h)}</li>`).join('')}</ol></div>` : ''}
      <p><span>${meta.kind === 'multiplayer' ? 'Every result comes from the round’s pre-committed hash chain and can be checked independently.' : 'Every result comes from your server seed, client seed and nonce and can be checked independently.'}</span> <a class="link" href="?modal=fairness&tab=${meta.kind === 'multiplayer' ? 'crash' : 'verify'}">Open the verifier</a></p>
      <p class="dim">Hotkeys: ${keys.map(([k, l]) => `<span class="kbd">${esc(k)}</span> ${esc(l)}`).join(' · ')}</p></div></div>`;
  }
  async function wins(type) {
    giBody.innerHTML = `${type === 'big' ? `<div class="gi-period segmented"><button data-p="30d" class="${bigPeriod === '30d' ? 'active' : ''}">30 days</button><button data-p="all" class="${bigPeriod === 'all' ? 'active' : ''}">All time</button></div>` : '<div class="gi-period dim">Highest multipliers in the last 60 days · bets of $0.10 or more</div>'}<div class="gi-wins"><div class="spinner"></div></div>`;
    let data;
    try {
      data = await api.get(`/api/games/${slug}/top?type=${type}&period=${type === 'big' ? bigPeriod : '60d'}`);
    } catch {
      data = { wins: [] };
    }
    if (giTab !== type) return;
    const box = giBody.querySelector('.gi-wins');
    box.innerHTML = data.wins.length
      ? `<div class="table-wrap"><table class="table gi-table"><thead><tr><th>#</th><th>User</th><th class="hide-mobile">Date</th><th class="r hide-mobile">Bet</th><th class="r">Multiplier</th><th class="r">Payout</th></tr></thead><tbody>${data.wins
          .map(
            (w, i) => `<tr data-bet="${w.id}"><td>${i < 3 ? `<span class="gi-rank r${i + 1}">${icon('trophy', 14)}</span>` : i + 1}</td>
            <td>${w.username ? esc(w.username) : `<span class="user-hidden">${icon('eyeOff', 13)} Hidden</span>`}</td>
            <td class="hide-mobile dim">${esc(fmt.dateTime(w.createdAt))}</td>
            <td class="r hide-mobile"><span class="amt">${esc(fmt.money(w.amount, w.currency))} ${coin(w.currency, 14)}</span></td>
            <td class="r">${fmt.multiplier(w.multiplier)}</td>
            <td class="r win-text"><span class="amt">${esc(fmt.money(w.payout, w.currency))} ${coin(w.currency, 14)}</span></td></tr>`,
          )
          .join('')}</tbody></table></div>`
      : `<div class="empty">${icon('trophy', 26)}<div>No wins yet. Be the first to win!</div></div>`;
  }
  async function challenges() {
    giBody.innerHTML = '<div class="spinner"></div>';
    let list = [];
    try {
      const [a, f] = await Promise.all([api.get(`/api/challenges?status=active&game=${slug}`), api.get(`/api/challenges?status=finished&game=${slug}`)]);
      list = [...a.challenges, ...f.challenges.slice(0, 3)];
    } catch {
      /* show empty */
    }
    if (giTab !== 'challenges') return;
    giBody.innerHTML = list.length ? `<div class="ch-grid">${list.map(challengeCard).join('')}</div>` : `<div class="empty">${icon('gift', 26)}<div>No challenges for ${esc(meta.name)} this week.</div></div>`;
  }
  function showGi(t) {
    giTab = t;
    root.querySelectorAll('[data-gt]').forEach((b) => b.classList.toggle('active', b.dataset.gt === t));
    if (t === 'desc') describe();
    else if (t === 'challenges') challenges();
    else wins(t);
  }
  on(root, 'click', '[data-gt-act]', (e, b) => {
    const act = b.dataset.gtAct;
    if (act === 'expand') return b.closest('.game-tip').classList.add('expanded');
    if (act === 'off') setGameTips(false);
    else dismissGameTip(slug);
    root.querySelector('.game-tip')?.remove();
    if (act === 'rules') {
      showGi('desc');
      info.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  const stopTicks = tickCountdowns(giBody);
  on(info, 'click', '[data-gt]', (e, b) => showGi(b.dataset.gt));
  on(giBody, 'click', '[data-p]', (e, b) => {
    bigPeriod = b.dataset.p;
    wins('big');
  });
  on(giBody, 'click', 'tr[data-bet]', (e, tr) => setQuery({ modal: 'bet', id: tr.dataset.bet }));
  showGi('big');
  const offWins = bus.on('bet:mine', (bet) => {
    if (bet.game === slug && (giTab === 'big' || giTab === 'lucky') && bet.payout > bet.amount) setTimeout(() => (giTab === 'big' || giTab === 'lucky') && wins(giTab), 400);
  });

  // ---- presence ----
  const ping = () => api.post('/api/presence', { slug }).then(({ counts }) => counts && (state.presence = counts) && bus.emit('presence', counts)).catch(() => {});
  ping();
  const pingTimer = setInterval(ping, 30000);
  loadPresence();
  const renderPlaying = () => {
    const n = playing(slug);
    playingPill.hidden = !n;
    playingPill.querySelector('span:last-child').textContent = `${fmt.compact(n)} Playing`;
    refreshTiles(root, bySlug);
  };
  const offPresence = bus.on('presence', renderPlaying);

  let statsPanel = null;
  let settingsPop = null;
  const onFullscreen = () => footer.querySelector('[data-act=fullscreen]')?.classList.toggle('active', document.fullscreenElement === frame);
  document.addEventListener('fullscreenchange', onFullscreen);
  on(footer, 'click', '[data-act]', (e, b) => {
    const act = b.dataset.act;
    if (act === 'theatre') {
      savePrefs({ theatre: !state.prefs.theatre });
      frame.classList.toggle('theatre', state.prefs.theatre);
      document.querySelector('.shell')?.classList.toggle('sidebar-collapsed', state.prefs.theatre || state.prefs.sidebarCollapsed);
      bus.emit('resize');
    } else if (act === 'fullscreen') {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else frame.requestFullscreen?.().catch(() => {});
      setTimeout(() => bus.emit('resize'), 200);
    } else if (act === 'stats') {
      if (statsPanel) {
        statsPanel.destroy();
        statsPanel = null;
      } else statsPanel = liveStatsPanel(() => (statsPanel = null));
    } else if (act === 'hotkeys') {
      setQuery({ modal: 'hotkeys' });
    } else if (act === 'settings') {
      if (document.querySelector('.gs-pop')) settingsPop?.close();
      else
        settingsPop = openGameSettings(b, slug, {
          onInfo: () => {
            showGi('desc');
            info.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        });
    } else if (act === 'fav') {
      const favs = favouriteGames();
      const added = !favs.includes(slug);
      const next = added ? [slug, ...favs] : favs.filter((s) => s !== slug);
      setList(FAV_KEY, next);
      b.classList.toggle('active', added);
      toast({ type: 'success', title: added ? 'Added to favourites' : 'Removed from favourites' });
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
    rows.destroy();
    statsPanel?.destroy();
    settingsPop?.close();
    offWins();
    offPresence();
    stopTicks();
    clearInterval(pingTimer);
    document.removeEventListener('fullscreenchange', onFullscreen);
    if (document.fullscreenElement === frame) document.exitFullscreen().catch(() => {});
    if (state.prefs.theatre) document.querySelector('.shell')?.classList.toggle('sidebar-collapsed', !!state.prefs.sidebarCollapsed);
  };
}

// First visit to a game: its how-to steps above the board until dismissed.
function quickStart(meta) {
  if (!showGameTip(meta.slug) || !meta.howTo?.length) return '';
  return `<div class="game-tip" role="note">${icon('sparkle', 18)}
    <div class="gt-body"><div class="gt-title">Quick start</div>
      <ol class="gt-steps">${meta.howTo.map((h) => `<li><span>${esc(h)}</span></li>`).join('')}</ol>
      <button class="gt-off link" data-gt-act="off" type="button">Don’t show game tips</button></div>
    <div class="gt-actions"><button class="btn btn-secondary btn-sm" data-gt-act="expand" type="button">How to play</button><button class="btn btn-secondary btn-sm" data-gt-act="rules" type="button">Full rules</button><button class="btn btn-primary btn-sm" data-gt-act="ok" type="button">Got it</button></div></div>`;
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
