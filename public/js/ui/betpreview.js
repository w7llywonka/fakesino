import { esc } from '../dom.js';
import { playingCard } from '../icons.js';
import * as fmt from '../format.js';
import { colorOf } from '../shared/games/roulette.js';
import { PAYTABLE } from '../shared/games/videopoker.js';

// Compact, game-specific rendering of a finished bet's result for the bet
// details modal and the fairness verifier.
const box = (inner, style = '') => `<div class="result-preview" style="${style}">${inner}</div>`;
const pill = (text, color = 'var(--surface-3)', fg = 'var(--text)') =>
  `<span style="display:inline-grid;place-items:center;min-width:34px;height:34px;padding:0 8px;border-radius:8px;background:${color};color:${fg};font-weight:800;font-size:13px">${esc(text)}</span>`;
const big = (text, color = 'var(--text)') => `<div style="font-size:30px;font-weight:900;color:${color};font-variant-numeric:tabular-nums">${esc(text)}</div>`;

export function renderResult(game, result, params = {}) {
  if (!result) return '';
  const winColor = (w) => (w ? 'var(--accent)' : 'var(--text)');
  switch (game) {
    case 'dice':
      return box(`<div style="text-align:center">${big(result.roll.toFixed(2), winColor(result.win))}<div class="muted">Roll ${params.condition} ${Number(params.target).toFixed(2)}</div></div>`);
    case 'limbo':
      return box(`<div style="text-align:center">${big(fmt.multiplier(result.result), winColor(result.win))}<div class="muted">Target ${fmt.multiplier(params.target)}</div></div>`);
    case 'crash':
      return box(`<div style="text-align:center">${big(fmt.multiplier(result.crashPoint), 'var(--red)')}<div class="muted">${result.cashedAt ? `Cashed out at ${fmt.multiplier(result.cashedAt)}` : 'Did not cash out'}</div></div>`);
    case 'coinflip':
      return box(`<div style="text-align:center">${big(result.side.toUpperCase(), winColor(result.win))}<div class="muted">Picked ${esc(params.side)}</div></div>`);
    case 'plinko':
      return box(
        `<div style="text-align:center"><div style="display:flex;gap:3px;justify-content:center;margin-bottom:8px">${result.path.map((p) => pill(p ? 'R' : 'L')).join('')}</div>
        <div class="muted">${esc(params.rows)} rows · ${esc(params.risk)} risk · bucket ${result.bucket} → <b style="color:var(--text)">${fmt.multiplier(result.multiplier, 1)}</b></div></div>`,
      );
    case 'wheel':
      return box(`<div style="text-align:center">${big(fmt.multiplier(result.multiplier), winColor(result.multiplier > 0))}<div class="muted">Segment ${result.segment + 1} of ${esc(params.segments)} · ${esc(params.risk)} risk</div></div>`);
    case 'keno': {
      const hits = new Set(result.hits);
      const drawn = new Set(result.drawn);
      const picks = new Set(params.picks || []);
      const cells = Array.from({ length: 40 }, (_, i) => {
        const n = i + 1;
        const bg = hits.has(n) ? 'var(--accent)' : drawn.has(n) ? 'var(--surface-4)' : picks.has(n) ? '#6b3fd4' : 'var(--surface-2)';
        const fg = hits.has(n) ? 'var(--accent-text)' : 'var(--text)';
        return `<span style="display:grid;place-items:center;height:28px;border-radius:6px;background:${bg};color:${fg};font-weight:700;font-size:12px">${n}</span>`;
      }).join('');
      return box(`<div style="display:grid;grid-template-columns:repeat(8,1fr);gap:4px;width:100%">${cells}</div>`);
    }
    case 'mines': {
      const mines = new Set(result.positions || []);
      const revealed = new Set(result.revealed || []);
      const cells = Array.from({ length: 25 }, (_, i) => {
        const mine = mines.has(i);
        const open = revealed.has(i);
        const bg = mine ? (i === result.hit ? 'var(--red)' : 'rgba(255,77,94,.35)') : open ? 'var(--accent)' : 'var(--surface-3)';
        return `<span style="display:grid;place-items:center;aspect-ratio:1;border-radius:6px;background:${bg};font-size:14px">${mine ? '✸' : open ? '◆' : ''}</span>`;
      }).join('');
      return box(`<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px;width:220px">${cells}</div>`);
    }
    case 'tower': {
      const rows = (result.safeTiles || []).map((safe, r) => {
        const cols = { easy: 4, medium: 3, hard: 2, expert: 3, master: 4 }[result.difficulty] || 3;
        return `<div style="display:flex;gap:4px">${Array.from({ length: cols }, (_, c) => {
          const picked = result.picks?.[r] === c;
          const ok = safe.includes(c);
          const bg = picked ? (ok ? 'var(--accent)' : 'var(--red)') : ok ? 'rgba(34,211,107,.25)' : 'var(--surface-3)';
          return `<span style="flex:1;height:18px;border-radius:4px;background:${bg}"></span>`;
        }).join('')}</div>`;
      });
      return box(`<div style="display:flex;flex-direction:column-reverse;gap:4px;width:200px">${rows.join('')}</div>`);
    }
    case 'hilo':
      return box(`<div style="display:flex;gap:6px;overflow-x:auto;max-width:100%;padding:4px">${(result.cards || []).map((c) => playingCard(c)).join('')}</div>`);
    case 'blackjack':
      return box(`<div style="display:grid;gap:10px;justify-items:center">
        <div><div class="muted" style="text-align:center;margin-bottom:4px">Dealer · ${result.dealer?.value?.total ?? ''}</div><div style="display:flex;gap:6px">${(result.dealer?.cards || []).map((c) => playingCard(c)).join('')}</div></div>
        ${(result.hands || []).map((h) => `<div><div class="muted" style="text-align:center;margin-bottom:4px">Player · ${h.value?.total ?? ''} · ${esc(h.result || '')}</div><div style="display:flex;gap:6px">${h.cards.map((c) => playingCard(c)).join('')}</div></div>`).join('')}</div>`);
    case 'baccarat':
      return box(`<div style="display:flex;gap:24px;flex-wrap:wrap;justify-content:center">
        <div><div class="muted" style="text-align:center;margin-bottom:4px">Player · ${result.playerTotal}</div><div style="display:flex;gap:6px">${result.player.map((c) => playingCard(c)).join('')}</div></div>
        <div><div class="muted" style="text-align:center;margin-bottom:4px">Banker · ${result.bankerTotal}</div><div style="display:flex;gap:6px">${result.banker.map((c) => playingCard(c)).join('')}</div></div></div>`);
    case 'videopoker': {
      const name = PAYTABLE.find((p) => p.key === result.result)?.name || 'No win';
      return box(`<div style="text-align:center"><div style="display:flex;gap:6px;justify-content:center;margin-bottom:8px">${(result.hand || []).map((c, i) => playingCard(c, result.held?.[i] ? 'win-glow' : '')).join('')}</div><b>${esc(name)}</b></div>`);
    }
    case 'roulette': {
      const c = colorOf(result.number);
      const bg = c === 'red' ? '#e0283c' : c === 'black' ? '#1b1b1b' : '#1e9e5a';
      return box(`<div style="text-align:center"><span style="display:inline-grid;place-items:center;width:64px;height:64px;border-radius:50%;background:${bg};font-size:26px;font-weight:900;border:3px solid rgba(255,255,255,.2)">${result.number}</span>
        <div class="muted" style="margin-top:8px">${result.winning.length ? `Winning bets: ${result.winning.map(esc).join(', ')}` : 'No winning bets'}</div></div>`);
    }
    case 'slots': {
      const s = result.spins?.[0];
      if (!s) return '';
      const glyph = { cherry: '🍒', lemon: '🍋', orange: '🍊', plum: '🟣', grape: '🍇', bell: '🔔', bar: '▬', seven: '7', wild: 'W', scatter: '★' };
      const grid = [0, 1, 2].map((r) => s.grid.map((col) => pill(glyph[col[r]] || col[r])).join('')).map((rowHtml) => `<div style="display:flex;gap:4px">${rowHtml}</div>`).join('');
      return box(`<div style="text-align:center"><div style="display:grid;gap:4px;justify-content:center">${grid}</div><div class="muted" style="margin-top:8px">${result.freeSpins ? `${result.freeSpins} free spins · ` : ''}${result.spins.length} spin${result.spins.length > 1 ? 's' : ''} total</div></div>`);
    }
    default:
      return box(`<pre style="margin:0;font-size:12px">${esc(JSON.stringify(result, null, 2))}</pre>`, 'justify-content:flex-start');
  }
}
