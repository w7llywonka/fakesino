import { esc } from '../dom.js';
import { icon, coin } from '../icons.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { setQuery } from '../router.js';
import { bySlug } from '../games/registry.js';
import { openModal } from './modal.js';
import * as fmt from '../format.js';

export async function openStatsModal() {
  const modal = openModal({ title: 'Statistics', iconName: 'stats', onClose: () => setQuery({ modal: null }, { replace: true }) });
  if (!state.user) {
    modal.setBody(`<div class="empty">Your wallet is still loading.</div>`);
    return modal;
  }
  modal.setBody('<div class="spinner"></div>');
  try {
    const { stats, vip } = await api.get('/api/stats');
    const games = Object.entries(stats.byGame).sort((a, b) => b[1].wageredUsd - a[1].wageredUsd);
    const currencies = Object.entries(stats.byCurrency);
    modal.setBody(`
      <div class="bet-summary"><div class="game-name">${icon('user', 20)} ${esc(state.user.username)}</div><div class="meta">Joined ${fmt.dateTime(state.user.createdAt)} · <span style="color:${vip.color}">${esc(vip.level)}</span></div></div>
      <div class="bet-grid" style="grid-template-columns:repeat(2,1fr)">
        <div><div class="k">Total bets</div><div class="v">${stats.bets.toLocaleString()}</div></div>
        <div><div class="k">Wagered</div><div class="v">${fmt.fiat(stats.wageredUsd)}</div></div>
        <div><div class="k">Wins</div><div class="v win-text">${stats.wins.toLocaleString()}</div></div>
        <div><div class="k">Losses</div><div class="v loss-text">${stats.losses.toLocaleString()}</div></div>
        <div style="grid-column:span 2"><div class="k">Net profit</div><div class="v ${stats.profitUsd >= 0 ? 'win-text' : 'loss-text'}">${stats.profitUsd < 0 ? '-' : ''}${fmt.fiat(Math.abs(stats.profitUsd))}</div></div>
      </div>
      ${
        currencies.length
          ? `<div class="field-label" style="margin-bottom:6px">By currency</div><div class="table-wrap"><table class="table"><thead><tr><th>Currency</th><th class="r">Bets</th><th class="r">Wagered</th><th class="r">Profit</th></tr></thead><tbody>${currencies
              .map(([c, s]) => `<tr><td><span class="row">${coin(c)} ${c}</span></td><td class="r">${s.bets}</td><td class="r">${fmt.amount(s.wagered, c)}</td><td class="r ${s.profit >= 0 ? 'win-text' : 'loss-text'}">${fmt.amount(s.profit, c)}</td></tr>`)
              .join('')}</tbody></table></div>`
          : ''
      }
      ${
        games.length
          ? `<div class="field-label" style="margin:14px 0 6px">By game</div><div class="table-wrap"><table class="table"><thead><tr><th>Game</th><th class="r">Bets</th><th class="r">Wagered</th><th class="r">Profit</th></tr></thead><tbody>${games
              .map(([g, s]) => `<tr><td><span class="cell-game">${icon(g, 16)} ${esc(bySlug[g]?.name || (g === 'sports' ? 'Sports' : g))}</span></td><td class="r">${s.bets}</td><td class="r">${fmt.fiat(s.wageredUsd)}</td><td class="r ${s.profitUsd >= 0 ? 'win-text' : 'loss-text'}">${s.profitUsd < 0 ? '-' : ''}${fmt.fiat(Math.abs(s.profitUsd))}</td></tr>`)
              .join('')}</tbody></table></div>`
          : '<div class="empty">No bets yet.</div>'
      }`);
  } catch (err) {
    modal.setBody(`<div class="empty">${esc(err.message)}</div>`);
  }
  return modal;
}
