import { el, esc, on } from '../dom.js';
import { icon, coin } from '../icons.js';
import { api } from '../api.js';
import { state, setUser, bus } from '../state.js';
import { toastSuccess, toastError } from '../ui/toast.js';
import { countdown } from '../ui/challenges.js';
import * as fmt from '../format.js';

const TABS = [
  ['progress', 'Progress'],
  ['benefits', 'Benefits'],
  ['rakeback', 'Rakeback'],
  ['reload', 'Reload'],
  ['bonuses', 'Bonuses'],
];
const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Obsidian'];
// Benefit → first tier that has it.
const BENEFITS = [
  ['Rakeback', 'Bronze', 'A share of the house edge on every bet, claim any time'],
  ['Weekly bonus', 'Bronze', 'Every Saturday, based on what you played that week'],
  ['Monthly bonus', 'Bronze', 'On the 15th, based on the last 30 days'],
  ['Level-up bonus', 'Bronze', 'A one-off reward each time you reach a new level'],
  ['Daily bonus', 'Bronze', '10% of yesterday’s house edge, from 00:00 UTC'],
  ['Bonus growth', 'Silver', 'Higher weekly and monthly rates as you climb'],
  ['Daily reload', 'Platinum', 'A week of daily claims sized to your recent play'],
  ['Custom benefits', 'Diamond', 'Bigger rates and tailored rewards'],
];
const KIND = { weekly: ['Weekly bonus', 'gift'], monthly: ['Monthly bonus', 'gift'], levelup: ['Level-up bonus', 'crown'], reload: ['Reload', 'refresh'], daily: ['Daily bonus', 'clock'] };

