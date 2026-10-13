import { el, esc, on } from '../dom.js';
import { icon, coin } from '../icons.js';
import { api } from '../api.js';
import { state, bus, setUser } from '../state.js';
import { SPORTS, FLOAT_COUNT, simulate, parseMatchId } from '../shared/sports.js';
import { bytesToFloat } from '../shared/fair.js';
import { sha256Hex } from '../verify.js';
import { inSlip, toggleSelection, showOdds } from '../ui/betslip.js';
import { confirmDialog } from '../ui/confirm.js';
import { toastSuccess, toastError } from '../ui/toast.js';
import * as fmt from '../format.js';

const POLL_MS = 2500;
const kickoffText = (t) => {
  const d = new Date(t);
  const today = new Date().toDateString() === d.toDateString();
  return `${today ? 'Today' : d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

// Odds button; carries everything the bet slip needs.
function oddBtn(m, mk, o, { compact = false } = {}) {
  const sel = { matchId: m.id, market: mk.key, outcome: o.key, odds: o.odds, name: o.name, marketName: mk.name, home: m.home, away: m.away, league: m.leagueName, sport: m.sport, live: m.status === 'live' };
  const active = inSlip(m.id, mk.key, o.key);
  return `<button class="sb-odd ${active ? 'active' : ''}" ${o.odds ? '' : 'disabled'} data-sel="${esc(JSON.stringify(sel))}">
    ${compact ? '' : `<span class="sb-odd-name">${esc(o.name)}</span>`}<b>${o.odds ? showOdds(o.odds) : icon('lock', 13)}</b></button>`;
}

function bindOdds(root) {
  on(root, 'click', '.sb-odd[data-sel]', (e, b) => {
    if (b.disabled) return;
    toggleSelection(JSON.parse(b.dataset.sel));
  });
}

function scoreCell(m, side) {
  if (!m.score) return '';
  return `<b class="sb-score">${m.score[side]}</b>`;
}

function eventRow(m) {
  const mk = m.markets[0];
  const live = m.status === 'live';
  return `<div class="sb-event ${live ? 'live' : ''}" data-match="${esc(m.id)}">
    <a class="sb-ev-meta" href="/sports/match/${esc(m.id)}">
      ${live ? `<span class="sb-live">${esc(m.clock || 'Live')}</span><span class="dim">${esc(m.period || '')}</span>` : `<span class="dim">${kickoffText(m.kickoff)}</span>`}
      <span class="dim sb-league">${icon(m.sport, 13)} ${esc(m.leagueName)}</span></a>
    <a class="sb-teams" href="/sports/match/${esc(m.id)}"><div><span>${esc(m.home)}</span>${scoreCell(m, 'home')}</div><div><span>${esc(m.away)}</span>${scoreCell(m, 'away')}</div></a>
    <div class="sb-odds cols-${mk?.outcomes.length || 2}">${mk ? mk.outcomes.map((o) => oddBtn(m, mk, o, { compact: true })).join('') : '<span class="dim">Markets closed</span>'}</div>
    <a class="sb-more" href="/sports/match/${esc(m.id)}">${m.marketCount > 1 ? `+${m.marketCount - 1}` : icon('right', 14)}</a></div>`;
}

function headRow(mk) {
  if (!mk) return '';
  const labels = mk.outcomes.length === 3 ? ['1', 'X', '2'] : ['1', '2'];
  return `<div class="sb-colhead"><span>${esc(mk.name)}</span><div class="sb-odds cols-${labels.length}">${labels.map((l) => `<span>${l}</span>`).join('')}</div><span></span></div>`;
}

function sportTabs(active, sports) {
  return `<div class="sb-sports">${[['', 'All', 'sports', sports.reduce((a, s) => a + s.live, 0)], ...sports.map((s) => [s.key, s.name, s.key, s.live])]
    .map(([k, n, ic, live]) => `<a class="sb-sport ${k === (active || '') ? 'active' : ''}" href="/sports${k ? `/${k}` : ''}">${icon(ic, 18)}<span>${esc(n)}</span>${live ? `<i>${live}</i>` : ''}</a>`)
    .join('')}</div>`;
}

export default async function sportsPage(page, params = {}) {
  if (params.id) return matchPage(page, params.id);
  if (params.sport === 'my-bets') return myBetsPage(page);
  const sport = params.sport && SPORTS[params.sport] ? params.sport : null;
  document.title = `${sport ? SPORTS[sport].name : 'Sports'} — Fakesino`;
  const root = el(`<div class="sb"><div class="page-title">${icon(sport || 'sports', 22)} ${sport ? esc(SPORTS[sport].name) : 'Sports'}
      <a class="btn btn-secondary btn-sm" style="margin-left:auto" href="/sports/my-bets">${icon('ticket', 15)} My Bets</a></div>
    <div class="demo-notice">${icon('info', 16)}<div>Play-money sportsbook. Leagues and teams are fictional and every match is simulated (90 minutes play out in about ten), with a seed you can verify after full time.</div></div>
    <div class="sb-tabs-slot"></div><div class="sb-lists"><div class="spinner"></div></div></div>`);
  page.appendChild(root);
  const lists = root.querySelector('.sb-lists');
  bindOdds(root);
  let sports = null;
  async function load() {
    const [meta, lobby] = await Promise.all([sports ? { sports } : api.get('/api/sports'), api.get(`/api/sports/lobby${sport ? `?sport=${sport}` : ''}`)]);
    sports = meta.sports;
    root.querySelector('.sb-tabs-slot').innerHTML = sportTabs(sport, sports);
    const groups = new Map();
    for (const m of lobby.upcoming) {
      const g = groups.get(m.league) || [];
      g.push(m);
      groups.set(m.league, g);
    }
    lists.innerHTML = `
      <section class="sb-section"><h3>${icon('bolt', 18)} Live Events <span class="pill red">${lobby.live.length}</span></h3>
        ${
          lobby.live.length
            ? Object.keys(SPORTS)
                .map((k) => lobby.live.filter((m) => m.sport === k))
                .filter((list) => list.length)
                .map((list) => `<div class="sb-card"><div class="sb-league-head">${icon(list[0].sport, 16)} <b>${esc(list[0].sportName)}</b><span class="pill red">${list.length}</span></div>${headRow(list.find((m) => m.markets[0])?.markets[0])}${list.map(eventRow).join('')}</div>`)
                .join('')
            : '<div class="empty">No live matches right now — the next ones start within minutes.</div>'
        }</section>
      <section class="sb-section"><h3>${icon('clock', 18)} Upcoming</h3>
        ${
          [...groups.values()]
            .map((list) => `<div class="sb-card"><div class="sb-league-head">${icon(list[0].sport, 16)} <b>${esc(list[0].leagueName)}</b><span class="dim">${esc(list[0].region)}</span></div>${headRow(list[0].markets[0])}${list.slice(0, 8).map(eventRow).join('')}</div>`)
            .join('') || '<div class="empty">No upcoming matches.</div>'
        }</section>`;
  }
  await load().catch((err) => (lists.innerHTML = `<div class="empty">${esc(err.message)}</div>`));
  const timer = setInterval(() => load().catch(() => {}), POLL_MS);
  const off = bus.on('slip', () => root.querySelectorAll('.sb-odd[data-sel]').forEach((b) => {
    const s = JSON.parse(b.dataset.sel);
    b.classList.toggle('active', inSlip(s.matchId, s.market, s.outcome));
  }));
  return () => {
    clearInterval(timer);
    off();
  };
}

// ---- match page ----
async function matchPage(page, id) {
  const root = el(`<div class="sb sb-match"><a class="link sb-back" href="/sports">${icon('left', 14)} Sports</a><div class="sb-board"><div class="spinner"></div></div><div class="sb-markets"></div><div class="sb-fair"></div></div>`);
  page.appendChild(root);
  bindOdds(root);
  const board = root.querySelector('.sb-board');
  const marketsEl = root.querySelector('.sb-markets');
  const fair = root.querySelector('.sb-fair');
  let fairDone = false;
  async function load() {
    const { match: m } = await api.get(`/api/sports/match/${encodeURIComponent(id)}`);
    document.title = `${m.home} vs ${m.away} — Fakesino`;
    const s = SPORTS[m.sport];
    const status = m.status === 'live' ? `<span class="sb-live">${esc(m.clock || 'Live')}</span> <span class="dim">${esc(m.period || '')}</span>` : m.status === 'ended' ? '<span class="pill">Full time</span>' : `<span class="dim">Kick-off ${kickoffText(m.kickoff)}</span>`;
    const periods =
      m.periods && m.periods.length
        ? `<table class="sb-periods"><thead><tr><th></th>${m.periods.map((_, i) => `<th>${s.model === 'points' ? (i < 4 ? `Q${i + 1}` : 'OT') : i + 1}</th>`).join('')}<th>${s.model === 'sets' ? 'Sets' : s.model === 'maps' ? 'Maps' : 'T'}</th></tr></thead>
        <tbody>${['home', 'away'].map((side) => `<tr><td>${esc(m[side])}</td>${m.periods.map((p) => `<td>${p[side]}</td>`).join('')}<td><b>${m.score?.[side] ?? 0}</b></td></tr>`).join('')}</tbody></table>`
        : '';
    const events = m.events?.length
      ? `<div class="sb-events">${m.events.map((e) => `<div class="sb-goal ${e.team}"><span class="dim">${e.minute}'</span>${icon(m.sport, 14)} ${esc(m[e.team])}</div>`).join('')}</div>`
      : '';
    board.innerHTML = `<div class="sb-board-top"><span class="dim">${icon(m.sport, 14)} ${esc(m.sportName)} · ${esc(m.leagueName)}</span>${status}</div>
      <div class="sb-board-teams"><div class="team">${esc(m.home)}</div><div class="sb-board-score">${m.score ? `${m.score.home} <span>–</span> ${m.score.away}` : '<span class="dim">vs</span>'}</div><div class="team">${esc(m.away)}</div></div>
      ${periods}${events}`;
    marketsEl.innerHTML = m.markets.length
      ? m.markets.map((mk) => `<div class="sb-market"><div class="sb-market-name">${esc(mk.name)}</div><div class="sb-market-odds cols-${Math.min(3, mk.outcomes.length)}">${mk.outcomes.map((o) => oddBtn(m, mk, o)).join('')}</div></div>`).join('')
      : `<div class="empty">${m.status === 'ended' ? 'This match has finished.' : 'Markets are closed for the final moments of the match.'}</div>`;
    if (!fairDone) {
      fair.innerHTML = `<div class="sb-fair-card"><div class="row" style="gap:8px">${icon('shield', 16)}<b>Fairness</b></div>
        <div class="dim" style="font-size:12.5px;margin:6px 0">The match was decided by a secret seed committed before kick-off. Its SHA-256:</div>
        <div class="mono sb-hash">${esc(m.seedHash)}</div>
        ${m.seed ? `<div class="dim" style="font-size:12.5px;margin:10px 0 6px">Seed (revealed at full time):</div><div class="mono sb-hash">${esc(m.seed)}</div><button class="btn btn-secondary btn-sm" data-act="verify" style="margin-top:10px">${icon('check', 14)} Verify result</button><div class="sb-verify"></div>` : '<div class="dim" style="font-size:12.5px;margin-top:8px">The seed is revealed at full time so you can recompute the result.</div>'}</div>`;
      fairDone = m.status === 'ended';
      fair.querySelector('[data-act=verify]')?.addEventListener('click', async () => {
        const out = fair.querySelector('.sb-verify');
        const ok = (await sha256Hex(m.seed)) === m.seedHash;
        const fl = await seedFloats(m.seed);
        const sim = simulate(parseMatchId(m.id), fl);
        const same = sim.final.home === m.score.home && sim.final.away === m.score.away;
        out.innerHTML = `<div class="demo-notice ${ok && same ? '' : 'warn'}" style="margin-top:10px">${icon(ok && same ? 'check' : 'alert', 16)}<div>Seed hash ${ok ? 'matches' : 'does NOT match'}. Recomputed result: <b>${sim.final.home} – ${sim.final.away}</b> ${same ? '(same as shown)' : '(different!)'}.</div></div>`;
      });
    }
    return m;
  }
  let m = await load().catch((err) => (board.innerHTML = `<div class="empty">${esc(err.message)}</div>`));
  const timer = setInterval(async () => {
    if (m?.status === 'ended') return;
    m = await load().catch(() => m);
  }, POLL_MS);
  const off = bus.on('slip', () => root.querySelectorAll('.sb-odd[data-sel]').forEach((b) => {
    const s = JSON.parse(b.dataset.sel);
    b.classList.toggle('active', inSlip(s.matchId, s.market, s.outcome));
  }));
  return () => {
    clearInterval(timer);
    off();
  };
}

async function seedFloats(seed) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(seed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const out = [];
  for (let r = 0; out.length < FLOAT_COUNT; r++) {
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`sports:${r}`)));
    for (let i = 0; i < 8 && out.length < FLOAT_COUNT; i++) out.push(bytesToFloat(sig, i * 4));
  }
  return out;
}

// ---- my bets ----
const STATUS = { open: ['yellow', 'Active'], won: ['green', 'Won'], lost: ['red', 'Lost'], cashout: ['blue', 'Cashed out'] };
const LEG = { open: '', won: 'green', lost: 'red' };

async function myBetsPage(page) {
  document.title = 'My Sports Bets — Fakesino';
  let tab = new URLSearchParams(location.search).get('tab') === 'settled' ? 'settled' : 'active';
  const root = el(`<div class="sb"><div class="page-title">${icon('ticket', 22)} My Bets <a class="btn btn-secondary btn-sm" style="margin-left:auto" href="/sports">${icon('sports', 15)} Sports</a></div>
    <div class="tabs" style="margin-bottom:16px"><button class="tab" data-t="active">Active</button><button class="tab" data-t="settled">Settled</button></div>
    <div class="sb-bets"><div class="spinner"></div></div></div>`);
  page.appendChild(root);
  const list = root.querySelector('.sb-bets');
  async function load() {
    root.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('active', b.dataset.t === tab));
    if (!state.user) return;
    const { bets } = await api.get(`/api/sports/bets?status=${tab}`);
    list.innerHTML = bets.length
      ? bets.map(betCard).join('')
      : `<div class="empty">${tab === 'active' ? 'No active bets. <a class="link" href="/sports">Find a match</a>' : 'No settled bets yet.'}</div>`;
  }
  on(root, 'click', '[data-t]', (e, b) => {
    tab = b.dataset.t;
    history.replaceState({}, '', `/sports/my-bets${tab === 'settled' ? '?tab=settled' : ''}`);
    load();
  });
  on(root, 'click', '[data-cashout]', async (e, b) => {
    const amount = Number(b.dataset.amount);
    const code = b.dataset.currency;
    if (!(await confirmDialog({ title: 'Cash out', message: `Cash out this bet for ${fmt.money(amount, code)} ${code}?`, confirmLabel: 'Cash out' }))) return;
    try {
      const res = await api.post('/api/sports/cashout', { id: Number(b.dataset.cashout), amount });
      setUser(res.user);
      toastSuccess('Cashed out', `${fmt.money(res.bet.payout, code)} ${code} added to your balance`);
      load();
    } catch (err) {
      toastError(err);
      load();
    }
  });
  await load().catch((err) => (list.innerHTML = `<div class="empty">${esc(err.message)}</div>`));
  const timer = setInterval(() => tab === 'active' && load().catch(() => {}), 3000);
  const offs = [bus.on('live:sports:bet', () => load().catch(() => {})), bus.on('sports:placed', () => load().catch(() => {}))];
  return () => {
    clearInterval(timer);
    offs.forEach((f) => f());
  };
}

function betCard(b) {
  const [cls, label] = STATUS[b.status] || ['', b.status];
  const c = b.currency;
  return `<div class="sb-bet"><div class="sb-bet-head"><b>${b.type === 'multi' ? `Multi · ${b.legs.length} legs` : 'Single'}</b><span class="dim mono">#${b.id}</span><span class="pill ${cls}" style="margin-left:auto">${label}</span></div>
    ${b.legs
      .map(
        (l) => `<a class="sb-leg ${LEG[l.status]}" href="/sports/match/${esc(l.matchId)}"><span class="sb-leg-dot"></span><div style="min-width:0">
        <div class="dim" style="font-size:12px">${icon(l.sport, 12)} ${esc(l.home)} – ${esc(l.away)}${l.result ? ` · ${l.result.home}–${l.result.away}` : ''}${l.live ? ' · live bet' : ''}</div>
        <div><b>${esc(l.outcomeName)}</b> <span class="dim">${esc(l.marketName)}</span></div></div><b class="sb-leg-odds">${showOdds(l.odds)}</b></a>`,
      )
      .join('')}
    <div class="sb-bet-foot"><div><span class="dim">Stake</span><b>${fmt.money(b.stake, c)} ${coin(c)}</b></div><div><span class="dim">Odds</span><b>${showOdds(b.odds)}</b></div>
      <div><span class="dim">${b.status === 'open' ? 'Est. payout' : 'Payout'}</span><b class="${b.payout > 0 ? 'win-text' : ''}">${fmt.money(b.status === 'open' ? b.potential : b.payout, c)} ${coin(c)}</b></div></div>
    ${b.status === 'open' ? (b.cashout ? `<button class="btn btn-secondary btn-block" data-cashout="${b.id}" data-amount="${b.cashout}" data-currency="${c}">Cash out ${fmt.money(b.cashout, c)} ${coin(c)}</button>` : '<button class="btn btn-secondary btn-block" disabled>Cash out unavailable</button>') : ''}
    <div class="dim" style="font-size:11.5px;margin-top:6px">${fmt.dateTime(b.createdAt)}${b.settledAt ? ` · settled ${fmt.dateTime(b.settledAt)}` : ''}</div></div>`;
}
