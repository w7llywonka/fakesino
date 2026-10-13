import { el, esc, on, copyText } from '../dom.js';
import { icon, coin } from '../icons.js';
import { api } from '../api.js';
import { state, bus, currency, balanceOf, setUser, setCurrency } from '../state.js';
import { CURRENCIES, CURRENCY_CODES, roundDown } from '../shared/currencies.js';
import * as fmt from '../format.js';
import { setQuery } from '../router.js';
import { openModal } from './modal.js';
import { toastSuccess, toastError, toast } from './toast.js';
import { showFieldErrors, twoFactorField } from './forms.js';
import { qrSvg } from '../shared/qr.js';
import { networksFor, networkFor } from '../shared/networks.js';
import { helpTip } from './helptip.js';

const TABS = [
  ['deposit', 'Deposit'],
  ['buy', 'Buy Crypto'],
  ['withdraw', 'Withdraw'],
  ['swap', 'Swap'],
  ['vault', 'Vault'],
  ['tip', 'Tip'],
];

// Username to pre-fill when the Tip tab opens (from chat menus or /tip).
let tipPrefill = null;
export function prefillTip(username, amount = null) {
  tipPrefill = { username, amount };
}

const BRAND_LABEL = { visa: 'VISA', mastercard: 'MC', amex: 'AMEX', discover: 'DISC', unknown: 'CARD' };
export const brandChip = (b) => `<span class="brand-chip ${b}">${BRAND_LABEL[b] || 'CARD'}</span>`;

export function openWalletModal(tab = 'deposit') {
  if (!TABS.some(([k]) => k === tab)) tab = 'deposit';
  const modal = openModal({ title: 'Wallet', iconName: 'wallet', onClose: () => setQuery({ modal: null, tab: null }, { replace: true }) });
  const offs = [];
  const prevClose = modal.onClose;
  modal.onClose = () => {
    offs.forEach((f) => f());
    prevClose();
  };
  const root = el(`<div><div class="wallet-tabs tabs block">${TABS.map(([k, l]) => `<button class="tab" data-tab="${k}">${l}</button>`).join('')}</div><div class="wallet-body"></div></div>`);
  modal.setBody(root);
  const body = root.querySelector('.wallet-body');
  modal.setFoot(`${icon('lock', 13)} Play money only — every card here is a demo card and nothing is ever charged.`);

  function show(t) {
    tab = t;
    root.querySelectorAll('.wallet-tabs .tab').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === t);
      if (b.dataset.tab === t) b.parentElement.scrollLeft = Math.max(0, b.offsetLeft - (b.parentElement.clientWidth - b.offsetWidth) / 2);
    });
    setQuery({ modal: 'wallet', tab: t }, { replace: true });
    offs.splice(0).forEach((f) => f());
    body.innerHTML = '';
    const ctx = { body, offs, modal, show };
    if (t === 'deposit') depositTab(ctx);
    else if (t === 'buy') buyTab(ctx);
    else if (t === 'withdraw') withdrawTab(ctx);
    else if (t === 'swap') swapTab(ctx);
    else if (t === 'vault') vaultTab(ctx);
    else if (t === 'tip') tipTab(ctx);
  }
  on(root, 'click', '.wallet-tabs .tab', (e, b) => show(b.dataset.tab));
  show(tab);
  return modal;
}

// ---------------------------------------------------------------------------
// Currency picker

function currencyPicker(container, { value, onChange, filter = () => true, label = 'Currency' }) {
  const wrap = el(`<div class="field"><div class="field-label">${esc(label)}</div>
    <div style="position:relative"><button type="button" class="input" style="display:flex;align-items:center;gap:10px;text-align:left" data-act="toggle"></button>
    <div class="cp-list" style="display:none;position:absolute;left:0;right:0;top:calc(100% + 6px);background:var(--surface-2);border-radius:8px;box-shadow:var(--shadow-lg);z-index:10;max-height:280px;overflow-y:auto;padding:6px"></div></div></div>`);
  container.appendChild(wrap);
  const btn = wrap.querySelector('[data-act=toggle]');
  const list = wrap.querySelector('.cp-list');
  let current = value;
  const renderBtn = () =>
    (btn.innerHTML = `${coin(current, 20)}<b>${current}</b><span class="muted">${esc(CURRENCIES[current].name)}</span><span style="margin-left:auto" class="muted">${esc(fmt.money(balanceOf(current), current))}</span>${icon('down', 14)}`);
  renderBtn();
  list.innerHTML = CURRENCY_CODES.filter(filter)
    .map(
      (c) => `<button type="button" class="method" data-c="${c}" style="padding:10px;background:transparent">${coin(c, 20)}<div><div class="m-title">${c}</div><div class="m-sub">${esc(CURRENCIES[c].name)}</div></div>
      <div class="m-right muted">${esc(fmt.money(balanceOf(c), c))}</div></button>`,
    )
    .join('');
  btn.addEventListener('click', () => (list.style.display = list.style.display === 'none' ? 'block' : 'none'));
  on(list, 'click', '[data-c]', (e, b) => {
    current = b.dataset.c;
    list.style.display = 'none';
    renderBtn();
    onChange(current);
  });
  return { get value() { return current; }, refresh: renderBtn };
}

