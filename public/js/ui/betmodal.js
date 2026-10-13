import { el, esc, on, copyText } from '../dom.js';
import { icon, coin } from '../icons.js';
import { api } from '../api.js';
import { state, setUser } from '../state.js';
import { setQuery } from '../router.js';
import { openModal } from './modal.js';
import { toast, toastError } from './toast.js';
import { renderResult, renderResultAsync } from './betpreview.js';
import { bySlug } from '../games/registry.js';
import { openFairnessModal } from './fairness.js';
import * as fmt from '../format.js';

const betLink = (bet) => `${location.origin}/casino/games/${bet.game}?modal=bet&id=${bet.id}`;

export async function openBetModal(id) {
  const modal = openModal({ title: 'Bet', iconName: 'list', onClose: () => setQuery({ modal: null, id: null }, { replace: true }) });
  modal.setBody('<div class="spinner"></div>');
  let bet;
  try {
    ({ bet } = await api.get(`/api/bets/${encodeURIComponent(id)}`));
  } catch (err) {
    modal.setBody(`<div class="empty">${esc(err.message)}</div>`);
    return modal;
  }
  render(modal, bet);
  return modal;
}

function render(modal, bet) {
  const g = bySlug[bet.game] || { name: bet.game };
  const win = bet.payout > bet.amount;
  const who = bet.username ? esc(bet.username) : `<span class="user-hidden">${icon('eyeOff', 14)} Hidden</span>`;
  const seed = bet.seed || {};
  // Shared-round games (Crash, Slide, Zoo) are verified from the round's hash chain.
  const isRound = g.kind === 'multiplayer';
  const revealed = isRound || !!seed.serverSeed;
  let fairNote = '';
  if (!revealed)
    fairNote = bet.mine
      ? `<div class="bm-note">${icon('info', 16)}<div>To verify this bet, you first need to rotate your seed pair.<div><button class="btn btn-secondary btn-sm" data-act="rotate">${icon('refresh', 14)} Rotate Seed Pair</button></div></div></div>`
      : `<div class="bm-note">${icon('info', 16)}<div>The bettor must first rotate their seed pair to verify this bet.</div></div>`;
  const body = el(`<div>
    <div class="bet-summary"><div class="game-name">${icon(bet.game, 20)} ${esc(g.name)}</div>
      <div class="bm-id"><span>Bet ID ${bet.id}</span><button class="icon-btn" data-act="copy-id" data-tip="Copy ID">${icon('copy', 14)}</button>
        <span class="bm-share"><button class="icon-btn" data-act="share" data-tip="Share">${icon('swap', 14)}</button></span></div>
      <div class="meta">Placed by ${who} on ${fmt.dateTime(bet.createdAt)}</div></div>
    <div class="bet-grid">
      <div><div class="k">Bet</div><div class="v">${esc(fmt.money(bet.amount, bet.currency))} ${coin(bet.currency)}</div></div>
      <div><div class="k">Multiplier</div><div class="v">${fmt.multiplier(bet.multiplier)}</div></div>
      <div><div class="k">Payout</div><div class="v ${win ? 'win-text' : ''}">${esc(fmt.money(bet.payout, bet.currency))} ${coin(bet.currency)}</div></div>
    </div>
    <div data-role="preview">${renderResult(bet.game, bet.result, bet.params) || ''}</div>
    <a class="btn btn-primary btn-block" href="/casino/games/${bet.game}" style="margin-bottom:14px">Play ${esc(g.name)}</a>
    <details class="panel" ${bet.mine ? 'open' : ''}><summary style="cursor:pointer;font-weight:700;display:flex;gap:8px;align-items:center">${icon('shield', 16)} Provable Fairness</summary>
      ${fairNote}
      <div class="seed-box" style="margin-top:12px;background:var(--bg-deep)">
        ${
          isRound
            ? `<div class="k">Round</div><div class="v">${esc(seed.roundId)}</div><div class="k">Game hash</div><div class="v">${esc(seed.hash)}</div><div class="k">Salt</div><div class="v">${esc(seed.salt)}</div>`
            : `<div class="k">Server Seed</div><div class="v">${seed.serverSeed ? esc(seed.serverSeed) : '<span class="dim">Hidden until the seed pair is rotated</span>'}</div>
        <div class="k">Server Seed (Hashed)</div><div class="v">${esc(seed.serverSeedHash)}</div>
        <div class="k">Client Seed</div><div class="v">${esc(seed.clientSeed)}</div>
        <div class="k">Nonce</div><div class="v">${esc(seed.nonce)}</div>`
        }
      </div>
      <div class="row" style="margin-top:12px;gap:8px">
        <button class="btn btn-secondary btn-sm" data-act="verify" ${revealed ? '' : 'disabled'}>${icon('check', 14)} Verify</button>
        <button class="btn btn-ghost btn-sm" data-act="copy">${icon('copy', 14)} Copy bet link</button>
      </div>
    </details>
  </div>`);
  modal.setBody(body);
  if (!renderResult(bet.game, bet.result, bet.params)) renderResultAsync(bet.game, bet.result, bet.params).then((html) => (body.querySelector('[data-role=preview]').innerHTML = html));

  const copyLink = async () => {
    await copyText(betLink(bet));
    toast({ type: 'success', title: 'Link copied' });
  };
  on(body, 'click', '[data-act=copy]', copyLink);
  on(body, 'click', '[data-act=copy-id]', async () => {
    await copyText(String(bet.id));
    toast({ type: 'success', title: 'Copied', message: `Bet ID ${bet.id}` });
  });
  on(body, 'click', '[data-act=share]', (e, b) => {
    const host = b.parentElement;
    const open = host.querySelector('.dropdown');
    if (open) return open.remove();
    const menu = el(`<div class="dropdown bm-menu">
      <button class="dropdown-item" data-share="link">${icon('copy', 16)} Copy link</button>
      ${state.user ? `<button class="dropdown-item" data-share="chat">${icon('chat', 16)} Share in chat</button>` : ''}</div>`);
    host.appendChild(menu);
    on(menu, 'click', '[data-share]', async (ev, item) => {
      menu.remove();
      if (item.dataset.share === 'link') return copyLink();
      try {
        await api.post('/api/chat', { text: `${g.name} · ${fmt.multiplier(bet.multiplier)} · bet #${bet.id}`, betId: bet.id });
        toast({ type: 'success', title: 'Shared in chat' });
      } catch (err) {
        toastError(err);
      }
    });
  });
  on(body, 'click', '[data-act=rotate]', async (e, b) => {
    b.disabled = true;
    try {
      const { user } = await api.post('/api/fair/rotate', {});
      setUser(user);
      const { bet: fresh } = await api.get(`/api/bets/${bet.id}`);
      toast({ type: 'success', title: 'Seed pair rotated', message: 'The server seed for this bet is now revealed.' });
      render(modal, fresh);
    } catch (err) {
      b.disabled = false;
      toastError(err);
    }
  });
  on(body, 'click', '[data-act=verify]', () => {
    if (isRound) openFairnessModal({ tab: 'crash', prefill: { game: bet.game, hash: seed.hash, salt: seed.salt, formulaVersion: seed.formulaVersion || 1 } });
    else openFairnessModal({ tab: 'verify', prefill: { game: bet.game, serverSeed: seed.serverSeed, clientSeed: seed.clientSeed, nonce: seed.nonce, params: bet.params, actions: bet.actions, rulesVersion: bet.rulesVersion || 1 } });
  });
}
