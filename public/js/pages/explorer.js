import { el, esc, on, copyText } from '../dom.js';
import { icon, coin } from '../icons.js';
import { api } from '../api.js';
import { bus } from '../state.js';
import { toast } from '../ui/toast.js';
import * as fmt from '../format.js';

// In-app block explorer for the simulated chains. Every hash here exists only
// inside Fakesino; no real network is queried.
export default async function explorerPage(page, { hash }) {
  document.title = 'Explorer — Fakesino';
  const root = el(`<div class="explorer"><div class="page-title">${icon('globe', 22)} Explorer</div>
    <div class="demo-notice">${icon('info', 16)}<div>Simulated explorer. These transactions exist only inside Fakesino’s play-money networks.</div></div>
    <div class="card explorer-card"><div class="spinner"></div></div></div>`);
  page.appendChild(root);
  const card = root.querySelector('.explorer-card');
  let timer = null;

  const load = async () => {
    try {
      const { tx } = await api.get(`/api/explorer/tx/${encodeURIComponent(hash)}`);
      render(tx);
      clearTimeout(timer);
      if (tx.status === 'pending') timer = setTimeout(load, 3000);
    } catch (err) {
      card.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    }
  };

  function render(tx) {
    const cls = { confirmed: 'green', pending: 'yellow', failed: 'red' }[tx.status];
    const row = (label, value, copy) => `<div class="ex-row"><div class="ex-label">${label}</div><div class="ex-val">${value}${copy ? ` <button class="icon-btn" data-copy="${esc(copy)}" aria-label="Copy">${icon('copy', 14)}</button>` : ''}</div></div>`;
    card.innerHTML = `
      <div class="ex-head">${coin(tx.coin, 28)}<div><div class="ex-title">Transaction</div><div class="dim">${esc(tx.networkLabel)}</div></div><span class="pill ${cls}" style="margin-left:auto">${esc(tx.status)}</span></div>
      ${row('Hash', `<span class="mono">${esc(tx.hash)}</span>`, tx.hash)}
      ${row('Status', `<span class="pill ${cls}">${esc(tx.status)}</span>`)}
      ${row('Block', tx.blockHeight != null ? `<span class="mono">${tx.blockHeight.toLocaleString('en-US')}</span>` : '<span class="dim">Unconfirmed</span>')}
      ${row('Confirmations', String(tx.confirmations))}
      ${row('Timestamp', fmt.dateTime(tx.timestamp))}
      ${row('From', `<span class="mono">${esc(tx.from)}</span>`, tx.from)}
      ${row('To', `<span class="mono">${esc(tx.to)}</span>`, tx.to)}
      ${row('Value', `${coin(tx.coin)} ${fmt.amount(tx.amount, tx.coin)} ${tx.coin}`)}
      ${tx.fee != null ? row('Fee', `${fmt.amount(tx.fee, tx.coin)} ${tx.coin}`) : ''}`;
  }

  on(root, 'click', '[data-copy]', async (e, b) => {
    await copyText(b.dataset.copy);
    toast({ type: 'success', title: 'Copied' });
  });
  const off = bus.on('live:tx', (t) => t.details?.txHash === hash && load());
  await load();
  return () => {
    off();
    clearTimeout(timer);
  };
}