// ---------------------------------------------------------------------------
// Deposit

function depositTab({ body, offs, modal }) {
  let code = currency();
  const top = el('<div></div>');
  const content = el('<div></div>');
  body.append(top, content);
  const picker = currencyPicker(top, {
    value: code,
    onChange: (c) => {
      code = c;
      render();
    },
  });
  const offBalance = bus.on('balance', () => picker.refresh());
  const prevClose = modal.onClose;
  modal.onClose = () => {
    offBalance();
    prevClose?.();
  };
  function render() {
    content.innerHTML = '';
    offs.splice(0).forEach((f) => f());
    if (CURRENCIES[code].type === 'fiat') fiatDeposit(content, { fiat: code, credit: code, offs, modal });
    else cryptoDeposit(content, code, offs);
  }
  render();
}

// Play money: pick a method and an amount — it's credited straight away.
const FIAT_METHODS = [
  ['card', 'card', 'Credit / Debit card', 'Instant · No fees', () => `${brandChip('visa')}${brandChip('mastercard')}${brandChip('amex')}`],
  ['mobile', 'wallet', 'Mobile wallet', 'Instant · Demo Pay', () => '<span class="brand-chip demo">PAY</span>'],
  ['bank', 'bank', 'Bank transfer', 'Instant · No fees', () => '<span class="brand-chip demo">BANK</span>'],
];
const DEPOSIT_URL = { card: '/api/payments/card', mobile: '/api/payments/mobile', bank: '/api/payments/bank' };
const METHOD_NAME = { card: 'Card', mobile_wallet: 'Demo Pay', bank: 'Bank transfer' };

function fiatDeposit(container, { fiat, credit, modal }) {
  const sym = CURRENCIES[fiat].symbol;
  let amount = 100;
  let method = 'card';
  const view = el(`<div>
    <div class="field"><div class="field-label">Payment method</div><div class="method-list"></div></div>
    <div class="field" data-field="amount"><div class="field-label"><span>Amount</span><span class="muted">Max ${sym}100,000</span></div>
      <div class="amount-presets">${[20, 50, 100, 500].map((v) => `<button type="button" data-v="${v}">${sym}${v}</button>`).join('')}</div>
      <div class="input-suffix"><input class="input" inputmode="decimal" value="${amount}"><span class="suffix">${coin(fiat)}</span></div>
      <div class="field-error"></div></div>
    <div class="summary"></div>
    <button class="btn btn-primary btn-block btn-lg" data-act="deposit">Deposit</button>
  </div>`);
  container.appendChild(view);

  const methods = view.querySelector('.method-list');
  const renderMethods = () => {
    methods.innerHTML = FIAT_METHODS.map(
      ([key, ic, title, sub, chips]) => `<button type="button" class="method ${method === key ? 'selected' : ''}" data-m="${key}">${icon(ic, 20)}
        <div><div class="m-title">${title}</div><div class="m-sub">${sub}</div></div><div class="m-right">${chips()}</div></button>`,
    ).join('');
  };
  renderMethods();
  on(methods, 'click', '[data-m]', (e, b) => {
    method = b.dataset.m;
    renderMethods();
  });

  const input = view.querySelector('.input-suffix input');
  const summary = view.querySelector('.summary');
  const renderSummary = () => {
    const creditAmount = roundDown(credit, (amount * CURRENCIES[fiat].usd) / CURRENCIES[credit].usd);
    summary.innerHTML = `<div class="line"><span>Deposit amount</span><b>${sym}${fmt.amount(amount, fiat)}</b></div>
      <div class="line"><span>Processing fee</span><b>${sym}0.00</b></div>
      ${credit !== fiat ? `<div class="line"><span>Rate</span><b>1 ${credit} ≈ ${sym}${fmt.amount(CURRENCIES[credit].usd / CURRENCIES[fiat].usd, fiat)}</b></div>` : ''}
      <div class="line total"><span>You receive</span><b style="display:flex;gap:6px;align-items:center">${fmt.amount(creditAmount, credit)} ${coin(credit)}</b></div>`;
    view.querySelectorAll('.amount-presets button').forEach((b) => b.classList.toggle('active', Number(b.dataset.v) === amount));
  };
  renderSummary();
  on(view, 'click', '.amount-presets button', (e, b) => {
    amount = Number(b.dataset.v);
    input.value = amount;
    renderSummary();
  });
  input.addEventListener('input', () => {
    amount = Math.max(0, Number(input.value) || 0);
    renderSummary();
  });

  view.querySelector('[data-act=deposit]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.classList.contains('loading')) return;
    btn.classList.add('loading');
    try {
      const res = await api.post(DEPOSIT_URL[method], { amount: roundDown(fiat, amount), currency: fiat, creditCurrency: credit });
      paymentSuccess(container, res, { modal });
    } catch (err) {
      btn.classList.remove('loading');
      showFieldErrors(view, err);
    }
  });
}

