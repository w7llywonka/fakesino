import { el, esc, on, copyText } from '../dom.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { state, setUser, bus, savePrefs, deviceId, useWalletKey, newWallet } from '../state.js';
import { toastSuccess, toastError, toast } from '../ui/toast.js';
import { showFieldErrors } from '../ui/forms.js';
import { brandChip } from '../ui/wallet.js';
import { qrSvg } from '../shared/qr.js';
import { LANGUAGES, currentLanguage, setLanguage } from '../i18n.js';
import * as fmt from '../format.js';

const TABS = [
  ['general', 'General'],
  ['preferences', 'Preferences'],
  ['security', 'Security'],
  ['offers', 'Offers'],
  ['payments', 'Saved cards'],
  ['limits', 'Responsible Gaming'],
];

export default function settingsPage(page, { tab = 'general' }) {
  document.title = 'Settings — Fakesino';
  if (!state.user) {
    page.innerHTML = '<div class="spinner"></div>';
    return;
  }
  if (!TABS.some(([k]) => k === tab)) tab = 'general';
  const root = el(`<div><div class="page-title">${icon('settings', 22)} Settings</div>
    <div class="settings-layout"><nav class="settings-nav">${TABS.map(([k, l]) => `<a href="/settings/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`).join('')}</nav><div class="card body"></div></div></div>`);
  page.appendChild(root);
  const body = root.querySelector('.body');
  const u = state.user;

  if (tab === 'general') {
    const key = deviceId();
    body.innerHTML = `<h3 style="margin-top:0">Profile</h3>
      <form class="name-form" novalidate style="max-width:460px">
        <div class="field" data-field="username"><label class="field-label">Username</label>
          <div class="input-group"><input class="input" name="username" maxlength="14" value="${esc(u.username)}" autocomplete="off"><button class="addon" type="submit" style="padding:0 16px">Save</button></div>
          <div class="dim" style="font-size:12px">Shown in chat, live bets and the leaderboard. 3–14 letters, numbers or _.</div><div class="field-error"></div></div>
      </form>
      <div class="field" style="max-width:460px"><div class="field-label">Playing since</div><input class="input" readonly value="${esc(fmt.dateTime(u.createdAt))}"></div>
      <div class="divider"></div>
      <h3 id="backup">Wallet backup</h3>
      <div class="demo-notice">${icon('info', 16)}<div>There are no accounts — your play money is saved in this browser. Keep this key to open the same wallet in another browser or after clearing site data.</div></div>
      <div class="field" style="max-width:640px"><div class="field-label">Your wallet key</div>
        <div class="input-group"><input class="input mono" data-role="key" type="password" readonly value="${esc(key)}" style="font-size:12.5px">
          <button class="addon" type="button" data-act="reveal" data-tip="Show / hide">${icon('eye', 16)}</button><button class="addon" type="button" data-act="copy" data-tip="Copy">${icon('copy', 16)}</button></div></div>
      <form class="restore-form" novalidate style="max-width:640px">
        <div class="field" data-field="deviceId"><label class="field-label">Open another wallet</label>
          <div class="input-group"><input class="input mono" name="key" placeholder="Paste a wallet key" autocomplete="off" style="font-size:12.5px"><button class="addon" type="submit" style="padding:0 16px">Open</button></div>
          <div class="field-error"></div></div>
      </form>
      <button class="btn btn-ghost btn-sm" data-act="fresh">${icon('refresh', 14)} Start a new empty wallet</button>`;
    const nameForm = body.querySelector('.name-form');
    nameForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const { user } = await api.post('/api/account/username', { username: nameForm.username.value.trim() });
        setUser(user);
        toastSuccess('Username updated', user.username);
      } catch (err) {
        showFieldErrors(nameForm, err);
      }
    });
    const keyInput = body.querySelector('[data-role=key]');
    body.querySelector('[data-act=reveal]').addEventListener('click', () => (keyInput.type = keyInput.type === 'password' ? 'text' : 'password'));
    body.querySelector('[data-act=copy]').addEventListener('click', async () => {
      await copyText(key);
      toast({ type: 'success', title: 'Wallet key copied', message: 'Store it somewhere safe.' });
    });
    const restoreForm = body.querySelector('.restore-form');
    restoreForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const value = restoreForm.key.value.trim();
      if (!value || value.toLowerCase() === key) return;
      try {
        const { user } = await useWalletKey(value);
        toastSuccess('Wallet opened', `Welcome back, ${user.username}.`);
      } catch (err) {
        showFieldErrors(restoreForm, err);
      }
    });
    body.querySelector('[data-act=fresh]').addEventListener('click', async () => {
      if (!confirm('Start a new empty wallet? Copy your current wallet key first if you want to come back to it.')) return;
      try {
        await newWallet();
        toastSuccess('New wallet ready', 'Deposit some play money to get started.');
      } catch (err) {
        toastError(err);
      }
    });
    if (location.hash === '#backup') setTimeout(() => body.querySelector('#backup')?.scrollIntoView({ behavior: 'smooth' }), 50);
  } else if (tab === 'preferences') {
    const rows = [
      ['privateMode', 'Ghost mode', 'Hide your username in public bet feeds, leaderboards, big wins and live rounds.', 'server'],
      ['hideStats', 'Hide all your statistics', 'Other players can’t see your bets, wins, losses or wagered total on your profile.', 'server'],
      ['hideRaceStats', 'Hide all your race statistics', 'Show you as Hidden on the leaderboard.', 'server'],
      ['hideZero', 'Hide zero balances', 'Only show currencies with a balance in the wallet dropdown.', 'server'],
      ['displayFiat', 'Display crypto in fiat', 'Show crypto balances and bet amounts in your display currency (choose it in Wallet settings).', 'server'],
      ['sound', 'Game sounds', 'Play sound effects in games.', 'local'],
      ['animations', 'Animations', 'Animate game results. Turn off for instant results.', 'local'],
      ['hotkeys', 'Hotkeys', 'Space to bet, S/A to double/halve, D to zero your bet.', 'local'],
      ['maxBetWarning', 'Max bet warning', 'Ask before placing a bet set with the Max button.', 'server'],
    ];
    body.innerHTML = `<h3 style="margin-top:0">Preferences</h3>${rows
      .map(([k, t, d, where]) => {
        const v = where === 'server' ? u.settings[k] : state.prefs[k] !== false && (k !== 'hotkeys' || state.prefs.hotkeys);
        return `<label class="setting-row"><div><div class="t">${t}</div><div class="d">${d}</div></div><input type="checkbox" class="toggle" data-k="${k}" data-where="${where}" ${v ? 'checked' : ''}></label>`;
      })
      .join('')}
      <label class="setting-row"><div><div class="t">Language</div><div class="d">Interface language.</div></div>
        <select class="select no-i18n" data-language style="width:auto">${LANGUAGES.map(([k, n]) => `<option value="${k}" ${k === currentLanguage() ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="setting-row"><div><div class="t">Odds format</div><div class="d">How sportsbook odds are shown.</div></div>
        <select class="select" data-odds style="width:auto"><option value="decimal">Decimal (2.50)</option><option value="fractional">Fractional (3/2)</option><option value="american">American (+150)</option></select></label>
      <h3 style="margin-top:24px">Ignored users</h3><div class="ignored-list">${
        (state.prefs.ignored || []).length
          ? state.prefs.ignored.map((n) => `<span class="sr-chip"><button>${esc(n)}</button><button data-unignore="${esc(n)}" aria-label="Unignore">${icon('close', 12)}</button></span>`).join('')
          : '<div class="muted" style="font-size:13px">Nobody. Ignore players from their name in chat.</div>'
      }</div>`;
    body.querySelector('[data-language]').addEventListener('change', (e) => setLanguage(e.target.value));
    const oddsSel = body.querySelector('[data-odds]');
    oddsSel.value = state.prefs.oddsFormat || 'decimal';
    oddsSel.addEventListener('change', () => savePrefs({ oddsFormat: oddsSel.value }));
    on(body, 'click', '[data-unignore]', (e, b) => {
      savePrefs({ ignored: (state.prefs.ignored || []).filter((n) => n !== b.dataset.unignore) });
      b.parentElement.remove();
    });
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
  } else if (tab === 'limits') {
    const render = () => {
      const l = state.user.limits || {};
      const onBreak = l.breakUntil > Date.now();
      body.innerHTML = `<h3 style="margin-top:0">Deposit limit</h3>
        <p class="muted" style="margin-top:0">Cap how much play money you can deposit in any 24 hours.</p>
        <form class="limit-form" novalidate style="max-width:420px">
          <div class="field" data-field="depositDailyUsd"><label class="field-label">Daily limit (USD)</label>
            <div class="input-group"><input class="input" name="limit" inputmode="numeric" placeholder="No limit" value="${l.depositDailyUsd ?? ''}"><button class="addon" type="submit" style="padding:0 16px">Save</button></div>
            <div class="field-error"></div></div>
          ${l.depositDailyUsd != null ? '<button type="button" class="btn btn-ghost btn-sm" data-act="remove">Remove limit</button>' : ''}
        </form>
        <div class="divider"></div>
        <h3>Take a break</h3>
        ${
          onBreak
            ? `<div class="demo-notice warn">${icon('clock', 16)}<div>You're on a break until <b>${esc(fmt.dateTime(l.breakUntil))}</b>. Betting and deposits are paused until then.</div></div>`
            : `<p class="muted" style="margin-top:0">Pause betting and deposits for a while. A break can't be cancelled early.</p>
          <div class="row" style="flex-wrap:wrap;gap:8px">${[
            [24, '24 hours'],
            [168, '7 days'],
            [720, '30 days'],
          ]
            .map(([h, l2]) => `<button class="btn btn-secondary" data-break="${h}">${l2}</button>`)
            .join('')}</div>`
        }`;
      const form = body.querySelector('.limit-form');
      const save = async (value) => {
        try {
          const { user } = await api.post('/api/account/limits', { depositDailyUsd: value });
          setUser(user);
          toastSuccess(value == null ? 'Deposit limit removed' : 'Deposit limit saved');
          render();
        } catch (err) {
          showFieldErrors(form, err);
        }
      };
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = form.limit.value.trim();
        save(v === '' ? null : Number(v));
      });
      form.querySelector('[data-act=remove]')?.addEventListener('click', () => save(null));
      on(body, 'click', '[data-break]', async (e, b) => {
        if (!confirm(`Take a break for ${b.textContent}? You won't be able to bet or deposit until it ends.`)) return;
        try {
          const { user } = await api.post('/api/account/limits', { breakHours: Number(b.dataset.break) });
          setUser(user);
          render();
        } catch (err) {
          toastError(err);
        }
      });
    };
    render();
  } else if (tab === 'offers') {
    const loadOffers = () => {
    body.innerHTML = '<div class="spinner"></div>';
    api
      .get('/api/offers')
      .then(({ welcome }) => {
        const left = welcome.endsAt - Date.now();
        body.innerHTML = `<h3 style="margin-top:0">Offers</h3>
          ${
            welcome.available
              ? `<div class="offer-card"><div><div class="t">${icon('gift', 18)} Welcome offer</div><div class="d">New wallets can claim ${fmt.fiat(welcome.valueUsd)} of play money once, within 24 hours (wager it 3× before withdrawing). Code: <b class="mono">WELCOME</b> · ${Math.max(1, Math.floor(left / 3600000))}h left</div></div><button class="btn btn-primary" data-redeem="WELCOME">Claim</button></div>`
              : welcome.claimed
                ? `<div class="offer-card claimed"><div><div class="t">${icon('check', 18)} Welcome offer claimed</div><div class="d">You used the code ${esc(welcome.claimed)}.${state.user.wagering?.remainingUsd > 0 ? ` $${state.user.wagering.remainingUsd.toFixed(2)} left to wager.` : ''}</div></div></div>`
                : ''
          }
          <form class="offer-form" novalidate><div class="field"><div class="field-label">Redeem bonus drop</div>
            <div class="input-group"><input class="input mono" name="code" placeholder="Enter a code" autocomplete="off"><button class="btn btn-primary" type="submit">Redeem</button></div></div>
            <div class="muted" style="font-size:12px">Bonus drops are posted in chat by DropBot every few hours — you can also type <span class="kbd">/drop CODE</span> in chat.</div></form>`;
        on(body, 'click', '[data-redeem]', async (e, b) => {
          const { openRedeem } = await import('../ui/offers.js');
          openRedeem(b.dataset.redeem, { onDone: loadOffers });
        });
        body.querySelector('.offer-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const { openRedeem } = await import('../ui/offers.js');
          openRedeem(e.target.code.value.trim());
        });
      })
      .catch((err) => (body.innerHTML = `<div class="empty">${esc(err.message)}</div>`));
    };
    loadOffers();
  } else if (tab === 'security') {
    const render = (setup = null) => {
      const on2fa = state.user.twoFactor;
      body.innerHTML = `<h3 style="margin-top:0">Two Factor</h3>
        <p class="muted" style="margin-top:0">Use an authenticator app (any app that supports TOTP codes) to protect your play-money wallet. Once enabled, withdrawals, vault withdrawals, tips and rain need a 6-digit code.</p>
        ${
          on2fa
            ? `<div class="demo-notice">${icon('lock', 16)}<div><b>Two-factor is on.</b> Enter a current code to turn it off.</div></div>
          <form class="tfa-form" novalidate style="max-width:420px">${codeField()}<button class="btn btn-secondary" type="submit">Disable two-factor</button></form>`
            : setup
              ? `<div class="tfa-setup"><div class="qr-wrap">${qrSvg(setup.uri)}<div style="min-width:0">
                <div class="field"><div class="field-label">Copy this code to your authenticator app</div>
                <div class="address-box"><span class="addr mono" style="flex:1">${esc(setup.secret.match(/.{1,4}/g).join(' '))}</span><button class="btn btn-secondary btn-sm" type="button" data-act="copy">${icon('copy', 14)} Copy</button></div></div>
                <div class="muted" style="font-size:12.5px">Don’t let anyone see this. Scan the QR code or type the key, then enter the 6-digit code the app shows.</div></div></div>
                <form class="tfa-form" novalidate style="max-width:420px;margin-top:14px">${codeField()}<button class="btn btn-primary" type="submit">Enable two-factor</button></form></div>`
              : `<button class="btn btn-primary" data-act="setup">${icon('lock', 16)} Set up two-factor</button>`
        }`;
      body.querySelector('[data-act=setup]')?.addEventListener('click', async () => {
        try {
          render(await api.post('/api/account/2fa/setup'));
        } catch (err) {
          toastError(err);
        }
      });
      body.querySelector('[data-act=copy]')?.addEventListener('click', async () => {
        await copyText(setup.secret);
        toast({ type: 'success', title: 'Key copied' });
      });
      const form = body.querySelector('.tfa-form');
      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const { user } = await api.post(on2fa ? '/api/account/2fa/disable' : '/api/account/2fa/enable', { code: form.code.value.trim() });
          setUser(user);
          toastSuccess(on2fa ? 'Two-factor disabled' : 'Two-factor enabled');
          render();
        } catch (err) {
          showFieldErrors(form, err);
        }
      });
      form?.code.focus();
    };
    const codeField = () =>
      '<div class="field" data-field="code"><div class="field-label">Two Factor Code</div><input class="input mono" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"><div class="field-error"></div></div>';
    render();
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
