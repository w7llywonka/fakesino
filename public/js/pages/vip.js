import { el, esc } from '../dom.js';
import { icon, coin } from '../icons.js';
import { api } from '../api.js';
import { state, setUser } from '../state.js';
import { toastSuccess, toastError } from '../ui/toast.js';
import * as fmt from '../format.js';

const PERKS = {
  None: ['Rakeback on every bet', 'Daily reload'],
  Bronze: ['Rakeback on every bet', 'Bigger daily reload', 'Bronze badge in chat'],
  Silver: ['Everything in Bronze', 'Larger daily reload'],
  Gold: ['Everything in Silver', 'Even larger daily reload'],
  Platinum: ['Everything in Gold', 'Platinum chat badge', 'Top-tier reloads'],
  Diamond: ['Everything in Platinum', 'Maximum daily reload', 'Diamond badge'],
};

export default async function vipPage(page) {
  document.title = 'VIP Club — Fakesino';
  const root = el('<div></div>');
  page.appendChild(root);
  const render = async () => {
    let levels = state.config.vipLevels;
    const u = state.user;
    const vip = u?.vip;
    const rakeback = u ? Object.entries(u.rakeback).filter(([c, v]) => v >= 10 ** -(c === 'USD' || c === 'EUR' ? 2 : 8)) : [];
    const wait = u ? Math.max(0, u.dailyBonusAt + 86400000 - Date.now()) : 0;
    root.innerHTML = `<div class="page-title">${icon('crown', 22)} VIP Club</div>
      <div class="vip-hero">
        <div>
          ${
            u
              ? `<div class="muted">Your VIP progress</div>
          <div style="font-size:26px;font-weight:900;color:${vip.color}">${esc(vip.level)}</div>
          <div class="vip-progress"><div class="row between muted" style="font-size:13px"><span>${(vip.progress * 100).toFixed(2)}%</span><span>${vip.next ? `Next: ${esc(vip.next)} at ${fmt.fiat(vip.nextWager)} wagered` : 'Top level reached'}</span></div>
          <div class="progress"><div style="width:${vip.progress * 100}%;background:${vip.color}"></div></div>
          <div class="muted" style="font-size:13px">Total wagered ${fmt.fiat(vip.wageredUsd)}</div></div>`
              : `<div style="font-size:24px;font-weight:900">Climb the ranks as you play</div><p class="muted">Every bet counts toward your VIP level. Higher levels unlock bigger reloads.</p><a class="btn btn-blue" href="?modal=auth&tab=register">Join now</a>`
          }
        </div>
        <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="${vip?.color || '#f5b83d'}" stroke-width="1.4" class="hide-mobile">${'<path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z"/>'}</svg>
      </div>
      ${
        u
          ? `<div class="reward-cards">
        <div class="card"><div class="row between"><b>${icon('coins', 18)} Rakeback</b><span class="pill green">5% of edge</span></div>
          <div class="muted" style="font-size:13px;margin:8px 0 12px">A slice of the house edge on every bet, ready to claim any time.</div>
          <div class="stack" style="gap:6px;margin-bottom:12px">${rakeback.length ? rakeback.map(([c, v]) => `<div class="row between"><span class="row">${coin(c)} ${c}</span><b>${fmt.amount(v, c)}</b></div>`).join('') : '<div class="dim">Nothing accumulated yet — play a few rounds.</div>'}</div>
          <button class="btn btn-primary btn-block" data-act="rakeback" ${rakeback.length ? '' : 'disabled'}>Claim rakeback</button></div>
        <div class="card"><div class="row between"><b>${icon('gift', 18)} Daily Reload</b><span class="pill blue">${fmt.fiat(25 * (vip.index + 1))}</span></div>
          <div class="muted" style="font-size:13px;margin:8px 0 12px">Free play money every 24 hours, paid in your selected currency. Scales with VIP level.</div>
          <button class="btn btn-blue btn-block" data-act="daily" ${wait ? 'disabled' : ''}>${wait ? `Available in ${fmt.duration(wait)}` : 'Claim reload'}</button></div>
      </div>`
          : ''
      }
      <div class="section-title">${icon('star', 18)} Levels</div>
      <div class="vip-levels">${levels
        .map((l) => {
          const perks = PERKS[l.name.split(' ')[0]] || PERKS.None;
          return `<div class="vip-level ${vip?.level === l.name ? 'current' : ''}"><div class="name" style="color:${l.color}">${icon('crown', 18)} ${esc(l.name)}</div>
          <div class="muted" style="font-size:12px;margin-top:4px">${fmt.fiat(l.wager)} wagered · Reload ${fmt.fiat(25 * (levels.indexOf(l) + 1))}</div>
          <ul>${perks.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
        })
        .join('')}</div>`;
    root.querySelector('[data-act=rakeback]')?.addEventListener('click', async (e) => {
      e.currentTarget.classList.add('loading');
      try {
        const { user, claimed } = await api.post('/api/bonus/rakeback');
        setUser(user);
        toastSuccess('Rakeback claimed', Object.entries(claimed).map(([c, v]) => `${fmt.amount(v, c)} ${c}`).join(', '));
        render();
      } catch (err) {
        toastError(err);
        render();
      }
    });
    root.querySelector('[data-act=daily]')?.addEventListener('click', async (e) => {
      e.currentTarget.classList.add('loading');
      try {
        const { user, transaction } = await api.post('/api/bonus/daily');
        setUser(user);
        toastSuccess('Daily reload claimed', `${fmt.amount(transaction.amount, transaction.currency)} ${transaction.currency} added`);
        render();
      } catch (err) {
        toastError(err);
        render();
      }
    });
  };
  await render();
}
