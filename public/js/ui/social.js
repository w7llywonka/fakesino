import { el, esc, on } from '../dom.js';
import { icon, coin } from '../icons.js';
import { api } from '../api.js';
import { state, savePrefs, currency, balanceOf } from '../state.js';
import { setQuery } from '../router.js';
import { CURRENCIES, CURRENCY_CODES } from '../shared/currencies.js';
import { openModal } from './modal.js';
import { toast, toastSuccess, toastError } from './toast.js';
import { showFieldErrors, twoFactorField } from './forms.js';
import * as fmt from '../format.js';

export const ignored = () => state.prefs.ignored || [];
export function setIgnored(name, on) {
  const list = ignored().filter((n) => n.toLowerCase() !== name.toLowerCase());
  if (on) list.push(name);
  savePrefs({ ignored: list });
}

export async function openTip(username = '', amount = null) {
  const { prefillTip } = await import('./wallet.js');
  prefillTip(username, amount);
  setQuery({ modal: 'wallet', tab: 'tip' });
}

// Public profile: VIP level, join date and stats (unless in ghost mode).
export async function openProfile(username) {
  const modal = openModal({ title: 'Profile', iconName: 'user' });
  modal.setBody('<div class="spinner"></div>');
  let user;
  try {
    ({ user } = await api.get(`/api/users/${encodeURIComponent(username)}`));
  } catch (err) {
    modal.setBody(`<div class="empty">${esc(err.message)}</div>`);
    return modal;
  }
  const me = state.user?.username === user.username;
  const s = user.stats;
  const body = el(`<div class="pf">
    <div class="pf-head"><div class="pf-avatar">${esc(user.username.slice(0, 2).toUpperCase())}</div>
      <div><div class="pf-name">${esc(user.username)}</div><div class="pf-vip" style="color:${user.vip.color}">${icon('crown', 14)} ${user.vip.level === 'None' ? 'No VIP level yet' : esc(user.vip.level)}</div>
      <div class="dim" style="font-size:12px">Joined ${esc(new Date(user.joined).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }))}</div></div></div>
    ${
      s
        ? `<div class="bet-grid pf-stats"><div><div class="k">Bets</div><div class="v">${s.bets.toLocaleString()}</div></div><div><div class="k">Wins</div><div class="v">${s.wins.toLocaleString()}</div></div><div><div class="k">Wagered</div><div class="v">${fmt.fiat(s.wageredUsd)}</div></div></div>`
        : `<div class="demo-notice">${icon('eyeOff', 16)}<div>This player keeps their statistics private.</div></div>`
    }
    ${me || !state.user ? '' : `<div class="row" style="gap:8px;margin-top:14px"><button class="btn btn-primary" data-act="tip" style="flex:1">${icon('coins', 16)} Tip</button><button class="btn btn-secondary" data-act="ignore" style="flex:1">${ignored().some((n) => n.toLowerCase() === user.username.toLowerCase()) ? 'Unignore' : 'Ignore'}</button></div>`}
  </div>`);
  modal.setBody(body);
  on(body, 'click', '[data-act=tip]', () => {
    modal.close();
    openTip(user.username);
  });
  on(body, 'click', '[data-act=ignore]', (e, b) => {
    const now = b.textContent === 'Ignore';
    setIgnored(user.username, now);
    b.textContent = now ? 'Unignore' : 'Ignore';
    toast({ title: now ? `${user.username} ignored` : `${user.username} unignored` });
  });
  return modal;
}

export function openRain(prefill = {}) {
  let code = prefill.currency && CURRENCIES[prefill.currency] ? prefill.currency : currency();
  const body = el(`<form class="rain" novalidate>
    <div class="demo-notice">${icon('coins', 16)}<div>Amount will be shared evenly with all users in the Rain — the most recent chatters in this room over the last 30 minutes.</div></div>
    <div class="field" data-field="currency"><div class="field-label">Currency</div><select class="select" name="currency">${CURRENCY_CODES.map((c) => `<option ${c === code ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div class="field" data-field="amount"><div class="field-label"><span>Amount</span><span class="aux dim"></span></div><input class="input" name="amount" inputmode="decimal" value="${esc(prefill.amount ?? '')}"><div class="field-error"></div></div>
    <div class="field" data-field="users"><div class="field-label">Number of users (1–50)</div><input class="input" name="users" inputmode="numeric" value="${esc(prefill.users ?? 10)}"><div class="field-error"></div></div>
    ${twoFactorField(state.user)}
    <div class="field-error form-error" style="margin-bottom:10px"></div>
    <button class="btn btn-primary btn-block btn-lg" type="submit">Make it rain</button></form>`);
  const modal = openModal({ title: 'Rain', iconName: 'coins', body });
  const aux = body.querySelector('.aux');
  const updateAux = () => (aux.textContent = `Balance ${fmt.money(balanceOf(code), code)}`);
  updateAux();
  body.currency.addEventListener('change', () => {
    code = body.currency.value;
    updateAux();
  });
  body.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api.post('/api/rain', { amount: Number(body.amount.value), currency: code, users: Number(body.users.value), room: state.prefs.chatRoom || 'en', code: body.code?.value });
      toastSuccess('It rained!', `${r.users} user${r.users > 1 ? 's' : ''} got ${fmt.money(r.share, code)} each`);
      modal.close();
    } catch (err) {
      showFieldErrors(body, err);
    }
  });
  return modal;
}

export function openChatRules() {
  return openModal({
    title: 'Chat rules',
    iconName: 'chat',
    body: `<ol class="rules">
      <li>Be kind. No harassment, hate speech or threats.</li>
      <li>No spam, flooding or repeated messages.</li>
      <li>No begging for tips, rain or play money.</li>
      <li>Don't share personal information — yours or anyone else's.</li>
      <li>No links to other sites, scams or referral codes.</li>
      <li>Everything here is play money. Nothing can be bought, sold or cashed out.</li>
      <li>Use the room for your language.</li></ol>`,
  });
}
