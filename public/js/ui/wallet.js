import { el, esc, on, sleep, copyText } from '../dom.js';
import { icon, coin } from '../icons.js';
import { api } from '../api.js';
import { state, bus, currency, balanceOf, setUser, setCurrency } from '../state.js';
import { CURRENCIES, CURRENCY_CODES, roundDown } from '../shared/currencies.js';
import { DEMO_CARDS, DEMO_3DS_CODE, luhn, cardBrand, demoCard, formatCardNumber } from '../shared/cards.js';
import * as fmt from '../format.js';
import { setQuery } from '../router.js';
import { openModal } from './modal.js';
import { toastSuccess, toastError, toast } from './toast.js';
import { showFieldErrors } from './forms.js';

const TABS = [
  ['deposit', 'Deposit'],
  ['buy', 'Buy Crypto'],
  ['withdraw', 'Withdraw'],
  ['vault', 'Vault'],
];

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
    root.querySelectorAll('.wallet-tabs .tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    setQuery({ modal: 'wallet', tab: t }, { replace: true });
    offs.splice(0).forEach((f) => f());
    body.innerHTML = '';
    const ctx = { body, offs, modal, show };
    if (t === 'deposit') depositTab(ctx);
    else if (t === 'buy') buyTab(ctx);
    else if (t === 'withdraw') withdrawTab(ctx);
    else if (t === 'vault') vaultTab(ctx);
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

function fiatDeposit(container, { fiat, credit, offs, modal, title = null }) {
  const cards = state.user.cards || [];
  const sym = CURRENCIES[fiat].symbol;
  let amount = 100;
  let method = cards[0]?.id || 'new';

  const view = el(`<div>
    ${title ? `<div class="muted" style="margin-bottom:10px">${title}</div>` : ''}
    <div class="field"><div class="field-label">Payment method</div><div class="method-list"></div></div>
    <div class="field" data-field="amount"><div class="field-label"><span>Amount</span><span class="muted">Min ${sym}10 · Max ${sym}100,000</span></div>
      <div class="amount-presets">${[20, 50, 100, 500].map((v) => `<button type="button" data-v="${v}">${sym}${v}</button>`).join('')}</div>
      <div class="input-suffix"><input class="input" inputmode="decimal" value="${amount}"><span class="suffix">${coin(fiat)}</span></div>
      <div class="field-error"></div></div>
    <div class="summary"></div>
    <button class="btn btn-primary btn-block btn-lg" data-act="continue">Continue</button>
  </div>`);
  container.appendChild(view);

  const methods = view.querySelector('.method-list');
  const renderMethods = () => {
    methods.innerHTML =
      cards
        .map(
          (c) => `<button type="button" class="method ${method === c.id ? 'selected' : ''}" data-m="${c.id}">${icon('card', 20)}
        <div><div class="m-title">${BRAND_LABEL[c.brand] === 'MC' ? 'Mastercard' : c.brand[0].toUpperCase() + c.brand.slice(1)} •••• ${esc(c.last4)}</div><div class="m-sub">Expires ${String(c.expMonth).padStart(2, '0')}/${String(c.expYear).slice(-2)} · Saved card</div></div>
        <div class="m-right">${brandChip(c.brand)}</div></button>`,
        )
        .join('') +
      `<button type="button" class="method ${method === 'new' ? 'selected' : ''}" data-m="new">${icon('plus', 20)}
        <div><div class="m-title">Credit / Debit card</div><div class="m-sub">Instant · No fees · Demo cards only</div></div>
        <div class="m-right">${brandChip('visa')}${brandChip('mastercard')}${brandChip('amex')}</div></button>`;
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

  view.querySelector('[data-act=continue]').addEventListener('click', () => {
    const f = view.querySelector('[data-field=amount]');
    if (amount < 10 || amount > 100000) {
      f.classList.add('invalid');
      f.querySelector('.field-error').textContent = `Enter an amount between ${sym}10 and ${sym}100,000`;
      return;
    }
    f.classList.remove('invalid');
    view.remove();
    cardStep(container, { amount: roundDown(fiat, amount), fiat, credit, savedCard: cards.find((c) => c.id === method) || null, offs, modal });
  });
}

function cardStep(container, { amount, fiat, credit, savedCard, modal }) {
  const sym = CURRENCIES[fiat].symbol;
  const total = `${sym}${fmt.amount(amount, fiat)}`;
  const demoList = Object.entries(DEMO_CARDS)
    .map(([num, c]) => `<button type="button" class="demo-card-btn" data-num="${num}">${brandChip(c.brand)}<span class="num">${formatCardNumber(num)}</span><span class="lbl">${esc(c.label.split('·')[1].trim())}</span></button>`)
    .join('');
  const exp = new Date();
  const demoExp = `${String(exp.getMonth() + 1).padStart(2, '0')}/${String((exp.getFullYear() + 3) % 100).padStart(2, '0')}`;

  const view = el(`<form class="card-form" novalidate autocomplete="off">
    <button type="button" class="btn btn-ghost btn-sm" data-act="back" style="margin:-4px 0 10px -8px">${icon('left', 16)} Back</button>
    ${
      savedCard
        ? `<div class="method selected" style="margin-bottom:14px">${icon('card', 20)}<div><div class="m-title">•••• ${esc(savedCard.last4)}</div><div class="m-sub">${esc(savedCard.name)}</div></div><div class="m-right">${brandChip(savedCard.brand)}</div></div>
           <div class="field" data-field="cvc"><label class="field-label">Security code (CVC)</label><input class="input" name="cvc" inputmode="numeric" maxlength="${savedCard.brand === 'amex' ? 4 : 3}" placeholder="${savedCard.brand === 'amex' ? '1234' : '123'}"><div class="field-error"></div></div>`
        : `<div class="demo-notice">${icon('info', 16)}<div><b>Demo checkout.</b> Real cards are refused and never leave your browser. Tap a demo card to fill it in — any future expiry date, any CVC.</div></div>
      <div class="demo-cards">${demoList}</div>
      <div class="field" data-field="number"><label class="field-label">Card number</label>
        <div class="card-number-wrap"><input class="input mono" name="number" inputmode="numeric" placeholder="1234 1234 1234 1234" maxlength="23">${brandChip('unknown')}</div><div class="field-error"></div></div>
      <div class="row-2" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field" data-field="exp"><label class="field-label">Expiry</label><input class="input mono" name="exp" inputmode="numeric" placeholder="MM / YY" maxlength="7"><div class="field-error"></div></div>
        <div class="field" data-field="cvc"><label class="field-label">CVC</label><input class="input mono" name="cvc" inputmode="numeric" placeholder="123" maxlength="4"><div class="field-error"></div></div>
      </div>
      <div class="field" data-field="name"><label class="field-label">Name on card</label><input class="input" name="name" placeholder="Full name" value="${esc(state.user.username)}"><div class="field-error"></div></div>
      <div class="row-2" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field"><label class="field-label">Country</label><select class="select" name="country"><option>United States</option><option>United Kingdom</option><option>Canada</option><option>Germany</option><option>Australia</option><option>Other</option></select></div>
        <div class="field"><label class="field-label">ZIP / Postal code</label><input class="input" name="zip" placeholder="12345"></div>
      </div>
      <label class="checkbox" style="margin-bottom:14px"><input type="checkbox" name="save" checked><span>Save this card for faster deposits</span></label>`
    }
    <div class="field-error form-error" style="margin-bottom:10px"></div>
    <button class="btn btn-primary btn-block btn-lg" type="submit">${icon('lock', 16)} Pay ${total}</button>
  </form>`);
  container.innerHTML = '';
  container.appendChild(view);

  view.querySelector('[data-act=back]').addEventListener('click', () => {
    container.innerHTML = '';
    fiatDeposit(container, { fiat, credit, modal, offs: [] });
  });

  const num = view.querySelector('[name=number]');
  const expInput = view.querySelector('[name=exp]');
  if (num) {
    const chip = view.querySelector('.card-number-wrap .brand-chip');
    const updateBrand = () => {
      const b = cardBrand(num.value);
      chip.className = `brand-chip ${b}`;
      chip.textContent = BRAND_LABEL[b];
    };
    num.addEventListener('input', () => {
      const pos = num.selectionStart;
      const before = num.value.length;
      num.value = formatCardNumber(num.value.replace(/\D/g, '').slice(0, 16));
      num.setSelectionRange(pos + (num.value.length - before), pos + (num.value.length - before));
      updateBrand();
    });
    expInput.addEventListener('input', () => {
      const d = expInput.value.replace(/\D/g, '').slice(0, 4);
      expInput.value = d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d;
    });
    on(view, 'click', '.demo-card-btn', (e, b) => {
      num.value = formatCardNumber(b.dataset.num);
      expInput.value = demoExp.replace('/', ' / ');
      view.querySelector('[name=cvc]').value = cardBrand(b.dataset.num) === 'amex' ? '1234' : '123';
      if (!view.querySelector('[name=zip]').value) view.querySelector('[name=zip]').value = '10001';
      updateBrand();
      view.querySelectorAll('.field.invalid').forEach((f) => f.classList.remove('invalid'));
    });
  }

  view.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(view));
    const payload = { amount, currency: fiat, creditCurrency: credit };
    if (savedCard) {
      payload.savedCardId = savedCard.id;
      payload.cvc = fd.cvc;
    } else {
      // Client-side checks: a non-demo card is never sent to the server.
      const digits = String(fd.number || '').replace(/\D/g, '');
      const fail = (field, message) => showFieldErrors(view, { field, message });
      if (digits.length < 13 || !luhn(digits)) return fail('number', 'Your card number is invalid.');
      if (!demoCard(digits)) return fail('number', 'Real cards are not accepted. This is a play-money casino — use a demo card above.');
      const [mm, yy] = String(fd.exp || '').split('/').map((s) => s.trim());
      if (!mm || !yy || Number(mm) < 1 || Number(mm) > 12) return fail('exp', "Your card's expiration date is incomplete.");
      const cvcLen = cardBrand(digits) === 'amex' ? 4 : 3;
      if (!new RegExp(`^\\d{${cvcLen}}$`).test(fd.cvc || '')) return fail('cvc', "Your card's security code is incomplete.");
      if (!String(fd.name || '').trim()) return fail('name', 'Enter the name on the card.');
      payload.card = { number: digits, expMonth: Number(mm), expYear: Number(yy), cvc: fd.cvc, name: fd.name, zip: fd.zip };
      payload.saveCard = !!view.querySelector('[name=save]')?.checked;
    }
    view.querySelectorAll('.field.invalid').forEach((f) => f.classList.remove('invalid'));
    const formError = view.querySelector('.form-error');
    formError.style.display = 'none';
    container.innerHTML = '';
    const processing = el(`<div class="processing"><div class="spinner"></div><b>Processing payment…</b><div class="muted" style="margin-top:4px">${total} · Do not close this window</div></div>`);
    container.appendChild(processing);
    try {
      const [res] = await Promise.all([api.post('/api/payments/card', payload), sleep(1100)]);
      handlePaymentResult(container, res, { amount, fiat, credit, modal, retry: () => cardStep(container, { amount, fiat, credit, savedCard, modal }) });
    } catch (err) {
      container.innerHTML = '';
      cardStep(container, { amount, fiat, credit, savedCard, modal });
      const form = container.querySelector('form');
      showFieldErrors(form, err);
    }
  });
}

