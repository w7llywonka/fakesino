import { el, esc, on, copyText } from '../dom.js';
import { icon, playingCard } from '../icons.js';
import { api } from '../api.js';
import { state, setUser } from '../state.js';
import { setQuery } from '../router.js';
import { openModal } from './modal.js';
import { toast, toastError, toastSuccess } from './toast.js';
import { verifyBet, sha256Hex, floats, roundChain, loadRules, latestRulesVersion } from '../verify.js';
import { NAMES as ZOO_NAMES } from '../shared/games/zoo.js';
import { renderResult, renderResultAsync } from './betpreview.js';
import { bySlug, GAMES } from '../games/registry.js';
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
  const root = el(`<div><div class="tabs block" style="margin-bottom:16px"><button class="tab" data-t="seeds">Seeds</button><button class="tab" data-t="verify">Verify</button><button class="tab" data-t="crash">Live Games</button></div><div class="fx"></div></div>`);
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
    else crashTab(body, prefill);
  };
  on(root, 'click', '[data-t]', (e, b) => show(b.dataset.t));
  show(tab === 'verify' || tab === 'crash' ? tab : state.user ? 'seeds' : 'verify');
  return modal;
}

async function seedsTab(body, show) {
  if (!state.user) {
    body.innerHTML = `<div class="empty">${icon('lock', 28)}<div>Your wallet is still loading.</div></div>`;
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

// Also mounted on the Provably Fair page's Calculation tab.
export function verifyTab(body, prefill) {
  const p = prefill || {};
  const verifiable = GAMES.filter((g) => g.kind !== 'multiplayer');
  const games = verifiable.map((g) => `<option value="${g.slug}" ${p.game === g.slug ? 'selected' : ''}>${esc(g.name)}</option>`).join('');
  body.innerHTML = `<form class="vf">
    <div class="field"><div class="field-label">Game</div><select class="select" name="game">${games}</select></div>
    <div class="field"><div class="field-label">Server Seed</div><input class="input mono" name="serverSeed" value="${esc(p.serverSeed || '')}" placeholder="Revealed after you rotate your seed pair"></div>
    <div class="field-label" style="margin:-6px 0 12px"><span class="dim mono" style="font-size:11.5px;word-break:break-all" data-hash></span></div>
    <div class="two-col" style="gap:12px"><div class="field"><div class="field-label">Client Seed</div><input class="input mono" name="clientSeed" value="${esc(p.clientSeed || '')}"></div>
    <div class="field"><div class="field-label">Nonce</div><input class="input" name="nonce" inputmode="numeric" value="${esc(p.nonce ?? 0)}"></div></div>
    <div class="params"></div>
    <div class="field version-field" style="display:none"><div class="field-label"><span>Rules version</span><span class="dim" style="font-size:12px">Use the version the bet was placed under</span></div><select class="select" name="rulesVersion"></select></div>
  </form><div class="vf-out"></div>`;
  const form = body.querySelector('form');
  const out = body.querySelector('.vf-out');
  const paramsEl = body.querySelector('.params');
  const renderParams = async () => {
    const game = form.game.value;
    const fields = bySlug[game]?.verifyFields || [];
    const pv = p.game === game ? p.params || {} : {};
    paramsEl.innerHTML = fields
      .map(([k, label, type, def]) => {
        const v = pv[k] ?? def;
        if (Array.isArray(type)) return `<div class="field"><div class="field-label">${esc(label)}</div><select class="select" name="p_${k}">${type.map((o) => `<option ${String(o) === String(pv[k] ?? type[0]) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
        return `<div class="field"><div class="field-label">${esc(label)}</div><input class="input" name="p_${k}" value="${esc(Array.isArray(v) ? v.join(',') : v)}"></div>`;
      })
      .join('');
    const latest = await latestRulesVersion(game);
    const chosen = p.game === game && p.rulesVersion ? p.rulesVersion : latest;
    form.rulesVersion.innerHTML = Array.from({ length: latest }, (_, i) => latest - i)
      .map((v) => `<option value="${v}" ${v === chosen ? 'selected' : ''}>v${v}${v === latest ? ' (current)' : ''}</option>`)
      .join('');
    body.querySelector('.version-field').style.display = latest > 1 ? '' : 'none';
  };
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
    const own = p.game === fd.game;
    if (own && p.params) for (const [k, v] of Object.entries(p.params)) if (!(k in params)) params[k] = v;
    try {
      out.innerHTML = await renderVerification(fd.game, fd.serverSeed, fd.clientSeed, Number(fd.nonce), params, own ? p.actions : null, Number(fd.rulesVersion) || undefined);
    } catch (err) {
      out.innerHTML = `<div class="demo-notice warn">${icon('alert', 16)}<div>${esc(err.message)}</div></div>`;
    }
  };
  form.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(run, 150);
  });
  form.game.addEventListener('change', () => renderParams().then(run));
  form.addEventListener('submit', (e) => e.preventDefault());
  renderParams().then(run);
}

