import { el, esc, on } from '../dom.js';
import { icon, coin } from '../icons.js';
import { api } from '../api.js';
import { state, bus } from '../state.js';
import { bySlug } from '../games/registry.js';
import { navigate, setQuery } from '../router.js';
import { brandChip } from '../ui/wallet.js';
import * as fmt from '../format.js';

const TABS = [
  ['deposits', 'Deposits', 'deposit'],
  ['withdrawals', 'Withdrawals', 'withdrawal'],
  ['bets', 'Bets', null],
  ['bonuses', 'Bonuses', 'bonus'],
  ['vault', 'Vault', 'vault'],
];

const STATUS = { completed: 'green', pending: 'yellow', failed: 'red' };

export default async function transactionsPage(page, { tab = 'deposits' }) {
  document.title = 'Transactions — Fakesino';
  if (!state.user) {
    page.innerHTML = `<div class="empty" style="padding:80px 0">${icon('lock', 32)}<div style="margin:10px 0 16px">Sign in to see your transactions.</div><a class="btn btn-blue" href="?modal=auth&tab=login">Sign In</a></div>`;
    return;
  }
  if (!TABS.some(([k]) => k === tab)) tab = 'deposits';
  const root = el(`<div><div class="page-title">${icon('list', 22)} Transactions</div>
    <div class="tabs" style="margin-bottom:16px">${TABS.map(([k, l]) => `<a class="tab ${k === tab ? 'active' : ''}" href="/transactions/${k}">${l}</a>`).join('')}</div>
    <div class="table-wrap"><table class="table"><thead></thead><tbody><tr><td><div class="spinner"></div></td></tr></tbody></table></div></div>`);
  page.appendChild(root);
  const thead = root.querySelector('thead');
  const tbody = root.querySelector('tbody');

  const load = async () => {
    if (tab === 'bets') {
      const { bets } = await api.get('/api/bets/mine?limit=100');
      thead.innerHTML = '<tr><th>Game</th><th>Bet ID</th><th class="hide-mobile">Date</th><th class="r">Bet Amount</th><th class="r">Multiplier</th><th class="r">Payout</th></tr>';
      tbody.innerHTML = bets.length
        ? bets
            .map((b) => {
              const p = b.payout - b.amount;
              return `<tr class="clickable" data-id="${b.id}"><td><span class="cell-game">${icon(b.game, 16)} ${esc(bySlug[b.game]?.name || b.game)}</span></td><td class="dim">${b.id}</td>
            <td class="hide-mobile">${fmt.dateTime(b.createdAt)}</td><td class="r"><span class="amt">${fmt.money(b.amount, b.currency)} ${coin(b.currency)}</span></td>
            <td class="r">${fmt.multiplier(b.multiplier)}</td><td class="r"><span class="amt ${p > 0 ? 'win-text' : p < 0 ? 'loss-text' : ''}">${p < 0 ? '-' : ''}${fmt.money(Math.abs(p), b.currency)} ${coin(b.currency)}</span></td></tr>`;
            })
            .join('')
        : `<tr><td colspan="6"><div class="empty">No bets yet. <a class="link" href="/casino">Find a game</a></div></td></tr>`;
      return;
    }
    const type = TABS.find(([k]) => k === tab)[2];
    const { transactions } = await api.get(`/api/wallet/transactions?type=${type}&limit=100`);
    thead.innerHTML = '<tr><th>Date</th><th>Method</th><th class="r">Amount</th><th class="r">Status</th><th class="hide-mobile">Reference</th></tr>';
    tbody.innerHTML = transactions.length
      ? transactions.map(txRow).join('')
      : `<tr><td colspan="5"><div class="empty">Nothing here yet. ${type === 'deposit' ? '<a class="link" href="?modal=wallet&tab=deposit">Make a deposit</a>' : ''}</div></td></tr>`;
  };

  on(root, 'click', 'tr[data-id]', (e, tr) => setQuery({ modal: 'bet', id: tr.dataset.id }));
  const off = bus.on('live:tx', () => tab !== 'bets' && load());
  load().catch((err) => (tbody.innerHTML = `<tr><td><div class="empty">${esc(err.message)}</div></td></tr>`));
  return () => off();
}

function methodLabel(t) {
  const d = t.details || {};
  if (t.method === 'card') return `${brandChip(d.brand || 'unknown')} •••• ${esc(d.last4 || '')}${d.threeDS ? ' <span class="pill blue">3DS</span>' : ''}`;
  if (t.method === 'crypto') return `${coin(t.currency)} ${esc(d.network || t.currency)} ${d.address ? `<span class="dim mono" style="font-size:11px">${esc(d.address.slice(0, 14))}…</span>` : ''}`;
  if (t.method === 'daily_reload') return `${icon('gift', 16)} Daily reload`;
  if (t.method === 'rakeback') return `${icon('coins', 16)} Rakeback`;
  if (t.method === 'vault_in') return `${icon('vault', 16)} Wallet → Vault`;
  if (t.method === 'vault_out') return `${icon('vault', 16)} Vault → Wallet`;
  return esc(t.method);
}

function txRow(t) {
  const d = t.details || {};
  const status = t.status === 'pending' && d.required ? `${d.confirmations}/${d.required} conf.` : t.status;
  const fiat = t.fiat ? `<div class="dim" style="font-size:12px">${fmt.money(t.fiat.amount, t.fiat.currency)} charged</div>` : '';
  return `<tr><td>${fmt.dateTime(t.createdAt)}</td><td><span class="row" style="gap:6px">${methodLabel(t)}</span></td>
    <td class="r"><span class="amt">${t.type === 'withdrawal' || t.method === 'vault_in' ? '-' : ''}${fmt.amount(t.amount, t.currency)} ${coin(t.currency)}</span>${fiat}</td>
    <td class="r"><span class="pill ${STATUS[t.status] || ''}">${esc(status)}</span>${d.declineCode ? `<div class="dim" style="font-size:11px">${esc(d.declineCode)}</div>` : ''}</td>
    <td class="hide-mobile dim mono" style="font-size:12px">${esc((t.ref || '').slice(0, 12))}</td></tr>`;
}

export { navigate };