function paymentSuccess(container, res, { modal }) {
  if (res.user) setUser(res.user);
  const tx = res.transaction;
  container.innerHTML = '';
  if (tx.method === 'buy') return purchaseComplete(container, tx, modal);
  const paid = tx.fiat || { currency: tx.currency, amount: tx.amount };
  const view = el(`<div class="success-state">
    <div class="check">${icon('check', 34)}</div>
    <h3>Deposit successful</h3>
    <div class="muted">Your play-money balance has been topped up.</div>
    <div class="summary" style="text-align:left;margin-top:16px">
      <div class="line"><span>Credited</span><b style="display:flex;gap:6px;align-items:center">${fmt.amount(tx.amount, tx.currency)} ${coin(tx.currency)}</b></div>
      <div class="line"><span>Paid</span><b>${CURRENCIES[paid.currency].symbol}${fmt.amount(paid.amount, paid.currency)} · <span>${METHOD_NAME[tx.method] || 'Card'}</span></b></div>
      <div class="line"><span>Reference</span><b class="mono" style="font-size:12px">${esc(String(tx.ref || '').slice(0, 16))}</b></div>
    </div>
    <button class="btn btn-primary btn-block btn-lg" data-act="play">Start playing</button>
  </div>`);
  container.appendChild(view);
  if (currency() !== tx.currency) setCurrency(tx.currency);
  view.querySelector('[data-act=play]').addEventListener('click', () => modal.close());
}

// --- crypto deposit -----------------------------------------------------------


// Remember the last network picked per coin.
const lastNetwork = {};

function networkSelect(code, selected, name = 'network') {
  const list = networksFor(code);
  if (list.length < 2) return `<div class="field"><div class="field-label"><span>Network</span>${helpTip('Network')}</div><div class="input" style="display:flex;align-items:center">${esc(list[0]?.label || '')}</div></div>`;
  return `<div class="field"><div class="field-label"><span>Choose network</span>${helpTip('Network')}</div><select class="select" name="${name}">${list.map((n) => `<option value="${n.id}" ${n.id === selected ? 'selected' : ''}>${esc(n.label)}</option>`).join('')}</select></div>`;
}

