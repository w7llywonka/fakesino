import { el, esc, on, copyText } from '../dom.js';
import { icon, playingCard } from '../icons.js';
import { api } from '../api.js';
import { state, setUser } from '../state.js';
import { setQuery } from '../router.js';
import { openModal } from './modal.js';
import { toast, toastError, toastSuccess } from './toast.js';
import { verifyBet, sha256Hex, floats, crashChain, VERIFIABLE } from '../verify.js';
import { renderResult } from './betpreview.js';
import { bySlug } from '../games/registry.js';
import { createArrayRng } from '../shared/fair.js';
import { cardFromFloat } from '../shared/games/util.js';
import * as fmt from '../format.js';

const randomSeed = () => {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return [...a].map((b) => 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 57]).join('');
};

function copyField(label, value, extra = '') {
  return `<div class="field"><div class="field-label"><span>${label}</span>${extra}</div>
    <div class="input-group"><input class="input mono" readonly value="${esc(value)}" style="font-size:12.5px"><button type="button" class="addon" data-copy="${esc(value)}">${icon('copy', 14)}</button></div></div>`;
}

export function openFairnessModal({ tab = 'seeds', prefill = null } = {}) {
  const modal = openModal({ title: 'Fairness', iconName: 'shield', onClose: () => setQuery({ modal: null, tab: null, game: null, id: null }, { replace: true }) });
  const root = el(`<div><div class="tabs block" style="margin-bottom:16px"><button class="tab" data-t="seeds">Seeds</button><button class="tab" data-t="verify">Verify</button><button class="tab" data-t="crash">Crash</button></div><div class="fx"></div></div>`);
  modal.setBody(root);
  modal.setFoot(`<a href="/provably-fair" class="link">What is provably fair?</a>`);
  const body = root.querySelector('.fx');
  on(root, 'click', '[data-copy]', async (e, b) => {
    await copyText(b.dataset.copy);
    toast({ type: 'success', title: 'Copied' });
  });
  const show = (t) => {
    root.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('active', b.dataset.t === t));
    body.innerHTML = '';
    if (t === 'seeds') seedsTab(body, show);
    else if (t === 'verify') verifyTab(body, prefill);
    else crashTab(body);
  };
  on(root, 'click', '[data-t]', (e, b) => show(b.dataset.t));
  show(tab === 'verify' || tab === 'crash' ? tab : state.user ? 'seeds' : 'verify');
  return modal;
}

async function seedsTab(body, show) {
  if (!state.user) {
    body.innerHTML = `<div class="empty">${icon('lock', 28)}<div>Sign in to manage your seeds.</div></div>`;
    return;
  }
  body.innerHTML = '<div class="spinner"></div>';
  let data;
  try {
    data = await api.get('/api/fair/seeds');
  } catch (err) {
    body.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    return;
  }
  const a = data.active;
  body.innerHTML = `
    ${copyField('Active Client Seed', a.clientSeed)}
    ${copyField('Active Server Seed (Hashed)', a.serverSeedHash)}
    <div class="field"><div class="field-label">Total bets made with pair</div><input class="input" readonly value="${a.nonce}"></div>
    <div class="divider"></div>
    <div style="font-weight:800;margin-bottom:10px">Rotate Seed Pair</div>
    ${data.locked.length ? `<div class="demo-notice warn">${icon('alert', 16)}<div>Finish your active ${data.locked.map((s) => esc(bySlug[s]?.name || s)).join(', ')} game before rotating seeds.</div></div>` : ''}
    <form class="field" data-field="clientSeed"><div class="field-label">New Client Seed<span class="req">*</span></div>
      <div class="input-group"><input class="input mono" name="clientSeed" value="${randomSeed()}" maxlength="64"><button class="addon" type="submit" style="background:var(--accent);color:var(--accent-text);padding:0 16px" ${data.locked.length ? 'disabled' : ''}>Change</button></div>
      <div class="field-error"></div></form>
    ${copyField('Next Server Seed (Hashed)', a.nextServerSeedHash)}
    ${
      data.history.length
        ? `<div class="divider"></div><div style="font-weight:800;margin-bottom:10px">Previous seeds</div>
      <div class="stack">${data.history
        .map(
          (h) => `<div class="seed-box"><div class="k">Server Seed</div><div class="v">${esc(h.serverSeed)}</div><div class="k">Hashed</div><div class="v">${esc(h.serverSeedHash)}</div>
          <div class="k">Client Seed · Bets</div><div class="v">${esc(h.clientSeed)} · ${h.nonce}</div></div>`,
        )
        .join('')}</div>`
        : ''
    }`;
  body.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { user, revealed } = await api.post('/api/fair/rotate', { clientSeed: e.target.clientSeed.value.trim() });
      setUser(user);
      toastSuccess('Seed pair rotated', `Previous server seed revealed: ${revealed.serverSeed.slice(0, 16)}…`);
      show('seeds');
    } catch (err) {
      const f = body.querySelector('[data-field=clientSeed]');
      f.classList.add('invalid');
      f.querySelector('.field-error').textContent = err.message;
    }
  });
}

