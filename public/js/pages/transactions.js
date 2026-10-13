import { el, esc, on } from '../dom.js';
import { icon, coin } from '../icons.js';
import { api } from '../api.js';
import { state, bus } from '../state.js';
import { bySlug, GAMES } from '../games/registry.js';
import { toastError } from '../ui/toast.js';
import { navigate, setQuery } from '../router.js';
import { brandChip } from '../ui/wallet.js';
import * as fmt from '../format.js';

const TABS = [
  ['deposits', 'Deposits', 'deposit'],
  ['withdrawals', 'Withdrawals', 'withdrawal'],
  ['purchases', 'Purchases', 'purchase'],
  ['swaps', 'Swaps', 'swap'],
  ['tips', 'Tips / Rain', 'tips'],
  ['bonuses', 'Bonuses', 'bonus'],
  ['vault', 'Vault', 'vault'],
  ['bets', 'Bets', null],
  ['archive', 'Archive', null],
];

const STATUS = { completed: 'green', pending: 'yellow', failed: 'red' };
const OFFER_LABEL = { weekly: 'Weekly bonus', monthly: 'Monthly bonus', levelup: 'Level-up bonus', reload: 'Reload', daily: 'Daily bonus' };
const EMPTY_CTA = {
  deposit: '<a class="link" href="?modal=wallet&tab=deposit">Make a deposit</a>',
  purchase: '<a class="link" href="?modal=wallet&tab=buy">Buy crypto</a>',
  swap: '<a class="link" href="?modal=wallet&tab=swap">Swap crypto</a>',
  tips: '<a class="link" href="?modal=wallet&tab=tip">Send a tip</a>',
};