function cryptoDeposit(container, code, offs) {
  const view = el('<div><div class="spinner"></div></div>');
  container.appendChild(view);
  const network = networkFor(code, lastNetwork[code]).id;
  api
    .post('/api/payments/crypto/address', { currency: code, network })
    .then((info) => {
      const net = networkFor(code, info.network.id);
      view.innerHTML = `
        ${networkSelect(code, net.id)}
        <div class="field"><div class="field-label"><span>Your ${code} deposit address</span><button class="link" data-act="regen" style="font-size:12px">New address</button></div>
          <div class="address-box"><span style="flex:1" class="addr">${esc(info.address)}</span><button class="btn btn-secondary btn-sm" data-act="copy">${icon('copy', 14)} Copy</button></div></div>
        ${
          info.tag
            ? `<div class="field"><div class="field-label"><span>Destination tag</span>${helpTip('Destination tag')}</div>
          <div class="address-box"><span style="flex:1" class="addr">${esc(info.tag)}</span><button class="btn btn-secondary btn-sm" data-copy-tag>${icon('copy', 14)} Copy</button></div></div>`
            : ''
        }
        <div class="qr-wrap">${qrSvg(info.address)}<div class="muted" style="font-size:12.5px">
          <div class="demo-notice warn" style="margin:0">${icon('alert', 16)}<div>This is a fake address that exists on no blockchain. Never send real crypto to it — it would be lost.</div></div></div></div>
        <div class="divider"></div>
        <div style="font-weight:800;margin-bottom:8px">Simulate an incoming transfer</div>
        <div class="muted" style="font-size:13px;margin-bottom:10px">Pretend you sent coins from another wallet. They’re added to your balance straight away.</div>
        <div class="field" data-field="amount"><div class="field-label"><span>Amount</span><span class="aux muted"></span></div>
          <div class="input-group"><div class="input-icon"><input class="input" inputmode="decimal" value="${fmt.inputAmount(roundDown(code, 100 / CURRENCIES[code].usd), code)}"><span class="suffix">${coin(code)}</span></div>
          ${[100, 1000].map((u) => `<button class="addon" data-usd="${u}">$${u >= 1000 ? `${u / 1000}k` : u}</button>`).join('')}</div><div class="field-error"></div></div>
        <button class="btn btn-primary btn-block btn-lg" data-act="send">Send test transaction</button>
        <div class="tx-list"></div>`;
      view.querySelector('select[name=network]')?.addEventListener('change', (e) => {
        lastNetwork[code] = e.target.value;
        container.innerHTML = '';
        cryptoDeposit(container, code, offs);
      });
      const amountInput = view.querySelector('[data-field=amount] input');
      const aux = view.querySelector('.aux');
      const updateAux = () => (aux.textContent = `≈ ${fmt.equiv(fmt.usdOf(Number(amountInput.value) || 0, code))}`);
      updateAux();
      amountInput.addEventListener('input', updateAux);
      on(view, 'click', '[data-usd]', (e, b) => {
        amountInput.value = fmt.inputAmount(roundDown(code, Number(b.dataset.usd) / CURRENCIES[code].usd), code);
        updateAux();
      });
      view.querySelector('[data-act=copy]').addEventListener('click', async () => {
        await copyText(info.address);
        toast({ type: 'success', title: 'Address copied' });
      });
      view.querySelector('[data-copy-tag]')?.addEventListener('click', async () => {
        await copyText(info.tag);
        toast({ type: 'success', title: 'Destination tag copied' });
      });
      view.querySelector('[data-act=regen]').addEventListener('click', async () => {
        await api.post('/api/payments/crypto/address', { currency: code, network: net.id, regenerate: true });
        container.innerHTML = '';
        cryptoDeposit(container, code, offs);
      });
      const txList = view.querySelector('.tx-list');
      view.querySelector('[data-act=send]').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (btn.classList.contains('loading')) return;
        btn.classList.add('loading');
        try {
          const { transaction, user } = await api.post('/api/payments/crypto/simulate', { currency: code, network: net.id, amount: Number(amountInput.value) });
          if (user) setUser(user);
          txList.prepend(txRow(transaction));
          toastSuccess('Deposit received', `${fmt.amount(transaction.amount, transaction.currency)} ${transaction.currency} credited`);
        } catch (err) {
          showFieldErrors(view, err);
        } finally {
          btn.classList.remove('loading');
        }
      });
    })
    .catch((err) => (view.innerHTML = `<div class="empty">${esc(err.message)}</div>`));
}

function txRow(tx) {
  const d = tx.details || {};
  const pct = d.required ? Math.min(100, (d.confirmations / d.required) * 100) : 100;
  return el(`<div class="tx-progress" data-tx="${tx.id}">${coin(tx.currency, 22)}
    <div style="flex:1;min-width:0"><div class="row between"><b>${fmt.amount(tx.amount, tx.currency)} ${tx.currency}</b>
      ${tx.status === 'failed' ? `<span class="pill red">${esc(d.reason || 'Failed')}</span>` : '<span class="pill green">Credited</span>'}</div>
      <div class="progress" style="margin-top:8px"><div style="width:${pct}%"></div></div></div></div>`);
}

// ---------------------------------------------------------------------------
// Buy crypto (card → crypto)

