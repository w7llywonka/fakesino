import { el, esc, on, copyText } from '../dom.js';
import { icon, coin } from '../icons.js';
import { api } from '../api.js';
import { bus } from '../state.js';
import { setQuery } from '../router.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import { brandChip } from './wallet.js';
import * as fmt from '../format.js';

const TYPE_LABEL = { deposit: 'Deposit', withdrawal: 'Withdrawal', swap: 'Swap', tip: 'Tip', rain: 'Rain', bonus: 'Bonus', vault: 'Vault transfer' };
const STATUS = { completed: ['green', 'Completed'], pending: ['yellow', 'Pending'], failed: ['red', 'Failed'] };

export const explorerLink = (t) => (t.details?.txHash ? `/explorer/${encodeURIComponent(t.details.network || t.currency.toLowerCase())}/tx/${t.details.txHash}` : null);

// Transaction details, opened from the Transactions page (?modal=tx&id=…).
export async function openTxModal(id) {
  const modal = openModal({ title: 'Transaction', iconName: 'list', onClose: () => setQuery({ modal: null, id: null }, { replace: true }) });
  modal.setBody('<div class="spinner"></div>');
  let tx;
  try {
    ({ transaction: tx } = await api.get(`/api/wallet/transactions/${encodeURIComponent(id)}`));
  } catch (err) {
    modal.setBody(`<div class="empty">${esc(err.message)}</div>`);
    return modal;
  }
  const off = bus.on('live:tx', (t) => {
    if (t.id !== tx.id) return;
    tx = t;
    render();
  });
  const prev = modal.onClose;
  modal.onClose = () => {
    off();
    prev?.();
  };
  function render() {
    const view = el(`<div class="txd">${body(tx)}</div>`);
    on(view, 'click', '[data-copy]', async (e, b) => {
      await copyText(b.dataset.copy);
      toast({ type: 'success', title: 'Copied' });
    });
    modal.setBody(view);
  }
  render();
  return modal;
}

function line(label, value, copy = null) {
  if (value == null || value === '') return '';
  return `<div class="line"><span>${label}</span><span class="txd-val">${value}${copy ? ` <button class="icon-btn" data-copy="${esc(copy)}" aria-label="Copy">${icon('copy', 14)}</button>` : ''}</span></div>`;
}

const short = (s, n = 10) => (s && s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s || '');

function body(t) {
  const d = t.details || {};
  const [cls, label] = STATUS[t.status] || ['', t.status];
  const out = t.type === 'withdrawal' || t.method === 'vault_in' || d.direction === 'out';
  const typeLabel = t.method === 'buy' ? 'Crypto purchase' : TYPE_LABEL[t.type] || t.type;

  // Timeline: submitted → confirming → completed / failed.
  const steps = [['Submitted', t.createdAt, true]];
  if (d.required) steps.push([`Confirmations ${Math.min(d.confirmations ?? 0, d.required)}/${d.required}`, null, (d.confirmations ?? 0) > 0 || t.status !== 'pending']);
  if (t.status === 'failed') steps.push([d.reason || d.declineCode ? `Failed — ${esc(d.reason || d.declineCode)}` : 'Failed', t.updatedAt, true, 'red']);
  else steps.push(['Completed', t.status === 'completed' ? t.updatedAt : null, t.status === 'completed']);

  const link = explorerLink(t);
  const amountHtml =
    t.type === 'swap'
      ? `<span class="row" style="gap:8px;justify-content:center">${coin(d.from, 22)} ${fmt.amount(d.fromAmount, d.from)} ${d.from} ${icon('right', 16)} ${coin(t.currency, 22)} ${fmt.amount(t.amount, t.currency)} ${t.currency}</span>`
      : `<span class="row" style="gap:8px;justify-content:center">${coin(t.currency, 24)} ${out ? '-' : ''}${fmt.amount(t.amount, t.currency)} ${t.currency}</span>`;

  return `
    <div class="txd-head"><div class="muted">${esc(typeLabel)}</div><div class="txd-amount">${amountHtml}</div>
      ${t.fiat ? `<div class="dim">${fmt.money(t.fiat.amount, t.fiat.currency)} charged to the demo card</div>` : ''}
      <span class="pill ${cls}">${esc(label)}</span></div>
    <ol class="txd-steps">${steps.map(([s, ts, done, c]) => `<li class="${done ? 'done' : ''} ${c || ''}"><span class="dot"></span><span>${s}</span><span class="dim">${ts ? fmt.dateTime(ts) : ''}</span></li>`).join('')}</ol>
    <div class="summary">
      ${line('Transaction ID', `<span class="mono">${esc(t.ref)}</span>`, t.ref)}
      ${line('Date', fmt.dateTime(t.createdAt))}
      ${line('Currency', `${coin(t.currency)} ${t.currency}`)}
      ${line('Network', d.networkLabel ? esc(d.networkLabel) : '')}
      ${d.provider ? line('Provider', `${esc(d.provider)} <span class="dim">(fictional)</span>`) : ''}
      ${d.rate && t.type === 'swap' ? line('Rate', `1 ${d.from} = ${fmt.rate(d.rate)} ${d.to}`) : ''}
      ${d.rate && t.method === 'buy' ? line('Rate', `1 ${t.currency} = ${fmt.money(d.rate, d.fiatCurrency)}`) : ''}
      ${t.type === 'swap' ? line('Fee', `${fmt.amount(d.fee, d.from)} ${d.from}`) : ''}
      ${t.method === 'buy' ? line('Fees', `${fmt.money(d.fee, d.fiatCurrency)} + ${fmt.amount(d.networkFee, t.currency)} ${t.currency} network`) : ''}
      ${t.type === 'withdrawal' && d.fee != null && t.method === 'crypto' ? line('Network fee', `${fmt.amount(d.fee, t.currency)} ${t.currency}`) : ''}
      ${d.address ? line(t.type === 'withdrawal' ? 'To address' : 'Deposit address', `<span class="mono">${esc(short(d.address, 8))}</span>`, d.address) : ''}
      ${d.txHash ? line('Tx hash', `<span class="mono">${esc(short(d.txHash, 8))}</span>`, d.txHash) : ''}
      ${d.required ? line('Confirmations', `${Math.min(d.confirmations ?? 0, d.required)}/${d.required}`) : ''}
      ${d.brand ? line('Card', `${brandChip(d.brand)} •••• ${esc(d.last4 || '')}${d.threeDS ? ' <span class="pill blue">3DS</span>' : ''}`) : ''}
      ${d.declineCode ? line('Decline code', `<span class="mono">${esc(d.declineCode)}</span>`) : ''}
      ${d.counterparty ? line(d.direction === 'out' ? 'To' : 'From', `@${esc(d.counterparty)}`) : ''}
      ${d.from && t.type !== 'swap' && typeof d.from === 'string' ? line('From', esc(d.from)) : ''}
      ${d.users ? line('Recipients', String(d.users)) : ''}
    </div>
    ${link ? `<a class="btn btn-secondary btn-block" style="margin-top:14px" href="${link}">${icon('globe', 16)} View on explorer</a>` : ''}`;
}