function handlePaymentResult(container, res, opts) {
  if (res.user) setUser(res.user);
  const p = res.payment;
  if (p.status === 'requires_action') return threeDS(container, p, opts);
  if (p.status === 'succeeded') return paymentSuccess(container, res, opts);
  return paymentFailed(container, p, opts);
}

function threeDS(container, payment, opts) {
  const sym = CURRENCIES[opts.fiat].symbol;
  container.innerHTML = '';
  const view = el(`<div>
    <div class="muted" style="margin-bottom:10px;font-size:13px">Your bank needs to confirm this payment.</div>
    <div class="threeds">
      <div class="threeds-head"><span>${icon('shield', 18)} DemoBank SecureCode</span>${brandChip(payment.brand)}</div>
      <div class="threeds-body">
        <div style="font-weight:800;font-size:15px;margin-bottom:8px">Verify your purchase</div>
        <div class="muted" style="display:grid;grid-template-columns:auto 1fr;gap:4px 14px;margin-bottom:14px">
          <span>Merchant</span><b style="color:#1c2633">Fakesino (demo)</b>
          <span>Amount</span><b style="color:#1c2633">${sym}${fmt.amount(payment.amount, opts.fiat)}</b>
          <span>Card</span><b style="color:#1c2633">•••• ${esc(payment.last4)}</b>
        </div>
        <p class="muted" style="margin:0 0 10px">We sent a one-time code to your phone. For this demo, the code is <b style="color:#1c2633">${DEMO_3DS_CODE}</b>.</p>
        <form><div class="field" data-field="code"><input class="input" name="code" inputmode="numeric" maxlength="6" placeholder="••••••" autocomplete="one-time-code"><div class="field-error"></div></div>
        <div class="field-error form-error" style="margin-bottom:8px"></div>
        <button class="btn btn-blue btn-block" type="submit">Submit</button>
        <button class="btn btn-secondary btn-block" type="button" data-act="cancel" style="margin-top:8px">Cancel payment</button></form>
      </div>
    </div></div>`);
  container.appendChild(view);
  const form = view.querySelector('form');
  setTimeout(() => form.querySelector('input').focus(), 30);
  const submit = async (body) => {
    const btn = form.querySelector('[type=submit]');
    btn.classList.add('loading');
    try {
      const res = await api.post(`/api/payments/${payment.id}/authenticate`, body);
      handlePaymentResult(container, res, opts);
    } catch (err) {
      btn.classList.remove('loading');
      if (err.code === 'authentication_failed') return paymentFailed(container, { ...payment, message: err.message }, opts);
      showFieldErrors(form, err);
    }
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit({ code: form.code.value.trim() });
  });
  view.querySelector('[data-act=cancel]').addEventListener('click', () => submit({ cancel: true }));
}