export default async function transactionsPage(page, { tab = 'deposits' }) {
  document.title = 'Transactions — Fakesino';
  if (!state.user) {
    page.innerHTML = '<div class="spinner"></div>';
    return;
  }
  if (!TABS.some(([k]) => k === tab)) tab = 'deposits';
  const type = TABS.find(([k]) => k === tab)[2];
  let status = '';
  let bonusView = 'claimed';
  const root = el(`<div><div class="page-title">${icon('list', 22)} Transactions</div>
    <div class="tabs tx-tabs" style="margin-bottom:16px">${TABS.map(([k, l]) => `<a class="tab ${k === tab ? 'active' : ''}" href="/transactions/${k}">${l}</a>`).join('')}</div>
    <div class="row tx-filters" style="gap:10px;margin-bottom:12px;flex-wrap:wrap">
      ${tab === 'bonuses' ? '<div class="segmented" data-bonus><button type="button" data-v="claimed" class="active">Claimed</button><button type="button" data-v="unclaimed">Unclaimed</button></div>' : ''}
      ${tab === 'bets' ? `<select class="select" data-game style="width:auto;min-width:170px"><option value="">All games</option>${GAMES.map((g) => `<option value="${g.slug}">${esc(g.name)}</option>`).join('')}</select>` : ''}
      ${!['bets', 'vault', 'archive'].includes(tab) ? `<select class="select" data-status style="width:auto;min-width:150px"><option value="">All statuses</option><option value="completed">Completed</option><option value="pending">Pending</option><option value="failed">Failed</option></select>` : ''}
    </div>
    <div class="table-wrap"><table class="table"><thead></thead><tbody><tr><td><div class="spinner"></div></td></tr></tbody></table></div>
    <div class="pager" hidden><button class="btn btn-secondary btn-sm" data-page="prev">${icon('left', 14)} Previous</button><span class="dim pager-label"></span><button class="btn btn-secondary btn-sm" data-page="next">Next ${icon('right', 14)}</button></div></div>`);
  page.appendChild(root);
  const thead = root.querySelector('thead');
  const tbody = root.querySelector('tbody');
  const filters = root.querySelector('.tx-filters');
  if (!filters.children.length) filters.remove();

  const pager = root.querySelector('.pager');
  let game = '';
  const cursors = []; // `before` ids of the pages behind this one
  let before = null;
  const PAGE = 25;

  const load = async () => {
    if (tab === 'archive') {
      const { days } = await api.get('/api/bets/archive');
      thead.innerHTML = '<tr><th>Date (UTC)</th><th class="r">Bets</th><th class="r hide-mobile">Wagered</th><th class="r"></th></tr>';
      tbody.innerHTML = days.length
        ? days
            .map((d) => `<tr><td>${esc(d.day)}</td><td class="r">${d.bets.toLocaleString()}</td><td class="r hide-mobile">${fmt.fiat(d.wageredUsd)}</td>
              <td class="r"><button class="btn btn-secondary btn-sm" data-archive="${esc(d.day)}">${icon('arrowDown', 14)} JSON</button></td></tr>`)
            .join('')
        : '<tr><td colspan="4"><div class="empty">No bets to archive yet.</div></td></tr>';
      return;
    }
    if (tab === 'bets') {
      const { bets, hasMore } = await api.get(`/api/bets/mine?limit=${PAGE}${game ? `&game=${game}` : ''}${before ? `&before=${before}` : ''}`);
      pager.hidden = !cursors.length && !hasMore;
      pager.querySelector('[data-page=prev]').disabled = !cursors.length;
      pager.querySelector('[data-page=next]').disabled = !hasMore;
      pager.querySelector('[data-page=next]').dataset.before = bets.length ? bets[bets.length - 1].id : '';
      pager.querySelector('.pager-label').textContent = `Page ${cursors.length + 1}`;
      thead.innerHTML = '<tr><th>Game</th><th>Bet ID</th><th class="hide-mobile">Date</th><th class="r">Bet Amount</th><th class="r">Multiplier</th><th class="r">Payout</th></tr>';
      tbody.innerHTML = bets.length
        ? bets
            .map((b) => {
              const p = b.payout - b.amount;
              return `<tr class="clickable" data-bet="${b.id}"><td><span class="cell-game">${icon(b.game, 16)} ${esc(bySlug[b.game]?.name || b.game)}</span></td><td class="dim">${b.id}</td>
            <td class="hide-mobile">${fmt.dateTime(b.createdAt)}</td><td class="r"><span class="amt">${fmt.money(b.amount, b.currency)} ${coin(b.currency)}</span></td>
            <td class="r">${fmt.multiplier(b.multiplier)}</td><td class="r"><span class="amt ${p > 0 ? 'win-text' : p < 0 ? 'loss-text' : ''}">${p < 0 ? '-' : ''}${fmt.money(Math.abs(p), b.currency)} ${coin(b.currency)}</span></td></tr>`;
            })
            .join('')
        : `<tr><td colspan="6"><div class="empty">No bets yet. <a class="link" href="/casino">Find a game</a></div></td></tr>`;
      return;
    }
    if (tab === 'bonuses' && bonusView === 'unclaimed') {
      const { offers, upcoming } = await api.get('/api/bonus/offers');
      const rows = [...offers.map((o) => ({ ...o, ready: true })), ...upcoming];
      thead.innerHTML = '<tr><th>Bonus</th><th class="r">Amount</th><th class="hide-mobile">Available</th><th>Expires</th><th class="r"></th></tr>';
      tbody.innerHTML = rows.length
        ? rows
            .map(
              (o) => `<tr><td><span class="row" style="gap:6px">${icon('gift', 16)} ${esc(OFFER_LABEL[o.kind] || 'Bonus')}</span></td><td class="r"><span class="amt">${fmt.fiat(o.amountUsd)}</span></td>
            <td class="hide-mobile">${o.ready ? '<span class="pill green">Now</span>' : fmt.dateTime(o.releasedAt)}</td><td>${fmt.dateTime(o.expiresAt)}</td>
            <td class="r">${o.ready ? '<a class="btn btn-primary btn-sm" href="/vip?tab=bonuses">Claim</a>' : '<span class="dim">Upcoming</span>'}</td></tr>`,
            )
            .join('')
        : '<tr><td colspan="5"><div class="empty">No unclaimed bonuses right now. Keep playing to unlock weekly and monthly bonuses. <a class="link" href="/vip">VIP Club</a></div></td></tr>';
      return;
    }
    const { transactions } = await api.get(`/api/wallet/transactions?type=${type}&limit=100${status ? `&status=${status}` : ''}`);
    thead.innerHTML = '<tr><th>Date</th><th>Method</th><th class="r">Amount</th><th class="r">Status</th><th class="hide-mobile">Reference</th></tr>';
    tbody.innerHTML = transactions.length
      ? transactions.map(txRow).join('')
      : `<tr><td colspan="5"><div class="empty">Nothing here yet. ${status ? '' : EMPTY_CTA[type] || ''}</div></td></tr>`;
  };
  const reload = () => load().catch((err) => (tbody.innerHTML = `<tr><td><div class="empty">${esc(err.message)}</div></td></tr>`));

  on(root, 'click', 'tr[data-bet]', (e, tr) => setQuery({ modal: 'bet', id: tr.dataset.bet }));
  root.querySelector('[data-game]')?.addEventListener('change', (e) => {
    game = e.target.value;
    cursors.length = 0;
    before = null;
    reload();
  });
  on(root, 'click', '[data-page]', (e, b) => {
    if (b.dataset.page === 'next') {
      cursors.push(before);
      before = Number(b.dataset.before);
    } else before = cursors.pop() ?? null;
    reload();
  });
  on(root, 'click', '[data-archive]', async (e, b) => {
    b.classList.add('loading');
    try {
      const data = await api.get(`/api/bets/archive/${b.dataset.archive}`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `fakesino-bets-${data.day}.json` });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toastError(err);
    } finally {
      b.classList.remove('loading');
    }
  });
  on(root, 'click', 'tr[data-tx]', (e, tr) => setQuery({ modal: 'tx', id: tr.dataset.tx }));
  root.querySelector('[data-status]')?.addEventListener('change', (e) => {
    status = e.target.value;
    reload();
  });
  on(root, 'click', '[data-bonus] [data-v]', (e, b) => {
    bonusView = b.dataset.v;
    root.querySelectorAll('[data-bonus] [data-v]').forEach((x) => x.classList.toggle('active', x === b));
    root.querySelector('[data-status]').hidden = bonusView === 'unclaimed';
    reload();
  });
  const off = bus.on('live:tx', () => tab !== 'bets' && tab !== 'archive' && reload());
  reload();
  return () => off();
}

