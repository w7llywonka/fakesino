import { el, esc, on } from '../dom.js';
import { icon, coin } from '../icons.js';
import { api } from '../api.js';
import { state, bus, currency, balanceOf, setUser, savePrefs, ensureSession } from '../state.js';
import { CURRENCIES, roundDown } from '../shared/currencies.js';
import { formatOdds } from '../shared/sports.js';
import * as fmt from '../format.js';
import { toast, toastSuccess, toastError } from './toast.js';

// Sports bet slip: selections persist in this browser; singles or one multi.
const KEY = 'fakesino:slip';
const MAX = 15;
function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}
const saved = load();
export const slip = { selections: Array.isArray(saved.selections) ? saved.selections : [], mode: saved.mode === 'multi' ? 'multi' : 'single', stakes: saved.stakes || {}, multiStake: saved.multiStake || '' };

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(slip));
  } catch {
    /* private mode: the slip lasts for this page view */
  }
  bus.emit('slip', slip);
}

export const selKey = (s) => `${s.matchId}|${s.market}|${s.outcome}`;
export const inSlip = (matchId, market, outcome) => slip.selections.some((s) => s.matchId === matchId && s.market === market && s.outcome === outcome);
export const oddsFormat = () => state.prefs.oddsFormat || 'decimal';
export const showOdds = (o) => formatOdds(o, oddsFormat());

export function toggleSelection(sel) {
  const i = slip.selections.findIndex((s) => selKey(s) === selKey(sel));
  if (i >= 0) slip.selections.splice(i, 1);
  else {
    // One pick per market: choosing another outcome replaces it.
    const j = slip.selections.findIndex((s) => s.matchId === sel.matchId && s.market === sel.market);
    if (j >= 0) slip.selections.splice(j, 1);
    if (slip.selections.length >= MAX) {
      toast({ type: 'error', title: 'Bet slip is full', message: `Up to ${MAX} selections.` });
      return;
    }
    slip.selections.push({ ...sel, addedOdds: sel.odds });
    bus.emit('slip:open');
  }
  persist();
}

export function clearSlip() {
  slip.selections = [];
  slip.stakes = {};
  slip.multiStake = '';
  persist();
}

const totalOdds = () => Math.round(slip.selections.reduce((a, s) => a * (s.odds || 0), 1) * 100) / 100;
const sameMatch = () => new Set(slip.selections.map((s) => s.matchId)).size !== slip.selections.length;