function paymentSuccess(container, res, { modal }) {
  const tx = res.transaction;
  container.innerHTML = '';
  const view = el(`<div class="success-state">
    <div class="check">${icon('check', 34)}</div>
    <h3>Deposit successful</h3>
    <div class="muted">Your play-money balance has been topped up.</div>
    <div class="summary" style="text-align:left;margin-top:16px">
      <div class="line"><span>Credited</span><b style="display:flex;gap:6px;align-items:center">${fmt.amount(tx.amount, tx.currency)} ${coin(tx.currency)}</b></div>
      <div class="line"><span>Paid</span><b>${CURRENCIES[tx.fiat.currency].symbol}${fmt.amount(tx.fiat.amount, tx.fiat.currency)} · ${brandChip(tx.details.brand)} •••• ${esc(tx.details.last4)}</b></div>
      <div class="line"><span>Reference</span><b class="mono" style="font-size:12px">${esc(tx.ref.slice(0, 16))}</b></div>
    </div>
    <button class="btn btn-primary btn-block btn-lg" data-act="play">Start playing</button>
  </div>`);
  container.appendChild(view);
  if (currency() !== tx.currency) setCurrency(tx.currency);
  toastSuccess('Deposit confirmed', `${fmt.amount(tx.amount, tx.currency)} ${tx.currency} added to your balance`);
  view.querySelector('[data-act=play]').addEventListener('click', () => modal.close());
}