function methodLabel(t) {
  const d = t.details || {};
  if (t.method === 'buy') return `${coin(t.currency)} Purchased via ${esc(d.provider || 'provider')} <span class="dim" style="font-size:12px">${brandChip(d.brand || 'unknown')} •••• ${esc(d.last4 || '')}</span>`;
  if (t.method === 'bank') return `${icon('bank', 16)} Bank transfer <span class="dim mono" style="font-size:11px">${esc(d.reference || '')}</span>`;
  if (t.method === 'mobile_wallet') return `${icon('wallet', 16)} ${esc(d.wallet || 'Mobile wallet')}`;
  if (t.method === 'card') return `${brandChip(d.brand || 'unknown')} •••• ${esc(d.last4 || '')}${d.threeDS ? ' <span class="pill blue">3DS</span>' : ''}`;
  if (t.method === 'crypto') return `${coin(t.currency)} ${esc(d.networkLabel || d.network || t.currency)} ${d.address ? `<span class="dim mono" style="font-size:11px">${esc(d.address.slice(0, 14))}…</span>` : ''}`;
  if (t.type === 'swap') return `${coin(d.from)} ${icon('right', 12)} ${coin(t.currency)} ${d.from} → ${t.currency}`;
  if (t.type === 'tip') return `${icon('coins', 16)} ${d.direction === 'out' ? `Tip to @${esc(d.counterparty)}` : `Tip from @${esc(d.counterparty)}`}`;
  if (t.type === 'rain') return `${icon('coins', 16)} ${d.direction === 'out' ? `Rain · ${d.users} user${d.users === 1 ? '' : 's'}` : `Rain from ${esc(d.from || 'a player')}`}`;
  if (t.method === 'rain') return `${icon('coins', 16)} Rain from ${esc(d.from || 'RainBot')}`;
  if (t.method === 'daily_reload') return `${icon('gift', 16)} Daily reload`;
  const BONUS = { daily: 'Daily bonus', weekly: 'Weekly bonus', monthly: 'Monthly bonus', levelup: 'Level-up bonus', reload: 'Reload', welcome: 'Welcome offer', drop: 'Bonus drop' };
  if (BONUS[t.method]) return `${icon('gift', 16)} ${BONUS[t.method]}`;
  if (t.method === 'rakeback') return `${icon('coins', 16)} Rakeback`;
  if (t.method === 'affiliate') return `${icon('users', 16)} Affiliate commission`;
  if (t.method === 'challenge') return `${icon('trophy', 16)} Challenge prize`;
  if (t.method === 'vault_in') return `${icon('vault', 16)} Wallet → Vault`;
  if (t.method === 'vault_out') return `${icon('vault', 16)} Vault → Wallet`;
  return esc(t.method);
}

function txRow(t) {
  const d = t.details || {};
  const status = t.status === 'pending' && d.required ? `${d.confirmations}/${d.required} conf.` : t.method === 'bank' && t.status === 'pending' ? (d.stage === 'awaiting' ? 'awaiting transfer' : 'processing') : t.status;
  const fiat = t.fiat ? `<div class="dim" style="font-size:12px">${fmt.money(t.fiat.amount, t.fiat.currency)} charged</div>` : '';
  const out = t.type === 'withdrawal' || t.method === 'vault_in' || d.direction === 'out';
  const swapFrom = t.type === 'swap' ? `<div class="dim" style="font-size:12px">-${fmt.amount(d.fromAmount, d.from)} ${d.from}</div>` : '';
  return `<tr class="clickable" data-tx="${t.id}"><td>${fmt.dateTime(t.createdAt)}</td><td><span class="row" style="gap:6px">${methodLabel(t)}</span></td>
    <td class="r"><span class="amt">${out ? '-' : ''}${fmt.amount(t.amount, t.currency)} ${coin(t.currency)}</span>${fiat}${swapFrom}</td>
    <td class="r"><span class="pill ${STATUS[t.status] || ''}">${esc(status)}</span>${d.declineCode ? `<div class="dim" style="font-size:11px">${esc(d.declineCode)}</div>` : ''}</td>
    <td class="hide-mobile dim mono" style="font-size:12px">${esc((t.ref || '').slice(0, 12))}</td></tr>`;
}

export { navigate };