function buyTab({ body, offs, modal }) {
  let coin = CURRENCIES[currency()].type === 'crypto' ? currency() : 'BTC';
  let fiat = 'USD';
  let amount = 100;
  let network = networkFor(coin, lastNetwork[coin]).id;
  const top = el('<div></div>');
  const content = el('<div></div>');
  body.append(top, content);
  currencyPicker(top, {
    label: 'Buy',
    value: coin,
    filter: (c) => CURRENCIES[c].type === 'crypto',
    onChange: (c) => {
      coin = c;
      network = networkFor(coin, lastNetwork[coin]).id;
      form();
    },
  });

  // Step 1: what to buy, how much, which fiat.
  function form() {
    top.hidden = false;
    content.innerHTML = '';
    const sym = CURRENCIES[fiat].symbol;
    const view = el(`<form novalidate>
      ${networkSelect(coin, network)}
      <div class="field" data-field="amount"><div class="field-label"><span>Amount</span></div>
        <div class="input-group"><div class="input-icon"><input class="input" name="amount" inputmode="decimal" value="${amount}"><span class="suffix">${coinFiat(fiat)}</span></div></div><div class="field-error"></div></div>
      <div class="field"><div class="field-label">Pay with</div><div class="segmented">${['USD', 'EUR'].map((f) => `<button type="button" data-f="${f}" class="${f === fiat ? 'active' : ''}">${f}</button>`).join('')}</div></div>
      <button class="btn btn-primary btn-block btn-lg" type="submit">Next</button>
      <div class="muted" style="font-size:12px;text-align:center;margin-top:10px">Compare play-money quotes from on-ramp providers.</div></form>`);
    content.appendChild(view);
    view.querySelector('select[name=network]')?.addEventListener('change', (e) => {
      network = lastNetwork[coin] = e.target.value;
    });
    on(view, 'click', '[data-f]', (e, b) => {
      fiat = b.dataset.f;
      amount = Number(view.amount.value) || amount;
      form();
    });
    view.addEventListener('submit', (e) => {
      e.preventDefault();
      amount = Number(view.amount.value) || 0;
      if (!(amount > 0)) return showFieldErrors(view, { field: 'amount', message: 'Enter an amount' });
      providers();
    });
  }

  // Step 2: provider quotes; buying credits the coins at once.
  async function providers(selected = null) {
    top.hidden = true;
    content.innerHTML = '<div class="spinner"></div>';
    let q;
    try {
      q = await api.get(`/api/payments/buy/quotes?coin=${coin}&network=${network}&fiat=${fiat}&amount=${amount}`);
    } catch (err) {
      content.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
      return;
    }
    let pick = selected || q.quotes.find((x) => x.best).provider;
    const sym = CURRENCIES[fiat].symbol;
    const net = networkFor(coin, network);
    content.innerHTML = '';
    const view = el(`<div>
      <button class="link" data-act="back" style="margin-bottom:10px">${icon('left', 14)} Back</button>
      <div class="row between" style="margin-bottom:10px"><b>Buy ${coin} with ${sym}${fmt.amount(amount, fiat)}</b></div>
      <div class="method-list">${q.quotes
        .map(
          (x) => `<button type="button" class="method ramp ${x.provider === pick ? 'selected' : ''}" data-p="${x.provider}"><span class="ramp-logo" style="background:${x.color}">${esc(x.name[0])}</span>
          <div><div class="m-title">${esc(x.name)} ${x.best ? '<span class="pill green">Best rate</span>' : ''}</div><div class="m-sub">${esc(x.methods.join(' · '))} · ${esc(x.eta)}</div>
          <div class="m-sub">Fee ${sym}${fmt.amount(x.feeFiat, fiat)} + network ${fmt.amount(x.networkFee, coin)} ${coin}</div></div>
          <div class="m-right"><div class="dim" style="font-size:11px">You get ≈</div><b>${fmt.amount(x.youGet, coin)}</b> ${coin}</div></button>`,
        )
        .join('')}</div>
      <div class="muted" style="font-size:12px;margin:8px 0 12px">Sent to your ${coin} address on ${esc(net.label)}.</div>
      <button class="btn btn-primary btn-block btn-lg" data-act="go">Buy</button></div>`);
    content.appendChild(view);
    on(view, 'click', '[data-p]', (e, b) => {
      pick = b.dataset.p;
      view.querySelectorAll('[data-p]').forEach((x) => x.classList.toggle('selected', x === b));
    });
    view.querySelector('[data-act=back]').addEventListener('click', () => form());
    view.querySelector('[data-act=go]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (btn.classList.contains('loading')) return;
      btn.classList.add('loading');
      try {
        const res = await api.post('/api/payments/card', { amount, currency: fiat, creditCurrency: coin, provider: pick, network });
        paymentSuccess(content, res, { modal });
      } catch (err) {
        btn.classList.remove('loading');
        toastError(err);
      }
    });
  }

  form();
}

const coinFiat = (f) => `<span style="font-weight:800;font-size:12px">${f}</span>`;

// The order is done and the coins are already in the wallet.
function purchaseComplete(container, tx, modal) {
  const d = tx.details;
  const view = el(`<div class="success-state">
    <div class="check">${icon('check', 34)}</div>
    <h3>Order complete</h3>
    <div class="muted">${esc(d.provider)} added ${fmt.amount(tx.amount, tx.currency)} ${tx.currency} to your wallet on ${esc(d.networkLabel)}.</div>
    <div class="summary" style="text-align:left;margin-top:16px">
      <div class="line"><span>Paid</span><b>${CURRENCIES[d.fiatCurrency].symbol}${fmt.amount(d.fiatAmount, d.fiatCurrency)}</b></div>
      <div class="line"><span>Provider fee</span><b>${CURRENCIES[d.fiatCurrency].symbol}${fmt.amount(d.fee, d.fiatCurrency)}</b></div>
      <div class="line"><span>Received</span><b>${fmt.amount(tx.amount, tx.currency)} ${tx.currency}</b></div>
    </div>
    <div class="tx-list" style="text-align:left"></div>
    <button class="btn btn-primary btn-block btn-lg" data-act="done" style="margin-top:12px">Done</button></div>`);
  container.appendChild(view);
  view.querySelector('.tx-list').appendChild(txRow(tx));
  if (currency() !== tx.currency) setCurrency(tx.currency);
  view.querySelector('[data-act=done]').addEventListener('click', () => modal.close());
}