function paymentFailed(container, payment, opts) {
  container.innerHTML = '';
  const view = el(`<div class="success-state fail">
    <div class="check">${icon('close', 30)}</div>
    <h3>Payment declined</h3>
    <div class="muted">${esc(payment.message || 'Your card was declined.')}</div>
    ${payment.declineCode ? `<div class="pill red" style="margin-top:10px">${esc(payment.declineCode)}</div>` : ''}
    <button class="btn btn-secondary btn-block btn-lg" data-act="retry" style="margin-top:18px">Try another card</button>
  </div>`);
  container.appendChild(view);
  view.querySelector('[data-act=retry]').addEventListener('click', () => opts.retry());
}

// --- crypto deposit -----------------------------------------------------------

function fakeQr(text, size = 29) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
  const cells = [];
  const finder = (x, y) => {
    for (const [fx, fy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
      const dx = x - fx;
      const dy = y - fy;
      if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7) return dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4) ? 1 : 0;
      if (dx >= -1 && dx <= 7 && dy >= -1 && dy <= 7) return 0;
    }
    return null;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const f = finder(x, y);
      if (f === 1 || (f === null && rand() < 0.48)) cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    }
  return `<svg class="qr" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><g fill="#0f1822">${cells.join('')}</g></svg>`;
}