const PARAM_FIELDS = {
  dice: [
    ['target', 'Target', 'number', 50.5],
    ['condition', 'Condition', ['over', 'under']],
  ],
  limbo: [['target', 'Target multiplier', 'number', 2]],
  plinko: [
    ['rows', 'Rows', [16, 15, 14, 13, 12, 11, 10, 9, 8]],
    ['risk', 'Risk', ['low', 'medium', 'high']],
  ],
  keno: [
    ['risk', 'Risk', ['classic', 'low', 'medium', 'high']],
    ['picks', 'Picked numbers (comma separated)', 'text', '1,2,3,4,5'],
  ],
  wheel: [
    ['segments', 'Segments', [10, 20, 30, 40, 50]],
    ['risk', 'Risk', ['low', 'medium', 'high']],
  ],
  coinflip: [['side', 'Side', ['heads', 'tails']]],
  mines: [['mines', 'Mines', 'number', 3]],
  tower: [['difficulty', 'Difficulty', ['easy', 'medium', 'hard', 'expert', 'master']]],
};

function verifyTab(body, prefill) {
  const p = prefill || {};
  const games = VERIFIABLE.map((g) => `<option value="${g}" ${p.game === g ? 'selected' : ''}>${esc(bySlug[g]?.name || g)}</option>`).join('');
  body.innerHTML = `<form class="vf">
    <div class="field"><div class="field-label">Game</div><select class="select" name="game">${games}</select></div>
    <div class="field"><div class="field-label">Server Seed</div><input class="input mono" name="serverSeed" value="${esc(p.serverSeed || '')}" placeholder="Revealed after you rotate your seed pair"></div>
    <div class="field-label" style="margin:-6px 0 12px"><span class="dim mono" style="font-size:11.5px;word-break:break-all" data-hash></span></div>
    <div class="two-col" style="gap:12px"><div class="field"><div class="field-label">Client Seed</div><input class="input mono" name="clientSeed" value="${esc(p.clientSeed || '')}"></div>
    <div class="field"><div class="field-label">Nonce</div><input class="input" name="nonce" inputmode="numeric" value="${esc(p.nonce ?? 0)}"></div></div>
    <div class="params"></div>
  </form><div class="vf-out"></div>`;
  const form = body.querySelector('form');
  const out = body.querySelector('.vf-out');
  const paramsEl = body.querySelector('.params');
  const renderParams = () => {
    const fields = PARAM_FIELDS[form.game.value] || [];
    const pv = p.game === form.game.value ? p.params || {} : {};
    paramsEl.innerHTML = fields
      .map(([k, label, type, def]) => {
        const v = pv[k] ?? def;
        if (Array.isArray(type)) return `<div class="field"><div class="field-label">${label}</div><select class="select" name="p_${k}">${type.map((o) => `<option ${String(o) === String(pv[k] ?? type[0]) ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`;
        return `<div class="field"><div class="field-label">${label}</div><input class="input" name="p_${k}" value="${esc(Array.isArray(v) ? v.join(',') : v)}"></div>`;
      })
      .join('');
  };
  renderParams();
  let timer;
  const run = async () => {
    const fd = Object.fromEntries(new FormData(form));
    const hashEl = body.querySelector('[data-hash]');
    if (!fd.serverSeed || !fd.clientSeed) {
      out.innerHTML = `<div class="empty">Enter a server seed and client seed to verify.</div>`;
      hashEl.textContent = '';
      return;
    }
    hashEl.textContent = `SHA-256: ${await sha256Hex(fd.serverSeed)}`;
    const params = {};
    for (const [k, v] of Object.entries(fd)) if (k.startsWith('p_')) params[k.slice(2)] = v;
    if (params.picks) params.picks = params.picks.split(/[\s,]+/).filter(Boolean).map(Number);
    if (p.game === fd.game && p.params) Object.assign(params, { chips: p.params.chips });
    try {
      out.innerHTML = await renderVerification(fd.game, fd.serverSeed, fd.clientSeed, Number(fd.nonce), params, p.game === fd.game ? p.actions : null);
    } catch (err) {
      out.innerHTML = `<div class="demo-notice warn">${icon('alert', 16)}<div>${esc(err.message)}</div></div>`;
    }
  };
  form.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(run, 150);
  });
  form.game.addEventListener('change', () => {
    renderParams();
    run();
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  run();
}

async function renderVerification(game, serverSeed, clientSeed, nonce, params, actions) {
  const cardsRow = (cards) => `<div style="display:flex;gap:6px;overflow-x:auto;padding:4px">${cards.map((c) => playingCard(c)).join('')}</div>`;
  if (['hilo', 'blackjack', 'videopoker'].includes(game) && !actions) {
    const fl = await floats(serverSeed, clientSeed, nonce, game === 'videopoker' ? 10 : 12);
    let cards;
    if (game === 'videopoker') {
      const { start } = await import('../shared/games/videopoker.js');
      const s = start(createArrayRng(fl));
      cards = [...s.hand, ...s.reserve];
    } else cards = fl.map((f) => cardFromFloat(f));
    return `<div class="field-label" style="margin-bottom:6px">Card sequence</div><div class="result-preview">${cardsRow(cards)}</div>`;
  }
  if (game === 'mines' && !actions) {
    const { minePositions } = await import('../shared/games/mines.js');
    const fl = await floats(serverSeed, clientSeed, nonce, 24);
    const positions = minePositions(createArrayRng(fl), Math.max(1, Math.min(24, Number(params.mines) || 3)));
    return `<div class="field-label" style="margin-bottom:6px">Mine positions</div>${renderResult('mines', { positions, revealed: [] })}`;
  }
  if (game === 'tower' && !actions) {
    const { layout, DIFFICULTIES } = await import('../shared/games/tower.js');
    const d = params.difficulty || 'easy';
    const fl = await floats(serverSeed, clientSeed, nonce, 9 * DIFFICULTIES[d].cols);
    return `<div class="field-label" style="margin-bottom:6px">Egg positions</div>${renderResult('tower', { difficulty: d, safeTiles: layout(createArrayRng(fl), d), picks: [] })}`;
  }
  const { result, params: norm } = await verifyBet({ game, serverSeed, clientSeed, nonce, params, actions: actions || [] });
  return `<div class="field-label" style="margin-bottom:6px">Result</div>${renderResult(game, result, norm)}
    ${result.multiplier != null ? `<div class="muted" style="text-align:center">Multiplier ${fmt.multiplier(result.multiplier ?? 0)}</div>` : ''}`;
}

async function crashTab(body) {
  body.innerHTML = '<div class="spinner"></div>';
  let info;
  try {
    info = await api.get('/api/fair/crash');
  } catch (err) {
    body.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    return;
  }
  const last = info.history[0];
  body.innerHTML = `
    <div class="muted" style="font-size:13px;margin-bottom:12px">Crash rounds come from a chain of ${info.chainLength.toLocaleString()} SHA-256 hashes generated before the first round and played in reverse. Each round's crash point is HMAC-SHA256(game hash, salt). Hashing any round's hash gives the previous round's hash, ending at the published terminating hash.</div>
    ${copyField('Terminating hash (commitment)', info.terminatingHash)}
    ${copyField('Salt', info.salt)}
    <form><div class="field"><div class="field-label">Game hash</div><input class="input mono" name="hash" value="${esc(last?.hash || '')}" placeholder="Paste a round hash"></div></form>
    <div class="cx"></div>`;
  const out = body.querySelector('.cx');
  const run = async () => {
    const hash = body.querySelector('[name=hash]').value.trim();
    if (!/^[0-9a-f]{64}$/.test(hash)) {
      out.innerHTML = '<div class="empty">Enter a 64-character round hash.</div>';
      return;
    }
    const chain = await crashChain(hash, info.salt, 10);
    out.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>Hash</th><th class="r">Crash point</th></tr></thead><tbody>${chain
      .map((c, i) => `<tr><td class="mono" style="font-size:12px">${i === 0 ? '<b>this</b> ' : ''}${c.hash.slice(0, 20)}…</td><td class="r" style="color:${c.crashPoint >= 2 ? 'var(--accent)' : 'var(--text)'}">${fmt.multiplier(c.crashPoint)}</td></tr>`)
      .join('')}</tbody></table></div>`;
  };
  body.querySelector('form').addEventListener('input', run);
  body.querySelector('form').addEventListener('submit', (e) => e.preventDefault());
  run().catch(toastError);
}
