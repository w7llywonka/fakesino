import { el, esc, on, copyText } from '../dom.js';
import { icon, coin } from '../icons.js';
import { api } from '../api.js';
import { setQuery } from '../router.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import { renderResult, renderResultAsync } from './betpreview.js';
import { bySlug } from '../games/registry.js';
import { openFairnessModal } from './fairness.js';
import * as fmt from '../format.js';

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
  const g = bySlug[bet.game] || { name: bet.game };
  const win = bet.payout > bet.amount;
  const who = bet.username ? esc(bet.username) : `<span class="user-hidden">${icon('eyeOff', 14)} Hidden</span>`;
  const seed = bet.seed || {};
  const isCrash = bet.game === 'crash';
  const body = el(`<div>
    <div class="bet-summary"><div class="game-name">${icon(bet.game, 20)} ${esc(g.name)}</div>
      <div class="meta">ID ${bet.id} · Placed by ${who} on ${fmt.dateTime(bet.createdAt)}</div></div>
    <div class="bet-grid">
      <div><div class="k">Bet</div><div class="v">${esc(fmt.money(bet.amount, bet.currency))} ${coin(bet.currency)}</div></div>
      <div><div class="k">Multiplier</div><div class="v">${fmt.multiplier(bet.multiplier)}</div></div>
      <div><div class="k">Payout</div><div class="v ${win ? 'win-text' : ''}">${esc(fmt.money(bet.payout, bet.currency))} ${coin(bet.currency)}</div></div>
    </div>
    <div data-role="preview">${renderResult(bet.game, bet.result, bet.params) || ''}</div>
    <a class="btn btn-primary btn-block" href="/casino/games/${bet.game}" style="margin-bottom:14px">Play ${esc(g.name)}</a>
    <details class="panel" ${bet.mine ? '' : ''}><summary style="cursor:pointer;font-weight:700;display:flex;gap:8px;align-items:center">${icon('shield', 16)} Provable Fairness</summary>
      <div class="seed-box" style="margin-top:12px;background:var(--bg-deep)">
        ${
          isCrash
            ? `<div class="k">Round</div><div class="v">${esc(seed.roundId)}</div><div class="k">Game hash</div><div class="v">${esc(seed.hash)}</div><div class="k">Salt</div><div class="v">${esc(seed.salt)}</div>`
            : `<div class="k">Server Seed</div><div class="v">${seed.serverSeed ? esc(seed.serverSeed) : '<span class="dim">Hidden until the seed pair is rotated</span>'}</div>
        <div class="k">Server Seed (Hashed)</div><div class="v">${esc(seed.serverSeedHash)}</div>
        <div class="k">Client Seed</div><div class="v">${esc(seed.clientSeed)}</div>
        <div class="k">Nonce</div><div class="v">${esc(seed.nonce)}</div>`
        }
      </div>
      <div class="row" style="margin-top:12px;gap:8px">
        <button class="btn btn-secondary btn-sm" data-act="verify" ${!isCrash && !seed.serverSeed ? 'disabled' : ''}>${icon('check', 14)} Verify</button>
        <button class="btn btn-ghost btn-sm" data-act="copy">${icon('copy', 14)} Copy bet link</button>
      </div>
    </details>
  </div>`);
  modal.setBody(body);
  if (!renderResult(bet.game, bet.result, bet.params)) renderResultAsync(bet.game, bet.result, bet.params).then((html) => (body.querySelector('[data-role=preview]').innerHTML = html));
  on(body, 'click', '[data-act=copy]', async () => {
    await copyText(`${location.origin}/casino/games/${bet.game}?modal=bet&id=${bet.id}`);
    toast({ type: 'success', title: 'Link copied' });
  });
  on(body, 'click', '[data-act=verify]', () => {
    if (isCrash) openFairnessModal({ tab: 'crash', prefill: { hash: seed.hash, salt: seed.salt, formulaVersion: seed.formulaVersion || 1 } });
    else openFairnessModal({ tab: 'verify', prefill: { game: bet.game, serverSeed: seed.serverSeed, clientSeed: seed.clientSeed, nonce: seed.nonce, params: bet.params, actions: bet.actions, rulesVersion: bet.rulesVersion || 1 } });
  });
  return modal;
}