function cryptoDeposit(container, code, offs) {
  const view = el('<div><div class="spinner"></div></div>');
  container.appendChild(view);
  api
    .post('/api/payments/crypto/address', { currency: code })
    .then((info) => {
      view.innerHTML = `
        <div class="field"><div class="field-label"><span>Network</span></div><div class="input" style="display:flex;align-items:center">${esc(info.network)}</div></div>
        <div class="field"><div class="field-label"><span>Your ${code} deposit address</span><button class="link" data-act="regen" style="font-size:12px">New address</button></div>
          <div class="address-box"><span style="flex:1" class="addr">${esc(info.address)}</span><button class="btn btn-secondary btn-sm" data-act="copy">${icon('copy', 14)} Copy</button></div></div>
        <div class="qr-wrap">${fakeQr(info.address)}<div class="muted" style="font-size:12.5px">Only send <b>${code}</b> to this address. Credited after <b>${info.confirmations}</b> confirmation${info.confirmations > 1 ? 's' : ''}.
          <div class="demo-notice warn" style="margin:10px 0 0">${icon('alert', 16)}<div>This is a fake address that exists on no blockchain. Never send real crypto to it — it would be lost.</div></div></div></div>
        <div class="divider"></div>
        <div style="font-weight:800;margin-bottom:8px">Simulate an incoming transfer</div>
        <div class="muted" style="font-size:13px;margin-bottom:10px">Pretend you sent ${code} from another wallet. It shows up as pending and confirms block by block, just like a real deposit.</div>
        <div class="field" data-field="amount"><div class="field-label"><span>Amount</span><span class="aux muted"></span></div>
          <div class="input-group"><div class="input-icon"><input class="input" inputmode="decimal" value="${fmt.inputAmount(roundDown(code, 100 / CURRENCIES[code].usd), code)}"><span class="suffix">${coin(code)}</span></div>
          ${[100, 1000].map((u) => `<button class="addon" data-usd="${u}">$${u >= 1000 ? `${u / 1000}k` : u}</button>`).join('')}</div><div class="field-error"></div></div>
        <button class="btn btn-primary btn-block btn-lg" data-act="send">Send test transaction</button>
        <div class="tx-list"></div>`;
      const amountInput = view.querySelector('[data-field=amount] input');
      const aux = view.querySelector('.aux');
      const updateAux = () => (aux.textContent = `≈ ${fmt.fiat(fmt.usdOf(Number(amountInput.value) || 0, code))}`);
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
      view.querySelector('[data-act=regen]').addEventListener('click', async () => {
        await api.post('/api/payments/crypto/address', { currency: code, regenerate: true });
        container.innerHTML = '';
        cryptoDeposit(container, code, offs);
      });
      const txList = view.querySelector('.tx-list');
      view.querySelector('[data-act=send]').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.classList.add('loading');
        try {
          const { transaction } = await api.post('/api/payments/crypto/simulate', { currency: code, amount: Number(amountInput.value) });
          txList.prepend(txRow(transaction));
        } catch (err) {
          showFieldErrors(view, err);
        } finally {
          btn.classList.remove('loading');
        }
      });
      offs.push(
        bus.on('live:tx', (tx) => {
          const row = txList.querySelector(`[data-tx="${tx.id}"]`);
          if (row) row.replaceWith(txRow(tx));
          if (tx.status === 'completed' && tx.type === 'deposit') toastSuccess('Deposit confirmed', `${fmt.amount(tx.amount, tx.currency)} ${tx.currency} credited`);
        }),
      );
    })
    .catch((err) => (view.innerHTML = `<div class="empty">${esc(err.message)}</div>`));
}