// Without the player's moves, multi-step games show their hidden opening
// state (card order, mine/egg positions, flip sequence) instead of an outcome.
async function renderVerification(game, serverSeed, clientSeed, nonce, params, actions, rulesVersion) {
  const cardsRow = (cards) => `<div style="display:flex;gap:6px;overflow-x:auto;padding:4px">${cards.map((c) => playingCard(c)).join('')}</div>`;
  const mod = await loadRules(game, rulesVersion);
  // Auto rounds play out from their params (autoTarget, autoHands, …), so they have an outcome.
  const autoRound = Object.entries(params || {}).some(([k, v]) => k.startsWith('auto') && v != null && v !== '');
  if (mod.stateful && !actions?.length && !autoRound) {
    const fl = await floats(serverSeed, clientSeed, nonce, 1024);
    const rng = () => createArrayRng(fl);
    const label = (t) => `<div class="field-label" style="margin-bottom:6px">${t}</div>`;
    if (game === 'videopoker') {
      const s = mod.start(rng());
      return label('Deal (5) and replacement cards (5)') + `<div class="result-preview">${cardsRow([...s.hand, ...s.reserve])}</div>`;
    }
    if (game === 'hilo' || game === 'blackjack') return label('Card sequence') + `<div class="result-preview">${cardsRow(fl.slice(0, 12).map((f) => cardFromFloat(f)))}</div>`;
    if (game === 'mines') {
      const positions = mod.minePositions(rng(), Math.max(1, Math.min(24, Number(params.mines) || 3)));
      return label('Mine positions') + renderResult('mines', { positions, revealed: [] });
    }
    if (game === 'tower') {
      const d = params.difficulty || 'easy';
      return label('Egg positions') + renderResult('tower', { difficulty: d, safeTiles: mod.layout(rng(), d), picks: [] });
    }
    if (game === 'coinflip' && mod.start) {
      const s = mod.start(rng(), {});
      return label('Flip sequence') + `<div class="result-preview" style="flex-wrap:wrap">${s.results.map((r, i) => `<span class="pill ${r === 'heads' ? 'yellow' : 'blue'}">${i + 1}. ${r}</span>`).join('')}</div>`;
    }
    if (mod.reveal) {
      const { title, result } = mod.reveal(rng(), mod.normalize({ ...params, allowEmpty: true }));
      return label(esc(title)) + (await renderResultAsync(game, result, params));
    }
  }
  const { result, params: norm } = await verifyBet({ game, serverSeed, clientSeed, nonce, params, actions: actions || [], rulesVersion });
  return `<div class="field-label" style="margin-bottom:6px">Result</div>${await renderResultAsync(game, result, norm)}
    ${result.multiplier != null ? `<div class="muted" style="text-align:center">Multiplier ${fmt.multiplier(result.multiplier ?? 0)}</div>` : ''}`;
}

