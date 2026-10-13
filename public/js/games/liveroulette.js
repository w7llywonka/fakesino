import mountRoulette from './roulette.js';
import { colorOf } from '../shared/games/roulette.js';
import { winningKeys } from '../shared/games/liveroulette.js';

// Live Roulette reuses the roulette table and wheel in shared-round mode.
export default function mountLiveRoulette(ctx) {
  return mountRoulette(ctx, { live: 'liveroulette' });
}

export function renderPreview(result, params) {
  const c = colorOf(result.number);
  const bg = c === 'red' ? '#e0283c' : c === 'black' ? '#1b1b1b' : '#1e9e5a';
  const wins = params.chips ? winningKeys(params.chips, result.number) : [];
  return `<div style="text-align:center"><span style="display:inline-grid;place-items:center;width:64px;height:64px;border-radius:50%;background:${bg};font-size:26px;font-weight:900;border:3px solid rgba(255,255,255,.2)">${result.number}</span>
    <div class="muted" style="margin-top:8px">${wins.length ? `Winning bets: ${wins.join(', ')}` : 'No winning bets'}</div></div>`;
}
