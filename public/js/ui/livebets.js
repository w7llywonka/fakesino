import { el, esc, on } from '../dom.js';
import { icon, coin } from '../icons.js';
import { api } from '../api.js';
import { state, bus } from '../state.js';
import { bySlug } from '../games/registry.js';
import { setQuery } from '../router.js';
import * as fmt from '../format.js';

const HIGH_ROLLER_USD = 100;
const gameName = (slug) => bySlug[slug]?.name || slug[0].toUpperCase() + slug.slice(1);

export function createLiveBets(container, { game = null } = {}) {
  const tabs = [
    ['mine', 'My Bets'],
    ['all', 'All Bets'],
    ['high', 'High Rollers'],
    ['race', 'Race Leaderboard'],
  ];
  let tab = state.user ? 'mine' : 'all';
  let size = 10;
  const rows = { mine: [], all: [], high: [] };
  const root = el(`<section class="live-bets" style="margin-top:28px">
    <div class="row between" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">
      <div class="tabs">${tabs.map(([k, l]) => `<button class="tab" data-tab="${k}">${l}</button>`).join('')}</div>
      <select class="select" style="width:auto;height:38px" data-act="size"><option>10</option><option>20</option><option>50</option></select>
    </div>
    <div class="table-wrap"><table class="table"><thead></thead><tbody></tbody></table></div>
  </section>`);
  container.appendChild(root);
  const thead = root.querySelector('thead');
  const tbody = root.querySelector('tbody');

  function row(b, isNew) {
    const win = b.payout > b.amount;
    const user = b.hidden || !b.username ? `<span class="user-hidden">${icon('eyeOff', 14)} Hidden</span>` : esc(b.username);
    const payout = b.payout - b.amount;
    return `<tr class="clickable ${isNew ? 'new' : ''}" data-id="${b.id}">
      <td><span class="cell-game">${icon(b.game, 16)} ${esc(gameName(b.game))}</span></td>
      <td class="hide-mobile">${user}</td>
      <td class="hide-mobile">${fmt.time(b.createdAt)}</td>
      <td class="r hide-mobile"><span class="amt">${esc(fmt.money(b.amount, b.currency))} ${coin(b.currency)}</span></td>
      <td class="r">${fmt.multiplier(b.multiplier)}</td>
      <td class="r"><span class="amt ${win ? 'win-text' : payout < 0 ? 'loss-text' : ''}">${payout >= 0 ? '' : '-'}${esc(fmt.money(Math.abs(payout), b.currency))} ${coin(b.currency)}</span></td>
    </tr>`;
  }

  function render(newId = null) {
    root.querySelectorAll('[data-tab]').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tab);
      if (b.dataset.tab === 'mine') b.style.display = state.user ? '' : 'none';
    });
    if (tab === 'race') return renderRace();
    thead.innerHTML = `<tr><th>Game</th><th class="hide-mobile">User</th><th class="hide-mobile">Time</th><th class="r hide-mobile">Bet Amount</th><th class="r">Multiplier</th><th class="r">Payout</th></tr>`;
    const list = rows[tab].slice(0, size);
    tbody.innerHTML = list.length ? list.map((b) => row(b, b.id === newId)).join('') : `<tr><td colspan="6"><div class="empty">${tab === 'mine' ? 'No bets yet — place one to see it here.' : 'Waiting for bets…'}</div></td></tr>`;
  }

  async function renderRace() {
    thead.innerHTML = '<tr><th>Rank</th><th>User</th><th class="r hide-mobile">Bets</th><th class="r">Wagered</th><th class="r">Prize</th></tr>';
    tbody.innerHTML = '<tr><td colspan="5"><div class="spinner"></div></td></tr>';
    try {
      const race = await api.get('/api/race');
      tbody.innerHTML = raceRows(race, size);
    } catch {
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty">Race unavailable</div></td></tr>';
    }
  }

  const q = (extra = '') => `/api/bets/recent?limit=50${game ? `&game=${game}` : ''}${extra}`;
  async function load() {
    const [all, high, mine] = await Promise.all([
      api.get(q()).catch(() => ({ bets: [] })),
      api.get(q(`&minUsd=${HIGH_ROLLER_USD}`)).catch(() => ({ bets: [] })),
      state.user ? api.get(`/api/bets/mine?limit=50${game ? `&game=${game}` : ''}`).catch(() => ({ bets: [] })) : { bets: [] },
    ]);
    rows.all = all.bets.filter((b) => !b.mine);
    rows.high = high.bets;
    rows.mine = mine.bets;
    render();
  }

  function add(list, bet) {
    if (list.some((b) => b.id === bet.id)) return;
    list.unshift(bet);
    if (list.length > 60) list.pop();
  }

  const offs = [
    bus.on('live:bet', (bet) => {
      if (game && bet.game !== game) return;
      // Our own bets arrive via bet:mine once the animation has finished.
      if (bet.mine) return;
      add(rows.all, bet);
      if (bet.amountUsd >= HIGH_ROLLER_USD) add(rows.high, bet);
      if (tab === 'all' || (tab === 'high' && bet.amountUsd >= HIGH_ROLLER_USD)) render(bet.id);
    }),
    bus.on('bet:mine', (bet) => {
      if (game && bet.game !== game) return;
      const pub = { ...bet, hidden: state.user?.settings?.privateMode, username: state.user?.username };
      add(rows.mine, pub);
      add(rows.all, pub);
      if (bet.amountUsd >= HIGH_ROLLER_USD) add(rows.high, pub);
      if (tab !== 'race') render(bet.id);
    }),
    bus.on('user', () => {
      if (!state.user && tab === 'mine') tab = 'all';
      load();
    }),
  ];

  on(root, 'click', '[data-tab]', (e, b) => {
    tab = b.dataset.tab;
    render();
  });
  root.querySelector('[data-act=size]').addEventListener('change', (e) => {
    size = Number(e.target.value);
    render();
  });
  on(root, 'click', 'tr[data-id]', (e, tr) => setQuery({ modal: 'bet', id: tr.dataset.id }));

  load();
  return {
    destroy() {
      offs.forEach((f) => f());
      root.remove();
    },
  };
}

// Daily race rows (top N, then your own position), shared with the leaderboard page.
export function raceRows(race, size = 10) {
  const medal = (i) => (i < 3 ? icon('trophy', 16, `style="color:${['#f5b83d', '#b8c4d1', '#c47a3a'][i]}"`) : '');
  const name = (u) => (u ? esc(u) : `<span class="user-hidden">${icon('eyeOff', 14)} Hidden</span>`);
  const rows = race.leaders.slice(0, size).map(
    (l, i) => `<tr><td>${medal(i)} ${l.rank}</td><td>${name(l.username)}</td><td class="r hide-mobile">${l.bets.toLocaleString()}</td>
      <td class="r">${fmt.fiat(l.wageredUsd)}</td><td class="r win-text">${l.prizeUsd ? fmt.fiat(l.prizeUsd) : '—'}</td></tr>`,
  );
  const me = race.me;
  if (me && (!me.rank || me.rank > size))
    rows.push(`<tr class="race-me"><td>${me.rank ?? '—'}</td><td>You</td><td class="hide-mobile"></td><td class="r">${fmt.fiat(me.wageredUsd)}</td><td class="r">${me.prizeUsd ? fmt.fiat(me.prizeUsd) : '—'}</td></tr>`);
  return rows.length ? rows.join('') : '<tr><td colspan="5"><div class="empty">No wagers in today’s race yet — be the first.</div></td></tr>';
}