// ---------------------------------------------------------------------------
// Withdraw

function withdrawTab({ body }) {
  let code = currency();
  const top = el('<div></div>');
  const content = el('<div></div>');
  body.append(top, content);
  const picker = currencyPicker(top, {
    value: code,
    onChange: (c) => {
      code = c;
      render();
    },
  });
  function render() {
    content.innerHTML = '';
    const isCrypto = CURRENCIES[code].type === 'crypto';
    const net = isCrypto ? networkFor(code, lastNetwork[code]) : null;
    const view = el(`<form novalidate>
      ${
        isCrypto
          ? `${networkSelect(code, net.id)}<div class="field" data-field="address"><label class="field-label"><span>${code} address</span><span class="muted">Optional</span></label><input class="input mono" name="address" placeholder="${esc(addressExample(code, net.id))}" autocomplete="off"><div class="field-error"></div></div>`
          : ''
      }
      <div class="field" data-field="amount"><div class="field-label"><span>Amount</span><span class="muted aux"></span></div>
        <div class="input-group"><div class="input-icon"><input class="input" name="amount" inputmode="decimal" value="${fmt.inputAmount(0, code)}"><span class="suffix">${coin(code)}</span></div><button type="button" class="addon" data-act="max">Max</button></div>
        <div class="field-error"></div></div>
      ${twoFactorField(state.user)}
      <div class="field-error form-error" style="margin-bottom:10px"></div>
      <button class="btn btn-primary btn-block btn-lg" type="submit">Withdraw</button>
      <div class="muted" style="font-size:12px;text-align:center;margin-top:10px">Play money leaves your balance and lands nowhere real.</div>
    </form>`);
    content.appendChild(view);
    const amountInput = view.querySelector('[name=amount]');
    view.querySelector('select[name=network]')?.addEventListener('change', (e) => {
      lastNetwork[code] = e.target.value;
      render();
    });
    const update = () => (view.querySelector('.aux').textContent = `Balance ${fmt.amount(balanceOf(code), code)}`);
    update();
    view.querySelector('[data-act=max]').addEventListener('click', () => {
      amountInput.value = fmt.inputAmount(balanceOf(code), code);
    });
    view.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = view.querySelector('[type=submit]');
      if (btn.classList.contains('loading')) return;
      btn.classList.add('loading');
      const fd = Object.fromEntries(new FormData(view));
      try {
        const { transaction, user } = await api.post('/api/payments/withdraw', { currency: code, network: net?.id, amount: Number(fd.amount), address: fd.address, code: fd.code });
        setUser(user);
        picker.refresh();
        content.innerHTML = '';
        const done = el(`<div class="success-state"><div class="check">${icon('check', 34)}</div><h3>Withdrawal complete</h3>
          <div class="muted"><b>${fmt.amount(transaction.amount, code)} ${code}</b> <span>has left your play-money balance.</span></div>
          <button class="btn btn-secondary btn-block" style="margin-top:16px" data-act="again">Make another withdrawal</button></div>`);
        content.appendChild(done);
        done.querySelector('[data-act=again]').addEventListener('click', render);
      } catch (err) {
        showFieldErrors(view, err);
      } finally {
        btn.classList.remove('loading');
      }
    });
  }
  render();
}

// ---------------------------------------------------------------------------
// Swap one crypto for another (0.5% fee, instant)