function txRow(tx) {
  const d = tx.details || {};
  const pct = d.required ? Math.min(100, (d.confirmations / d.required) * 100) : 100;
  return el(`<div class="tx-progress" data-tx="${tx.id}">${coin(tx.currency, 22)}
    <div style="flex:1;min-width:0"><div class="row between"><b>${fmt.amount(tx.amount, tx.currency)} ${tx.currency}</b>
      ${tx.status === 'completed' ? '<span class="pill green">Confirmed</span>' : `<span class="pill yellow">${d.confirmations}/${d.required} confirmations</span>`}</div>
      <div class="progress" style="margin-top:8px"><div style="width:${pct}%"></div></div></div></div>`);
}

// ---------------------------------------------------------------------------
// Buy crypto (card → crypto)

function buyTab({ body, offs, modal }) {
  let credit = CURRENCIES[currency()].type === 'crypto' ? currency() : 'BTC';
  const top = el('<div></div>');
  const content = el('<div></div>');
  body.append(top, content);
  currencyPicker(top, {
    label: 'Receive',
    value: credit,
    filter: (c) => CURRENCIES[c].type === 'crypto',
    onChange: (c) => {
      credit = c;
      render();
    },
  });
  const render = () => {
    content.innerHTML = '';
    fiatDeposit(content, { fiat: 'USD', credit, offs, modal, title: `Pay by card and receive ${credit} instantly at the reference rate.` });
  };
  render();
}

// ---------------------------------------------------------------------------
// Withdraw

