import { el, esc, on, copyText } from '../dom.js';
import { icon, coin } from '../icons.js';
import { api } from '../api.js';
import { state, setUser, currency } from '../state.js';
import { CURRENCIES, CURRENCY_CODES } from '../shared/currencies.js';
import { toast, toastSuccess } from '../ui/toast.js';
import { showFieldErrors } from '../ui/forms.js';
import * as fmt from '../format.js';

const TABS = [
  ['overview', 'Overview'],
  ['campaigns', 'Campaigns'],
  ['funds', 'Funds'],
  ['referred', 'Referred Users'],
];

const linkFor = (code) => `${location.origin}/?c=${encodeURIComponent(code)}`;
const usd4 = (v) => `$${(Number(v) || 0).toFixed(v > 0 && v < 0.01 ? 4 : 2)}`;

export default async function affiliatePage(page, { tab = 'overview' } = {}) {
  document.title = 'Affiliate — Fakesino';
  if (!state.user) {
    page.innerHTML = '<div class="spinner"></div>';
    return;
  }
  if (!TABS.some(([k]) => k === tab)) tab = 'overview';
  const root = el(`<div><div class="page-title">${icon('users', 22)} Affiliate</div>
    <div class="tabs" style="margin-bottom:16px">${TABS.map(([k, l]) => `<a class="tab ${k === tab ? 'active' : ''}" href="/affiliate/${k}">${l}</a>`).join('')}</div>
    <div class="aff-body"><div class="spinner"></div></div></div>`);
  page.appendChild(root);
  const body = root.querySelector('.aff-body');
  let data;
  const render = () => ({ overview, campaigns, funds, referred })[tab](body, data, reload);
  const reload = async (fresh) => {
    data = fresh || (await api.get('/api/affiliate'));
    render();
  };
  await reload().catch((err) => (body.innerHTML = `<div class="empty">${esc(err.message)}</div>`));
}

function statCards(t) {
  return `<div class="aff-stats">
    <div class="stat-box"><div class="k">Referrals</div><div class="v">${t.referrals.toLocaleString()}</div></div>
    <div class="stat-box"><div class="k">Wagered by referrals</div><div class="v">${fmt.fiat(t.wageredUsd)}</div></div>
    <div class="stat-box"><div class="k">Commission earned</div><div class="v">${usd4(t.commissionUsd)}</div></div>
    <div class="stat-box"><div class="k">Available</div><div class="v win-text">${usd4(t.availableUsd)}</div></div></div>`;
}

function overview(body, d) {
  const first = d.campaigns[0];
  body.innerHTML = `${statCards(d.totals)}
    <div class="card doc" style="margin-top:16px">
      <h2 style="margin-top:0">Refer players, earn play money</h2>
      <p>Create a campaign, share its link, and earn commission every time a player who joined through it places a bet — win or lose. Everything here is play money.</p>
<pre>commission = house edge × wagered ÷ 2 × ${Math.round(d.rate * 100)}%</pre>
      <p class="muted">For example, $1,000 wagered on Dice (1% edge) earns $0.50. Commission is added as bets settle and can be claimed in any currency from Funds.</p>
      ${
        first
          ? `<div class="field"><div class="field-label">Your link · ${esc(first.name)}</div><div class="address-box"><span class="addr mono" style="flex:1">${esc(linkFor(first.code))}</span><button class="btn btn-secondary btn-sm" data-copy="${esc(linkFor(first.code))}">${icon('copy', 14)} Copy</button></div></div>`
          : `<a class="btn btn-primary" href="/affiliate/campaigns">${icon('plus', 16)} Create your first campaign</a>`
      }
      ${d.referredBy ? `<div class="demo-notice" style="margin-top:14px">${icon('info', 16)}<div>You joined through the <b>${esc(d.referredBy.campaign)}</b> campaign.</div></div>` : ''}
    </div>`;
  bindCopy(body);
}