let swapPair = null;
function swapTab({ body, offs }) {
  if (!swapPair) {
    const from = CURRENCIES[currency()].type === 'crypto' ? currency() : 'BTC';
    swapPair = { from, to: from === 'USDT' ? 'BTC' : 'USDT' };
  }
  let { from, to } = swapPair;
  let amountValue = '';
  let quoteSeq = 0;
  let pickers = [];
  const view = el('<div class="swap"></div>');
  const list = el('<div class="tx-list"></div>');
  body.append(view, list);

  function render() {
    swapPair = { from, to };
    view.innerHTML = '';
    const fromBox = el('<div></div>');
    const toBox = el('<div></div>');
    const form = el(`<form novalidate>
      <div class="field" data-field="amount"><div class="field-label"><span>You pay</span><span class="aux dim"></span></div>
        <div class="input-group"><div class="input-icon"><input class="input" name="amount" inputmode="decimal" placeholder="${fmt.inputAmount(0, from)}" value="${esc(amountValue)}"><span class="suffix">${coin(from)}</span></div>
        <button type="button" class="addon" data-frac="0.5">½</button><button type="button" class="addon" data-frac="1">Max</button></div><div class="field-error"></div></div>
      <div class="swap-flip"><button type="button" class="btn btn-secondary btn-sm" data-act="flip" aria-label="Flip coins">${icon('swap', 16)}</button></div>
      <div class="to-slot"></div>
      <div class="summary swap-quote"><div class="line"><span>You receive</span><b class="q-out">—</b></div>
        <div class="line"><span>Rate</span><span class="q-rate">1 ${from} ≈ —</span></div>
        <div class="line"><span>Fee (0.5%)</span><span class="q-fee">—</span></div></div>
      <div class="field-error form-error" style="margin-bottom:10px"></div>
      <button class="btn btn-primary btn-block btn-lg" type="submit">Swap</button>
      <div class="muted" style="font-size:12px;text-align:center;margin-top:10px">Play-money swap. The new coin is in your wallet straight away.</div></form>`);
    view.append(fromBox, form);
    form.querySelector('.to-slot').appendChild(toBox);
    const fromPicker = currencyPicker(fromBox, {
      label: 'From',
      value: from,
      filter: (c) => CURRENCIES[c].type === 'crypto',
      onChange: (c) => {
        if (c === to) to = from;
        from = c;
        amountValue = '';
        render();
      },
    });
    const toPicker = currencyPicker(toBox, {
      label: 'To',
      value: to,
      filter: (c) => CURRENCIES[c].type === 'crypto' && c !== from,
      onChange: (c) => {
        to = c;
        render();
      },
    });
    pickers = [fromPicker, toPicker];
    const input = form.amount;
    const aux = form.querySelector('.aux');
    const q = (sel) => form.querySelector(sel);
    const update = async () => {
      amountValue = input.value;
      const amount = Number(input.value) || 0;
      aux.textContent = `≈ ${fmt.equiv(fmt.usdOf(amount, from))}`;
      const seq = ++quoteSeq;
      try {
        const res = await api.get(`/api/payments/swap/quote?from=${from}&to=${to}&amount=${amount}`);
        if (seq !== quoteSeq) return;
        q('.q-out').innerHTML = amount > 0 ? `${fmt.amount(res.toAmount, to)} ${coin(to)}` : '—';
        q('.q-rate').textContent = `1 ${from} ≈ ${fmt.rate(res.rate)} ${to}`;
        q('.q-fee').textContent = `${fmt.amount(res.fee, from)} ${from}`;
      } catch {
        /* quote is informational */
      }
    };
    input.addEventListener('input', update);
    update();
    on(form, 'click', '[data-frac]', (e, b) => {
      input.value = fmt.inputAmount(roundDown(from, balanceOf(from) * Number(b.dataset.frac)), from);
      update();
    });
    form.querySelector('[data-act=flip]').addEventListener('click', () => {
      [from, to] = [to, from];
      amountValue = '';
      render();
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      if (btn.classList.contains('loading')) return;
      btn.classList.add('loading');
      try {
        const { transaction, user } = await api.post('/api/payments/swap', { from, to, amount: Number(input.value) });
        setUser(user);
        list.prepend(swapRow(transaction));
        toastSuccess('Swap complete', `${fmt.amount(transaction.details.fromAmount, from)} ${from} → ${fmt.amount(transaction.amount, to)} ${to}`);
        amountValue = '';
        render();
      } catch (err) {
        showFieldErrors(form, err);
      } finally {
        btn.classList.remove('loading');
      }
    });
  }

  function swapRow(tx) {
    const d = tx.details || {};
    return el(`<div class="tx-progress" data-tx="${tx.id}">${coin(d.from, 22)}${icon('right', 14)}${coin(tx.currency, 22)}
      <div style="flex:1;min-width:0"><div class="row between"><b>${fmt.amount(d.fromAmount, d.from)} ${d.from} → ${fmt.amount(tx.amount, tx.currency)} ${tx.currency}</b>
        <span class="pill green">Completed</span></div></div></div>`);
  }

  offs.push(bus.on('balance', () => pickers.forEach((p) => p.refresh())));
  render();
}

// ---------------------------------------------------------------------------
// Vault

