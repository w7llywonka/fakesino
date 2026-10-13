import { esc } from '../dom.js';
import { icon, gameArt, coin } from '../icons.js';
import { bySlug } from '../games/registry.js';
import * as fmt from '../format.js';

export function countdown(ms) {
  if (ms <= 0) return 'Ended';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export function challengeCard(c) {
  const g = bySlug[c.game] || { name: c.game };
  const winner = c.winner ? (c.winner.name ? esc(c.winner.name) : `<span class="user-hidden">${icon('eyeOff', 13)} Hidden</span>`) : null;
  return `<div class="ch-card ${c.status}">
    <a class="ch-art" href="/casino/games/${c.game}">${gameArt(c.game, g.name)}</a>
    <div class="ch-body">
      <div class="ch-game">${esc(g.name)}</div>
      <div class="ch-goal">First to hit <b>${fmt.multiplier(c.minMultiplier)}</b> with a minimum <b>${fmt.fiat(c.minBetUsd)}</b> bet</div>
      <div class="ch-prize">${icon('gift', 15)} Prize <b>${fmt.fiat(c.prizeUsd)}</b> ${coin('USD', 14)}</div>
      ${
        c.status === 'active'
          ? `<div class="ch-foot"><span class="ch-time" data-ends="${c.endsAt}">${icon('clock', 14)} ${countdown(c.endsAt - Date.now())}</span><a class="btn btn-primary btn-sm" href="/casino/games/${c.game}">Play</a></div>`
          : c.winner
            ? `<div class="ch-foot"><span class="ch-winner">${icon('trophy', 14)} ${winner}${c.winner.me ? ' (you)' : ''}</span><a class="btn btn-secondary btn-sm" href="?modal=bet&id=${c.betId}">View bet</a></div>`
            : `<div class="ch-foot"><span class="dim">${icon('clock', 14)} Expired without a winner</span></div>`
      }
    </div></div>`;
}

// Keep countdowns ticking inside `root`.
export function tickCountdowns(root) {
  const t = setInterval(() => root.querySelectorAll('[data-ends]').forEach((e) => (e.innerHTML = `${icon('clock', 14)} ${countdown(Number(e.dataset.ends) - Date.now())}`)), 1000);
  return () => clearInterval(t);
}