function campaigns(body, d, reload) {
  body.innerHTML = `<div class="card" style="padding:18px;margin-bottom:16px"><form class="aff-new" novalidate>
      <div class="two-col" style="gap:12px"><div class="field" data-field="name"><div class="field-label">Campaign name</div><input class="input" name="name" maxlength="32" placeholder="My stream"><div class="field-error"></div></div>
      <div class="field" data-field="code"><div class="field-label">Campaign code</div><input class="input mono" name="code" maxlength="24" placeholder="mystream"><div class="field-error"></div></div></div>
      <div class="field-error form-error" style="margin-bottom:10px"></div>
      <button class="btn btn-primary" type="submit">${icon('plus', 16)} Create campaign</button></form></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Campaign</th><th class="hide-mobile">Code</th><th class="r">Referrals</th><th class="r hide-mobile">Wagered</th><th class="r">Commission</th><th class="r"></th></tr></thead><tbody>
    ${
      d.campaigns.length
        ? d.campaigns
            .map(
              (c) => `<tr><td><b>${esc(c.name)}</b><div class="dim" style="font-size:12px">${fmt.dateTime(c.createdAt)}</div></td><td class="hide-mobile mono">${esc(c.code)}</td>
          <td class="r">${c.referrals}</td><td class="r hide-mobile">${fmt.fiat(c.wageredUsd)}</td><td class="r">${usd4(c.commissionUsd)}</td>
          <td class="r"><button class="btn btn-secondary btn-sm" data-copy="${esc(linkFor(c.code))}">${icon('link', 14)} Copy link</button></td></tr>`,
            )
            .join('')
        : '<tr><td colspan="6"><div class="empty">No campaigns yet.</div></td></tr>'
    }</tbody></table></div>`;
  const form = body.querySelector('form');
  form.name.addEventListener('input', () => {
    if (!form.code.dataset.touched) form.code.value = form.name.value.toLowerCase().replace(/[^a-z0-9_-]+/g, '').slice(0, 24);
  });
  form.code.addEventListener('input', () => (form.code.dataset.touched = '1'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await reload(await api.post('/api/affiliate/campaigns', { name: form.name.value, code: form.code.value }));
      toastSuccess('Campaign created', 'Copy its link and share it.');
    } catch (err) {
      showFieldErrors(form, err);
    }
  });
  bindCopy(body);
}

function funds(body, d, reload) {
  let code = currency();
  const t = d.totals;
  body.innerHTML = `${statCards(t)}
    <div class="card" style="padding:18px;margin-top:16px;max-width:520px"><form class="aff-claim" novalidate>
      <div class="field"><div class="field-label">Claim to</div><select class="select" name="currency">${CURRENCY_CODES.map((c) => `<option value="${c}" ${c === code ? 'selected' : ''}>${c} — ${esc(CURRENCIES[c].name)}</option>`).join('')}</select></div>
      <div class="summary"><div class="line"><span>Available</span><b>${usd4(t.availableUsd)}</b></div><div class="line"><span>You receive</span><b class="aff-recv"></b></div><div class="line"><span>Claimed so far</span><span>${usd4(t.claimedUsd)}</span></div></div>
      <div class="field-error form-error" style="margin-bottom:10px"></div>
      <button class="btn btn-primary btn-block" type="submit" ${t.availableUsd >= 0.01 ? '' : 'disabled'}>Claim commission</button></form></div>`;
  const form = body.querySelector('form');
  const recv = body.querySelector('.aff-recv');
  const update = () => (recv.innerHTML = `${fmt.amount(Math.floor((t.availableUsd / CURRENCIES[code].usd) * 10 ** CURRENCIES[code].decimals) / 10 ** CURRENCIES[code].decimals, code)} ${coin(code)}`);
  update();
  form.currency.addEventListener('change', () => {
    code = form.currency.value;
    update();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/api/affiliate/claim', { currency: code });
      setUser(res.user);
      toastSuccess('Commission claimed', `${fmt.amount(res.amount, res.currency)} ${res.currency} added to your wallet`);
      await reload(res);
    } catch (err) {
      showFieldErrors(form, err);
    }
  });
}

function referred(body, d) {
  body.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>User</th><th class="hide-mobile">Campaign</th><th class="hide-mobile">Joined</th><th class="r">Wagered</th><th class="r">Commission</th></tr></thead><tbody>
    ${
      d.referred.length
        ? d.referred
            .map(
              (r) => `<tr><td>${r.username ? esc(r.username) : `<span class="user-hidden">${icon('eyeOff', 14)} Hidden</span>`}</td><td class="hide-mobile">${esc(r.campaign)}</td>
          <td class="hide-mobile">${fmt.dateTime(r.joinedAt)}</td><td class="r">${fmt.fiat(r.wageredUsd)}</td><td class="r">${usd4(r.commissionUsd)}</td></tr>`,
            )
            .join('')
        : '<tr><td colspan="5"><div class="empty">Nobody has joined through your links yet.</div></td></tr>'
    }</tbody></table></div>`;
}

function bindCopy(body) {
  on(body, 'click', '[data-copy]', async (e, b) => {
    await copyText(b.dataset.copy);
    toast({ type: 'success', title: 'Link copied' });
  });
}