function vaultTab({ body }) {
  let code = currency();
  let direction = 'deposit';
  const top = el('<div></div>');
  const content = el('<div></div>');
  body.append(
    el(`<div class="demo-notice">${icon('vault', 16)}<div>Keep part of your balance out of reach. Funds in the vault can't be wagered until you move them back.</div></div>`),
    top,
    content,
  );
  const picker = currencyPicker(top, {
    value: code,
    onChange: (c) => {
      code = c;
      render();
    },
  });
  function render() {
    const vault = state.user.vault?.[code] || 0;
    content.innerHTML = '';
    const view = el(`<form novalidate>
      <div class="segmented" style="margin-bottom:14px"><button type="button" data-d="deposit" class="${direction === 'deposit' ? 'active' : ''}">Deposit</button><button type="button" data-d="withdraw" class="${direction === 'withdraw' ? 'active' : ''}">Withdraw</button></div>
      <div class="summary"><div class="line"><span>Vault balance</span><b>${fmt.amount(vault, code)} ${code}</b></div><div class="line"><span>Wallet balance</span><b>${fmt.amount(balanceOf(code), code)} ${code}</b></div></div>
      <div class="field" data-field="amount"><div class="field-label">Amount</div>
        <div class="input-group"><div class="input-icon"><input class="input" name="amount" inputmode="decimal" value="${fmt.inputAmount(0, code)}"><span class="suffix">${coin(code)}</span></div><button type="button" class="addon" data-act="max">Max</button></div><div class="field-error"></div></div>
      ${direction === 'withdraw' ? twoFactorField(state.user) : ''}
      <div class="field-error form-error" style="margin-bottom:10px"></div>
      <button class="btn btn-primary btn-block btn-lg" type="submit">${direction === 'deposit' ? 'Deposit to Vault' : 'Withdraw from Vault'}</button></form>`);
    content.appendChild(view);
    on(view, 'click', '[data-d]', (e, b) => {
      direction = b.dataset.d;
      render();
    });
    view.querySelector('[data-act=max]').addEventListener('click', () => {
      view.amount.value = fmt.inputAmount(direction === 'deposit' ? balanceOf(code) : vault, code);
    });
    view.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const { user } = await api.post('/api/wallet/vault', { currency: code, amount: Number(view.amount.value), direction, code: view.code?.value });
        setUser(user);
        picker.refresh();
        toastSuccess(direction === 'deposit' ? 'Moved to vault' : 'Moved to wallet');
        render();
      } catch (err) {
        showFieldErrors(view, err);
      }
    });
  }
  render();
}

export { toastError };

// ---------------------------------------------------------------------------
// Tip another player (play money)

function tipTab({ body }) {
  let code = currency();
  const pre = tipPrefill || {};
  tipPrefill = null;
  const top = el('<div></div>');
  const content = el('<div></div>');
  body.append(top, content);
  const picker = currencyPicker(top, {
    value: code,
    onChange: (c) => {
      code = c;
      render();
    },
  });
  function render() {
    content.innerHTML = '';
    const view = el(`<form novalidate>
      <div class="field" data-field="to"><div class="field-label">Username</div><input class="input" name="to" autocomplete="off" placeholder="Who are you tipping?" value="${esc(pre.username || '')}"><div class="field-error"></div></div>
      <div class="field" data-field="amount"><div class="field-label"><span>Amount</span><span class="aux dim"></span></div>
        <div class="input-group"><div class="input-icon"><input class="input" name="amount" inputmode="decimal" value="${fmt.inputAmount(pre.amount || 0, code)}"><span class="suffix">${coin(code)}</span></div><button type="button" class="addon" data-act="max">Max</button></div><div class="field-error"></div></div>
      <label class="check-row" style="margin-bottom:14px"><input type="checkbox" name="public"> Show in chat</label>
      ${twoFactorField(state.user)}
      <div class="field-error form-error" style="margin-bottom:10px"></div>
      <button class="btn btn-primary btn-block btn-lg" type="submit">Send Tip</button>
      <div class="muted" style="font-size:12px;margin-top:10px">Tips are play money and can't be reversed. Daily limit: $1,000 sent and received.</div></form>`);
    content.appendChild(view);
    const aux = view.querySelector('.aux');
    const updateAux = () => (aux.textContent = CURRENCIES[code].type === 'crypto' ? `≈ ${fmt.equiv(fmt.usdOf(Number(view.amount.value) || 0, code))}` : '');
    view.amount.addEventListener('input', updateAux);
    updateAux();
    view.querySelector('[data-act=max]').addEventListener('click', () => {
      view.amount.value = fmt.inputAmount(balanceOf(code), code);
      updateAux();
    });
    view.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = view.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        await api.post('/api/tips', { to: view.to.value.trim(), amount: Number(view.amount.value), currency: code, public: view.public.checked, room: state.prefs.chatRoom || 'en', code: view.code?.value });
        toastSuccess('Tip sent', `${fmt.money(Number(view.amount.value), code)} to ${view.to.value.trim()}`);
        picker.refresh();
        pre.username = '';
        pre.amount = 0;
        render();
      } catch (err) {
        btn.disabled = false;
        showFieldErrors(view, err);
      }
    });
    if (!pre.username) view.to.focus();
  }
  render();
}

// Placeholder showing the address format a network expects.
function addressExample(code, network) {
  if (code === 'BTC') return 'bc1q… or 1… / 3…';
  if (code === 'LTC') return 'ltc1… or L… / M…';
  if (code === 'DOGE') return 'D…';
  if (code === 'XRP') return 'r… (25–35 characters)';
  if (code === 'BCH') return 'bitcoincash:q… or 1… / 3…';
  if (network === 'trc20') return 'T… (34 characters)';
  if (network === 'sol' || code === 'SOL') return 'Base58, 32–44 characters';
  return '0x… (42 characters)';
}