export default async function vipPage(page, params = {}) {
  document.title = 'VIP Club — Fakesino';
  let tab = new URLSearchParams(location.search).get('tab') || 'progress';
  if (!TABS.some(([k]) => k === tab)) tab = 'progress';
  const root = el(`<div><div class="page-title">${icon('crown', 22)} VIP Club</div>
    <div class="tabs vip-tabs">${TABS.map(([k, l]) => `<button class="tab ${k === tab ? 'active' : ''}" data-t="${k}">${l}</button>`).join('')}</div>
    <div class="vip-body"></div></div>`);
  page.appendChild(root);
  const body = root.querySelector('.vip-body');
  let data = null;

  async function load() {
    if (!state.user) return;
    try {
      data = await api.get('/api/bonus/offers');
    } catch {
      data = null;
    }
  }

  function hero() {
    const u = state.user;
    const vip = u?.vip;
    return `<div class="vip-hero"><div>${
      u
        ? `<div class="muted">Your VIP progress</div>
        <div style="font-size:26px;font-weight:900;color:${vip.color}">${esc(vip.level === 'None' ? 'No VIP level yet' : vip.level)}</div>
        <div class="vip-progress"><div class="row between muted" style="font-size:13px"><span>${(vip.progress * 100).toFixed(2)}%</span><span>${vip.next ? `Next: ${esc(vip.next)} at ${fmt.fiat(vip.nextWager)} wagered` : 'Top level reached'}</span></div>
        <div class="progress"><div style="width:${vip.progress * 100}%;background:${vip.color}"></div></div>
        <div class="muted" style="font-size:13px">Total wagered ${fmt.fiat(vip.wageredUsd)}</div></div>`
        : `<div style="font-size:24px;font-weight:900">Climb the ranks as you play</div><p class="muted">Every bet counts toward your VIP level.</p>`
    }</div><svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="${vip?.color || '#f5b83d'}" stroke-width="1.4" class="hide-mobile"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z"/></svg></div>`;
  }

  const offerRow = (o, upcoming = false) => {
    const [label, ic] = KIND[o.kind] || ['Bonus', 'gift'];
    return `<div class="bonus-row"><span class="nt-ic">${icon(ic, 16)}</span><div class="bonus-text"><b>${esc(label)}</b>${o.note ? ` <span class="dim">· ${esc(o.note)}</span>` : ''}
      <div class="dim" style="font-size:12px">${upcoming ? `Available in ${countdown(o.releasedAt - Date.now())}` : `Expires in <span data-ends="${o.expiresAt}">${countdown(o.expiresAt - Date.now())}</span>`}</div></div>
      <b class="bonus-amt">${fmt.fiat(o.amountUsd)}</b>${upcoming ? '' : `<button class="btn btn-primary btn-sm" data-claim="${esc(o.id)}">Claim</button>`}</div>`;
  };

  function render() {
    const u = state.user;
    root.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('active', b.dataset.t === tab));
    if (tab === 'progress') {
      const levels = state.config.vipLevels;
      body.innerHTML = `${hero()}<div class="section-title">${icon('star', 18)} Levels</div>
        <div class="vip-levels">${levels
          .filter((l) => l.name !== 'None')
          .map((l, i) => `<div class="vip-level ${u?.vip.level === l.name ? 'current' : ''}"><div class="name" style="color:${l.color}">${icon('crown', 18)} ${esc(l.name)}</div>
          <div class="muted" style="font-size:12px;margin-top:4px">${fmt.fiat(l.wager)} wagered</div></div>`)
          .join('')}</div>`;
    } else if (tab === 'benefits') {
      const cur = u?.vip.level?.split(' ')[0];
      body.innerHTML = `<div class="table-wrap"><table class="table vip-matrix"><thead><tr><th>Benefit</th>${TIERS.map((t) => `<th class="c ${t === cur ? 'cur' : ''}">${t}</th>`).join('')}</tr></thead><tbody>${BENEFITS.map(
        ([name, from, desc]) => `<tr><td><b>${esc(name)}</b><div class="dim" style="font-size:12px">${esc(desc)}</div></td>${TIERS.map((t) => `<td class="c ${t === cur ? 'cur' : ''}">${TIERS.indexOf(t) >= TIERS.indexOf(from) ? `<span class="win-text">${icon('check', 16)}</span>` : '<span class="dim">—</span>'}</td>`).join('')}</tr>`,
      ).join('')}</tbody></table></div>`;
    } else if (tab === 'rakeback') {
      if (!u) return (body.innerHTML = '<div class="spinner"></div>');
      const items = Object.entries(u.rakeback).filter(([c, v]) => v >= 10 ** -(c === 'USD' || c === 'EUR' ? 2 : 8));
      body.innerHTML = `<div class="card"><div class="row between"><b>${icon('coins', 18)} Rakeback</b><span class="pill green">5% of the house edge</span></div>
        ${
          data && !data.rakebackUnlocked
            ? `<div class="demo-notice" style="margin-top:12px">${icon('lock', 16)}<div>Unlocks at Bronze ($10,000 wagered) or with a welcome code.</div></div>`
            : `<div class="muted" style="font-size:13px;margin:8px 0 12px">A slice of the house edge on every bet, ready to claim any time.</div>
          <div class="stack" style="gap:6px;margin-bottom:12px">${items.length ? items.map(([c, v]) => `<div class="row between"><span class="row">${coin(c)} ${c}</span><b>${fmt.amount(v, c)}</b></div>`).join('') : '<div class="dim">Nothing accumulated yet — play a few rounds.</div>'}</div>
          <button class="btn btn-primary btn-block" data-act="rakeback" ${items.length ? '' : 'disabled'}>Claim rakeback</button>`
        }</div>`;
    } else if (tab === 'reload') {
      const d = data?.daily;
      const reloads = (data?.offers || []).filter((o) => o.kind === 'reload');
      const upcoming = (data?.upcoming || []).filter((o) => o.kind === 'reload');
      body.innerHTML = `<div class="reward-cards">
        <div class="card"><div class="row between"><b>${icon('clock', 18)} Daily bonus</b><span class="pill blue">Bronze+</span></div>
          <div class="muted" style="font-size:13px;margin:8px 0 12px">10% of the house edge you played yesterday, claimable once a day from 00:00 UTC.</div>
          ${
            !d
              ? '<div class="spinner"></div>'
              : !d.unlocked
                ? `<div class="demo-notice">${icon('lock', 16)}<div>Unlocks at Bronze ($10,000 wagered).</div></div>`
                : d.claimed
                  ? `<button class="btn btn-secondary btn-block" disabled>Next in ${countdown(d.nextAt - Date.now())}</button>`
                  : `<button class="btn btn-blue btn-block" data-act="daily" ${d.amountUsd >= 0.01 ? '' : 'disabled'}>${d.amountUsd >= 0.01 ? `Claim ${fmt.fiat(d.amountUsd)}` : 'Nothing to claim — play today for tomorrow'}</button>`
          }</div>
        <div class="card"><div class="row between"><b>${icon('refresh', 18)} Reload</b><span class="pill blue">Platinum+</span></div>
          <div class="muted" style="font-size:13px;margin:8px 0 12px">Each Saturday, Platinum players get a week of daily reload claims sized to their recent play. Each claim is valid for 24 hours.</div>
          ${reloads.length || upcoming.length ? reloads.map((o) => offerRow(o)).join('') + upcoming.map((o) => offerRow(o, true)).join('') : '<div class="dim">No reloads right now.</div>'}</div></div>`;
    } else {
      const offers = data?.offers || [];
      const upcoming = (data?.upcoming || []).filter((o) => o.kind !== 'reload');
      body.innerHTML = `<div class="card"><div class="row between"><b>${icon('gift', 18)} Unclaimed bonuses</b>${data ? `<span class="dim" style="font-size:12px">Next weekly ${countdown(data.nextWeeklyAt - Date.now())} · monthly ${countdown(data.nextMonthlyAt - Date.now())}</span>` : ''}</div>
        <div class="bonus-list">${offers.length ? offers.map((o) => offerRow(o)).join('') : `<div class="empty" style="padding:20px">${icon('gift', 26)}<div>No bonuses to claim right now.</div></div>`}
        ${upcoming.map((o) => offerRow(o, true)).join('')}</div>
        <div class="muted" style="font-size:12px;margin-top:10px">Weekly bonuses arrive every Saturday at 12:30 UTC and monthly bonuses on the 15th, for Bronze and above. Bonuses are play money with no wagering requirement and expire after 90 days.</div></div>`;
    }
  }

  on(root, 'click', '[data-t]', (e, b) => {
    tab = b.dataset.t;
    history.replaceState(null, '', tab === 'progress' ? '/vip' : `/vip?tab=${tab}`);
    render();
  });
  on(body, 'click', '[data-claim]', async (e, b) => {
    b.disabled = true;
    try {
      const r = await api.post('/api/bonus/claim', { id: b.dataset.claim, currency: state.user.currency });
      setUser(r.user);
      data = r;
      toastSuccess('Bonus claimed', `${fmt.money(r.amount, r.currency)} added to your wallet`);
      render();
    } catch (err) {
      b.disabled = false;
      toastError(err);
    }
  });
  on(body, 'click', '[data-act=rakeback]', async (e, b) => {
    b.disabled = true;
    try {
      const { user, claimed } = await api.post('/api/bonus/rakeback');
      setUser(user);
      toastSuccess('Rakeback claimed', Object.entries(claimed).map(([c, v]) => `${fmt.amount(v, c)} ${c}`).join(', '));
      render();
    } catch (err) {
      b.disabled = false;
      toastError(err);
    }
  });
  on(body, 'click', '[data-act=daily]', async (e, b) => {
    b.disabled = true;
    try {
      const r = await api.post('/api/bonus/daily', { currency: state.user.currency });
      setUser(r.user);
      data = r;
      toastSuccess('Daily bonus claimed', `${fmt.money(r.amount, r.currency)} added to your wallet`);
      render();
    } catch (err) {
      b.disabled = false;
      toastError(err);
    }
  });

  render();
  await load();
  render();
  const off = bus.on('live:notification', async (n) => {
    if (n.kind === 'bonus' || n.kind === 'vip') {
      await load();
      render();
    }
  });
  const tick = setInterval(() => body.querySelectorAll('[data-ends]').forEach((x) => (x.textContent = countdown(Number(x.dataset.ends) - Date.now()))), 1000);
  return () => {
    off();
    clearInterval(tick);
  };
}