export function createSlipPanel(container, onClose) {
  const root = el(`<aside class="chat-panel slip-panel">
    <div class="chat-head">${icon('ticket', 18)}<span>Bet Slip</span><span class="slip-count pill"></span>
      <button class="icon-btn" data-act="close" aria-label="Close bet slip" style="margin-left:auto">${icon('close', 18)}</button></div>
    <div class="slip-tabs tabs block"><button class="tab" data-mode="single">Single</button><button class="tab" data-mode="multi">Multi</button></div>
    <div class="slip-body"></div>
    <div class="slip-foot"></div></aside>`);
  container.appendChild(root);
  const body = root.querySelector('.slip-body');
  const foot = root.querySelector('.slip-foot');
  let placing = false;
  let changedNotice = false;
  const code = () => currency();

  function render() {
    const n = slip.selections.length;
    root.querySelector('.slip-count').textContent = n;
    root.querySelector('.slip-count').hidden = !n;
    const multiOk = n >= 2 && !sameMatch();
    if (slip.mode === 'multi' && !multiOk) slip.mode = 'single';
    root.querySelectorAll('[data-mode]').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === slip.mode);
      b.disabled = b.dataset.mode === 'multi' && !multiOk;
    });
    if (!n) {
      body.innerHTML = `<div class="slip-empty">${icon('ticket', 34)}<b>Bet Slip is empty</b><span class="muted">Pick odds from any match to start.</span><a class="btn btn-secondary btn-sm" href="/sports">Start betting</a></div>`;
      foot.innerHTML = '';
      return;
    }
    const c = code();
    body.innerHTML = slip.selections
      .map((s) => {
        const moved = s.odds !== s.addedOdds ? (s.odds > s.addedOdds ? 'up' : 'down') : '';
        const stake = slip.stakes[selKey(s)] ?? '';
        return `<div class="slip-sel ${s.suspended ? 'suspended' : ''}" data-key="${esc(selKey(s))}">
          <div class="slip-sel-top"><span class="dim">${icon(s.sport, 13)} ${esc(s.league)}${s.live ? ' · <span class="live-dot">Live</span>' : ''}</span><button class="icon-btn" data-remove aria-label="Remove">${icon('close', 14)}</button></div>
          <a class="slip-match" href="/sports/match/${esc(s.matchId)}">${esc(s.home)} – ${esc(s.away)}</a>
          <div class="slip-pick"><div><div class="dim" style="font-size:12px">${esc(s.marketName)}</div><b>${esc(s.name)}</b></div>
            <span class="slip-odds ${moved}">${s.suspended ? 'Suspended' : showOdds(s.odds)}</span></div>
          ${
            slip.mode === 'single'
              ? `<div class="slip-stake"><div class="input-suffix"><input class="input" inputmode="decimal" placeholder="0.00" data-stake value="${esc(stake)}"><span class="suffix">${coin(c)}</span></div>
            <div class="slip-est"><span class="dim">Est. payout</span><b>${fmt.money(roundDown(c, (Number(stake) || 0) * (s.odds || 0)), c)}</b></div></div>`
              : ''
          }</div>`;
      })
      .join('');
    renderFoot();
  }

  function renderFoot() {
    const c = code();
    const total = slip.mode === 'multi' ? Number(slip.multiStake) || 0 : slip.selections.reduce((a, s) => a + (Number(slip.stakes[selKey(s)]) || 0), 0);
    const payout = slip.mode === 'multi' ? roundDown(c, total * totalOdds()) : slip.selections.reduce((a, s) => a + roundDown(c, (Number(slip.stakes[selKey(s)]) || 0) * (s.odds || 0)), 0);
    const accept = state.prefs.acceptOdds || 'higher';
    foot.innerHTML = `
      ${
        slip.mode === 'multi'
          ? `<div class="slip-multi"><div class="row between"><span class="dim">Total odds</span><b>${showOdds(totalOdds())}</b></div>
          <div class="input-suffix" style="margin-top:8px"><input class="input" inputmode="decimal" placeholder="Stake" data-multi value="${esc(slip.multiStake)}"><span class="suffix">${coin(c)}</span></div></div>`
          : ''
      }
      <div class="row between slip-line"><span class="dim">Total stake</span><b>${fmt.money(total, c)} ${coin(c)}</b></div>
      <div class="row between slip-line"><span class="dim">Est. payout</span><b class="win-text">${fmt.money(payout, c)} ${coin(c)}</b></div>
      <div class="slip-settings"><select class="select slip-format" aria-label="Odds format"><option value="decimal" ${oddsFormat() === 'decimal' ? 'selected' : ''}>Decimal</option><option value="fractional" ${oddsFormat() === 'fractional' ? 'selected' : ''}>Fractional</option><option value="american" ${oddsFormat() === 'american' ? 'selected' : ''}>American</option></select>
      <select class="select slip-accept" aria-label="Odds changes"><option value="higher" ${accept === 'higher' ? 'selected' : ''}>Accept higher odds</option><option value="any" ${accept === 'any' ? 'selected' : ''}>Accept any odds change</option><option value="none" ${accept === 'none' ? 'selected' : ''}>Don’t accept odds changes</option></select></div>
      <button class="btn btn-primary btn-block btn-lg" data-act="place" ${placing ? 'disabled' : ''}>${changedNotice ? 'Accept new odds & bet' : 'Place Bet'}</button>
      <button class="link slip-clear" data-act="clear">Clear all</button>`;
  }

  on(root, 'click', '[data-act=close]', () => onClose());
  on(root, 'click', '[data-mode]', (e, b) => {
    if (b.disabled) return;
    slip.mode = b.dataset.mode;
    persist();
  });
  on(root, 'click', '[data-remove]', (e, b) => {
    const key = b.closest('[data-key]').dataset.key;
    slip.selections = slip.selections.filter((s) => selKey(s) !== key);
    delete slip.stakes[key];
    persist();
  });
  on(root, 'click', '[data-act=clear]', () => clearSlip());
  on(root, 'change', '.slip-accept', (e, s) => savePrefs({ acceptOdds: s.value }));
  on(root, 'change', '.slip-format', (e, s) => savePrefs({ oddsFormat: s.value }));
  root.addEventListener('input', (e) => {
    if (e.target.matches('[data-stake]')) {
      const key = e.target.closest('[data-key]').dataset.key;
      slip.stakes[key] = e.target.value;
      const s = slip.selections.find((x) => selKey(x) === key);
      e.target.closest('.slip-sel').querySelector('.slip-est b').textContent = fmt.money(roundDown(code(), (Number(e.target.value) || 0) * (s?.odds || 0)), code());
    } else if (e.target.matches('[data-multi]')) slip.multiStake = e.target.value;
    else return;
    try {
      localStorage.setItem(KEY, JSON.stringify(slip));
    } catch {
      /* ignore */
    }
    const focused = e.target;
    const pos = focused.selectionStart;
    renderFoot();
    if (focused.matches('[data-multi]')) {
      const m = foot.querySelector('[data-multi]');
      m.focus();
      m.setSelectionRange(pos, pos);
    }
  });

  on(root, 'click', '[data-act=place]', async () => {
    if (placing) return;
    await ensureSession();
    const c = code();
    const accept = state.prefs.acceptOdds || 'higher';
    const toPlace =
      slip.mode === 'multi'
        ? [{ selections: slip.selections, stake: Number(slip.multiStake) || 0 }]
        : slip.selections.map((s) => ({ selections: [s], stake: Number(slip.stakes[selKey(s)]) || 0, key: selKey(s) }));
    if (toPlace.some((b) => !(b.stake > 0))) return toast({ type: 'error', title: 'Enter a stake', message: slip.mode === 'multi' ? 'Set a stake for your multi.' : 'Set a stake for every selection.' });
    const total = toPlace.reduce((a, b) => a + b.stake, 0);
    if (total > balanceOf(c) + 1e-12) return toast({ type: 'error', title: 'Insufficient balance', message: `You need ${fmt.money(total, c)} ${c}.`, action: { label: 'Deposit', href: '?modal=wallet&tab=deposit' } });
    if (slip.selections.some((s) => s.suspended)) return toast({ type: 'error', title: 'Remove suspended selections', message: 'Some markets are suspended or closed.' });
    placing = true;
    renderFoot();
    let placed = 0;
    try {
      for (const b of toPlace) {
        const res = await api.post('/api/sports/bet', {
          selections: b.selections.map((s) => ({ matchId: s.matchId, market: s.market, outcome: s.outcome, odds: s.odds })),
          stake: b.stake,
          currency: c,
          acceptOdds: changedNotice ? 'any' : accept,
        });
        setUser(res.user);
        placed++;
        if (b.key) {
          slip.selections = slip.selections.filter((s) => selKey(s) !== b.key);
          delete slip.stakes[b.key];
        }
      }
      if (slip.mode === 'multi') {
        slip.selections = [];
        slip.multiStake = '';
      }
      changedNotice = false;
      toastSuccess(placed > 1 ? `${placed} bets placed` : 'Bet placed', 'Track it in My Bets.');
      bus.emit('sports:placed');
    } catch (err) {
      if (err.code === 'odds_changed' && err.data?.changes) {
        for (const ch of err.data.changes) {
          const s = slip.selections.find((x) => x.matchId === ch.matchId && x.market === ch.market && x.outcome === ch.outcome);
          if (s) s.odds = ch.odds;
        }
        changedNotice = true;
        toast({ type: 'info', title: 'Odds changed', message: 'Review the new odds, then confirm.' });
      } else toastError(err);
    } finally {
      placing = false;
      persist();
    }
  });

  // Keep odds current while the slip is open.
  async function refresh() {
    const ids = [...new Set(slip.selections.map((s) => s.matchId))];
    if (!ids.length) return;
    const views = await Promise.all(ids.map((id) => api.get(`/api/sports/match/${encodeURIComponent(id)}`).catch(() => null)));
    let changed = false;
    for (const v of views) {
      if (!v) continue;
      const m = v.match;
      for (const s of slip.selections.filter((x) => x.matchId === m.id)) {
        const o = m.markets.find((x) => x.key === s.market)?.outcomes.find((x) => x.key === s.outcome);
        const odds = o?.odds ?? null;
        const suspended = !odds;
        if ((odds && odds !== s.odds) || suspended !== !!s.suspended || (m.status === 'live') !== !!s.live) {
          if (odds) s.odds = odds;
          s.suspended = suspended;
          s.live = m.status === 'live';
          changed = true;
        }
      }
    }
    if (changed) persist();
  }
  const timer = setInterval(() => refresh().catch(() => {}), 3000);
  refresh().catch(() => {});
  const offs = [bus.on('slip', render), bus.on('currency', render), bus.on('prefs', render)];
  render();
  return {
    destroy() {
      clearInterval(timer);
      offs.forEach((f) => f());
      root.remove();
    },
  };
}
