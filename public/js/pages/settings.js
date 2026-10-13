import { el, esc, on } from '../dom.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { state, setUser, bus, savePrefs } from '../state.js';
import { toastSuccess, toastError } from '../ui/toast.js';
import { showFieldErrors } from '../ui/auth.js';
import { brandChip } from '../ui/wallet.js';
import * as fmt from '../format.js';

const TABS = [
  ['general', 'General'],
  ['security', 'Security'],
  ['preferences', 'Preferences'],
  ['payments', 'Saved cards'],
];

export default function settingsPage(page, { tab = 'general' }) {
  document.title = 'Settings — Fakesino';
  if (!state.user) {
    page.innerHTML = `<div class="empty" style="padding:80px 0">${icon('lock', 32)}<div style="margin:10px 0 16px">Sign in to change your settings.</div><a class="btn btn-blue" href="?modal=auth&tab=login">Sign In</a></div>`;
    return;
  }
  if (!TABS.some(([k]) => k === tab)) tab = 'general';
  const root = el(`<div><div class="page-title">${icon('settings', 22)} Settings</div>
    <div class="settings-layout"><nav class="settings-nav">${TABS.map(([k, l]) => `<a href="/settings/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`).join('')}</nav><div class="card body"></div></div></div>`);
  page.appendChild(root);
  const body = root.querySelector('.body');
  const u = state.user;

  if (tab === 'general') {
    body.innerHTML = `<h3 style="margin-top:0">Account</h3>
      <div class="field"><div class="field-label">Username</div><input class="input" readonly value="${esc(u.username)}"></div>
      <div class="field"><div class="field-label">Email</div><input class="input" readonly value="${esc(u.email)}"></div>
      <div class="field"><div class="field-label">Member since</div><input class="input" readonly value="${esc(fmt.dateTime(u.createdAt))}"></div>
      <div class="demo-notice">${icon('info', 16)}<div>No identity verification is needed — there's no real money to protect.</div></div>`;
  } else if (tab === 'security') {
    body.innerHTML = `<h3 style="margin-top:0">Change password</h3><form novalidate style="max-width:420px">
      <div class="field" data-field="current"><label class="field-label">Current password</label><input class="input" type="password" name="current" autocomplete="current-password"><div class="field-error"></div></div>
      <div class="field" data-field="next"><label class="field-label">New password</label><input class="input" type="password" name="next" autocomplete="new-password"><div class="field-error"></div></div>
      <div class="field-error form-error" style="margin-bottom:10px"></div>
      <button class="btn btn-blue" type="submit">Save password</button></form>
      <div class="divider"></div><div class="muted" style="font-size:13px">Changing your password signs you out everywhere else.</div>`;
    body.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await api.post('/api/account/password', { current: f.current.value, next: f.next.value });
        f.reset();
        toastSuccess('Password updated');
      } catch (err) {
        showFieldErrors(f, err);
      }
    });
  } else if (tab === 'preferences') {
    const rows = [
      ['privateMode', 'Ghost mode', 'Hide your username in public bet feeds, the leaderboard and crash rounds.', 'server'],
      ['hideZero', 'Hide zero balances', 'Only show currencies with a balance in the wallet dropdown.', 'server'],
      ['displayFiat', 'Display crypto in fiat', 'Show crypto balances and bets as their USD value.', 'server'],
      ['sound', 'Game sounds', 'Play sound effects in games.', 'local'],
      ['animations', 'Animations', 'Animate game results. Turn off for instant results.', 'local'],
      ['hotkeys', 'Hotkeys', 'Space to bet, S/A to double/halve, D to zero your bet.', 'local'],
    ];
    body.innerHTML = `<h3 style="margin-top:0">Preferences</h3>${rows
      .map(([k, t, d, where]) => {
        const v = where === 'server' ? u.settings[k] : state.prefs[k] !== false && (k !== 'hotkeys' || state.prefs.hotkeys);
        return `<label class="setting-row"><div><div class="t">${t}</div><div class="d">${d}</div></div><input type="checkbox" class="toggle" data-k="${k}" data-where="${where}" ${v ? 'checked' : ''}></label>`;
      })
      .join('')}`;
    on(body, 'change', 'input[data-k]', async (e, input) => {
      const k = input.dataset.k;
      if (input.dataset.where === 'local') {
        savePrefs({ [k]: input.checked });
        return;
      }
      try {
        const { user } = await api.post('/api/account/settings', { [k]: input.checked });
        setUser(user);
        bus.emit('user-settings', user.settings);
      } catch (err) {
        input.checked = !input.checked;
        toastError(err);
      }
    });
  } else if (tab === 'payments') {
    const render = () => {
      const cards = state.user.cards || [];
      body.innerHTML = `<h3 style="margin-top:0">Saved cards</h3>
        ${cards.length ? `<div class="method-list">${cards.map((c) => `<div class="method">${icon('card', 20)}<div><div class="m-title">•••• ${esc(c.last4)}</div><div class="m-sub">${esc(c.name)} · Expires ${String(c.expMonth).padStart(2, '0')}/${String(c.expYear).slice(-2)}</div></div><div class="m-right">${brandChip(c.brand)}<button class="icon-btn" data-remove="${c.id}" data-tip="Remove">${icon('trash', 16)}</button></div></div>`).join('')}</div>` : `<div class="empty">No saved cards. Save one during a <a class="link" href="?modal=wallet&tab=deposit">deposit</a>.</div>`}
        <div class="demo-notice" style="margin-top:14px">${icon('lock', 16)}<div>Only demo cards can be saved, and only the last four digits are shown.</div></div>`;
    };
    render();
    on(body, 'click', '[data-remove]', async (e, b) => {
      try {
        const { user } = await api.post(`/api/payments/cards/${b.dataset.remove}/remove`);
        setUser(user);
        render();
      } catch (err) {
        toastError(err);
      }
    });
  }
}