function withdrawTab({ body, offs }) {
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
  async function render() {
    content.innerHTML = '';
    const cfg = state.config.payments;
    const isCrypto = CURRENCIES[code].type === 'crypto';
    const fee = isCrypto ? roundDown(code, cfg.fees[code] / CURRENCIES[code].usd) : 0;
    const cards = state.user.cards || [];
    const view = el(`<form novalidate>
      ${
        isCrypto
          ? `<div class="field" data-field="address"><label class="field-label">${code} address <span class="muted">${esc(CURRENCIES[code].network)}</span></label><input class="input mono" name="address" placeholder="Paste any address (demo)" autocomplete="off"><div class="field-error"></div></div>`
          : cards.length
            ? `<div class="field" data-field="card"><div class="field-label">Withdraw to</div><div class="method-list">${cards
                .map((c, i) => `<label class="method ${i === 0 ? 'selected' : ''}"><input type="radio" name="cardId" value="${c.id}" ${i === 0 ? 'checked' : ''} hidden>${icon('card', 20)}<div><div class="m-title">•••• ${esc(c.last4)}</div><div class="m-sub">${esc(c.name)}</div></div><div class="m-right">${brandChip(c.brand)}</div></label>`)
                .join('')}</div><div class="field-error"></div></div>`
            : `<div class="demo-notice">${icon('info', 16)}<div>Make a card deposit first — fiat withdrawals go back to a card you've used.</div></div>`
      }
      <div class="field" data-field="amount"><div class="field-label"><span>Amount</span><span class="muted aux"></span></div>
        <div class="input-group"><div class="input-icon"><input class="input" name="amount" inputmode="decimal" value="${fmt.inputAmount(0, code)}"><span class="suffix">${coin(code)}</span></div><button type="button" class="addon" data-act="max">Max</button></div>
        <div class="field-error"></div></div>
      <div class="summary"></div>
      <div class="field-error form-error" style="margin-bottom:10px"></div>
      <button class="btn btn-primary btn-block btn-lg" type="submit" ${!isCrypto && !cards.length ? 'disabled' : ''}>Withdraw</button>
      <div class="muted" style="font-size:12px;text-align:center;margin-top:10px">Minimum withdrawal $${cfg.withdrawMinUsd} equivalent. Play money leaves your balance and lands nowhere real.</div>
    </form>`);
    content.appendChild(view);
    const amountInput = view.querySelector('[name=amount]');
    const summary = view.querySelector('.summary');
    const update = () => {
      const a = Number(amountInput.value) || 0;
      view.querySelector('.aux').textContent = `Balance ${fmt.amount(balanceOf(code), code)}`;
      summary.innerHTML = `<div class="line"><span>Amount</span><b>${fmt.amount(a, code)} ${code}</b></div>
        ${isCrypto ? `<div class="line"><span>Network fee</span><b>${fmt.amount(fee, code)} ${code}</b></div>` : '<div class="line"><span>Processing time</span><b>~5 seconds (simulated)</b></div>'}
        <div class="line total"><span>You receive</span><b>${fmt.amount(Math.max(0, a - fee), code)} ${code}</b></div>`;
    };
    update();
    amountInput.addEventListener('input', update);
    view.querySelector('[data-act=max]').addEventListener('click', () => {
      amountInput.value = fmt.inputAmount(balanceOf(code), code);
      update();
    });
    on(view, 'change', 'input[name=cardId]', () => view.querySelectorAll('label.method').forEach((l) => l.classList.toggle('selected', l.querySelector('input').checked)));
    view.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = view.querySelector('[type=submit]');
      btn.classList.add('loading');
      const fd = Object.fromEntries(new FormData(view));
      try {
        const { transaction, user } = await api.post('/api/payments/withdraw', { currency: code, amount: Number(fd.amount), address: fd.address, cardId: fd.cardId });
        setUser(user);
        picker.refresh();
        content.innerHTML = '';
        const done = el(`<div class="success-state"><div class="check">${icon('arrowUp', 30)}</div><h3>Withdrawal requested</h3>
          <div class="muted">${fmt.amount(transaction.amount, code)} ${code} is on its way to ${isCrypto ? 'your address' : 'your card'}.</div>
          <div class="tx-progress" style="justify-content:space-between"><span>Status</span><span class="pill yellow status">Pending</span></div>
          <button class="btn btn-secondary btn-block" style="margin-top:16px" data-act="again">Make another withdrawal</button></div>`);
        content.appendChild(done);
        done.querySelector('[data-act=again]').addEventListener('click', render);
        offs.push(
          bus.on('live:tx', (tx) => {
            if (tx.id === transaction.id && tx.status === 'completed') {
              const s = done.querySelector('.status');
              s.className = 'pill green status';
              s.textContent = 'Completed';
            }
          }),
        );
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
        const { user } = await api.post('/api/wallet/vault', { currency: code, amount: Number(view.amount.value), direction });
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