const ROUND_GAMES = {
  crash: {
    name: 'Crash',
    formula: (info) =>
      `crash point = ${info.formulaVersion >= 2 ? 'max(1, 2³² ÷ (first 8 hex digits + 1) × 0.99)' : 'max(1, floor(99 ÷ (1 − first 52 bits ÷ 2⁵²)) ÷ 100)'} (formula v${info.formulaVersion})`,
    head: 'Crash point',
    cell: (c) => `<span style="color:${c.crashPoint >= 2 ? 'var(--accent)' : 'var(--text)'}">${fmt.multiplier(c.crashPoint)}</span>`,
  },
  slide: {
    name: 'Slide',
    formula: () => 'result = max(1, 2³² ÷ (first 8 hex digits + 1) × 0.98), floored to 2 decimals',
    head: 'Result',
    cell: (c) => `<span style="color:${c.point >= 2 ? 'var(--accent)' : 'var(--text)'}">${fmt.multiplier(c.point)}</span>`,
  },
  zoo: {
    name: 'Zoo',
    formula: () => 'spin j = floor(float_j × 20) for j = 0, 1, 2, using bytes 4j…4j+3 of the HMAC as the float; tiles map to the published ring',
    head: 'Spins',
    cell: (c) => c.animals.map((a) => ZOO_NAMES[a]).join(' · '),
  },
  liveroulette: {
    name: 'Live Roulette',
    formula: () => 'pocket = floor(float × 37), using the first 4 bytes of the HMAC as the float',
    head: 'Pocket',
    cell: (c) => `<span class="pill ${c.color === 'red' ? 'red' : c.color === 'green' ? 'green' : ''}">${c.number}</span>`,
  },
};

async function crashTab(body, prefill = null) {
  let game = prefill?.game && ROUND_GAMES[prefill.game] ? prefill.game : 'crash';
  const render = async () => {
    body.innerHTML = '<div class="spinner"></div>';
    let info;
    try {
      info = await api.get(`/api/fair/${game}`);
    } catch (err) {
      body.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
      return;
    }
    const g = ROUND_GAMES[game];
    const own = prefill?.game ? prefill.game === game : game === 'crash';
    const last = info.history[0];
    const fv = own && prefill?.formulaVersion != null ? prefill.formulaVersion : info.formulaVersion ?? 1;
    body.innerHTML = `
      <div class="segmented" style="margin-bottom:12px">${Object.entries(ROUND_GAMES)
        .map(([k, v]) => `<button type="button" data-g="${k}" class="${k === game ? 'active' : ''}">${v.name}</button>`)
        .join('')}</div>
      <div class="muted" style="font-size:13px;margin-bottom:12px">${g.name} rounds come from a chain of ${info.chainLength.toLocaleString()} SHA-256 hashes generated before the first round and played in reverse. Each round uses HMAC-SHA256(key = game hash, message = salt): ${g.formula({ formulaVersion: fv })}. Hashing any round's hash gives the previous round's hash, ending at the published terminating hash.</div>
      ${copyField('Terminating hash (commitment)', info.terminatingHash)}
      ${copyField('Salt', info.salt)}
      <form><div class="field"><div class="field-label">Game hash</div><input class="input mono" name="hash" value="${esc((own && prefill?.hash) || last?.hash || '')}" placeholder="Paste a round hash"></div>
        ${game === 'crash' ? `<div class="field"><div class="field-label">Formula</div><select class="select" name="formula"><option value="2" ${fv >= 2 ? 'selected' : ''}>v2 (current chains)</option><option value="1" ${fv < 2 ? 'selected' : ''}>v1 (first chains)</option></select></div>` : ''}</form>
      <div class="cx"></div>`;
    const out = body.querySelector('.cx');
    const salt = (own && prefill?.salt) || info.salt;
    const run = async () => {
      const hash = body.querySelector('[name=hash]').value.trim();
      if (!/^[0-9a-f]{64}$/.test(hash)) {
        out.innerHTML = '<div class="empty">Enter a 64-character round hash.</div>';
        return;
      }
      const formula = Number(body.querySelector('[name=formula]')?.value || 1);
      const chain = await roundChain(game, hash, salt, 10, formula);
      out.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>Hash</th><th class="r">${g.head}</th></tr></thead><tbody>${chain
        .map((c, i) => `<tr><td class="mono" style="font-size:12px">${i === 0 ? '<b>this</b> ' : ''}${c.hash.slice(0, 20)}…</td><td class="r">${g.cell(c)}</td></tr>`)
        .join('')}</tbody></table></div>`;
    };
    body.querySelector('form').addEventListener('input', run);
    body.querySelector('form').addEventListener('submit', (e) => e.preventDefault());
    body.querySelectorAll('[data-g]').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.g === game) return;
        game = b.dataset.g;
        render();
      }),
    );
    run().catch(toastError);
  };
  render();
}
