import { el, esc, on } from '../dom.js';
import { icon, coin } from '../icons.js';
import { chipRack } from '../ui/chips.js';
import { createRoundClient, phaseProgress, roundPlayers } from '../ui/roundkit.js';
import { CURRENCIES, roundDown } from '../shared/currencies.js';
import { ANIMALS, NAMES, RING, PAY, SPINS } from '../shared/games/zoo.js';

// Flat animal faces (40×40), our own art.
export const ANIMAL_SVG = {
  lion: '<circle cx="20" cy="20" r="18" fill="#e8590c"/><circle cx="20" cy="21" r="12" fill="#ffc94d"/><circle cx="15.5" cy="19" r="1.8" fill="#212529"/><circle cx="24.5" cy="19" r="1.8" fill="#212529"/><path d="M18 24h4l-2 2.5z" fill="#6b3a00"/><path d="M16.5 27.5q3.5 2.5 7 0" stroke="#6b3a00" stroke-width="1.4" fill="none"/>',
  cheetah:
    '<circle cx="9" cy="10" r="4.5" fill="#f2b33d"/><circle cx="31" cy="10" r="4.5" fill="#f2b33d"/><circle cx="20" cy="21" r="15" fill="#f8c95a"/><circle cx="12" cy="15" r="1.3" fill="#5c3b00"/><circle cx="28" cy="14" r="1.3" fill="#5c3b00"/><circle cx="25" cy="30" r="1.3" fill="#5c3b00"/><circle cx="12" cy="27" r="1.2" fill="#5c3b00"/><circle cx="15" cy="20" r="1.8" fill="#212529"/><circle cx="25" cy="20" r="1.8" fill="#212529"/><path d="M15 21l-1 6M25 21l1 6" stroke="#212529" stroke-width="1.2"/><path d="M18 25h4l-2 2.5z" fill="#212529"/>',
  elephant:
    '<ellipse cx="7.5" cy="19" rx="7" ry="10" fill="#a5b1be"/><ellipse cx="32.5" cy="19" rx="7" ry="10" fill="#a5b1be"/><circle cx="20" cy="17" r="11" fill="#c3ccd6"/><path d="M17 22q0 12 6 14 3 1 3-2-3 0-4-4l-1-8z" fill="#c3ccd6"/><circle cx="15.5" cy="15.5" r="1.7" fill="#212529"/><circle cx="24.5" cy="15.5" r="1.7" fill="#212529"/><path d="M13 23l-2 4M27 23l2 4" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
  crocodile:
    '<rect x="6" y="9" width="28" height="24" rx="11" fill="#37b24d"/><rect x="11" y="22" width="18" height="12" rx="5" fill="#2f9e44"/><circle cx="13" cy="10" r="4" fill="#37b24d"/><circle cx="27" cy="10" r="4" fill="#37b24d"/><circle cx="13" cy="10" r="2" fill="#fff"/><circle cx="27" cy="10" r="2" fill="#fff"/><circle cx="13" cy="10.5" r="1" fill="#212529"/><circle cx="27" cy="10.5" r="1" fill="#212529"/><path d="M12 27l2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2" stroke="#fff" stroke-width="1.2" fill="none"/><circle cx="17" cy="25" r="0.9" fill="#1b5e20"/><circle cx="23" cy="25" r="0.9" fill="#1b5e20"/>',
  rhino:
    '<ellipse cx="9" cy="11" rx="3.5" ry="5" fill="#8a96a3"/><ellipse cx="31" cy="11" rx="3.5" ry="5" fill="#8a96a3"/><rect x="8" y="10" width="24" height="24" rx="11" fill="#9aa6b2"/><path d="M17 24l3-11 3 11z" fill="#f1f3f5"/><path d="M18.5 16l1.5-6 1.5 6z" fill="#f1f3f5"/><circle cx="13.5" cy="19" r="1.6" fill="#212529"/><circle cx="26.5" cy="19" r="1.6" fill="#212529"/><circle cx="16" cy="29" r="1.2" fill="#495057"/><circle cx="24" cy="29" r="1.2" fill="#495057"/>',
  penguin:
    '<ellipse cx="20" cy="21" rx="14" ry="16" fill="#212529"/><ellipse cx="20" cy="24" rx="9.5" ry="11" fill="#f8f9fa"/><circle cx="16" cy="17" r="1.8" fill="#212529"/><circle cx="24" cy="17" r="1.8" fill="#212529"/><path d="M17 20h6l-3 4z" fill="#fab005"/>',
};
const animal = (a, size = 28, cls = '') => `<svg class="zo-a ${cls}" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">${ANIMAL_SVG[a]}</svg>`;
const TILE_BG = { lion: '#c2410c', cheetah: '#b7791f', elephant: '#5b6b7c', crocodile: '#2b8a3e', rhino: '#495867', penguin: '#1f2a36' };

export function renderPreview(result, params) {
  const stakes = params.stakes || {};
  return `<div style="text-align:center"><div style="display:flex;gap:8px;justify-content:center">${(result.tiles || [])
    .map((t) => `<span style="display:inline-grid;place-items:center;width:46px;height:46px;border-radius:10px;background:${TILE_BG[RING[t]]}">${animal(RING[t], 34)}</span>`)
    .join('')}</div><div class="muted" style="margin-top:8px">Backed: ${Object.keys(stakes)
    .map((a) => NAMES[a])
    .join(', ')}</div></div>`;
}

export default function mountZoo(ctx) {
  const { fmt, sound } = ctx;
  let destroyed = false;
  let raf = 0;
  let code = ctx.currency();
  let stakes = {}; // animal → amount
  let log = []; // placement history for Undo
  let lastStakes = null; // for Repeat
  let rack;
  let busy = false;
  let shownRound = null;
  let spinFrom = 0;

  const dec = () => 10 ** CURRENCIES[code].decimals;
  const addAmt = (a, b) => Math.round((a + b) * dec()) / dec();
  const total = () => Object.values(stakes).reduce((a, b) => addAmt(a, b), 0);

  const panel = ctx.createBetPanel({
    fields: [
      { key: 'chip', type: 'custom', label: 'Chip Value', render: (host) => (rack = chipRack(host, { code, selected: 1, onSelect: () => updateChipAux() })) },
      { key: 'total', type: 'readonly', label: 'Total Bet', value: fmt.amount(0, code), suffix: coin(code) },
    ],
    onBet: () => manualBet(),
    auto: {
      run: (v) => autoRound(v),
      delay: 0,
      canRun: () => {
        if (total() > 0) return true;
        ctx.toast({ type: 'error', title: 'No chips placed', message: 'Put chips on at least one animal, then start the autobet.' });
        return false;
      },
    },
  });
  const tools = el(`<div class="zo-tools"><button class="btn btn-secondary btn-sm" data-act="undo">${icon('refresh', 14)} Undo</button><button class="btn btn-secondary btn-sm" data-act="repeat">Repeat</button><button class="btn btn-secondary btn-sm" data-act="clear">${icon('trash', 14)} Clear</button></div>`);
  panel.extra.append(tools);
  const players = roundPlayers(ctx, {
    columns: ['Player', 'Animals', 'Amount'],
    cells: (b) => [`<span class="zo-backed">${Object.keys(b.params.stakes || {}).map((a) => animal(a, 18)).join('')}</span>`],
  });

  // Ring of 20 tiles around a centre display.
  const ringTiles = RING.map((a, i) => {
    const ang = (i / RING.length) * Math.PI * 2 - Math.PI / 2;
    return `<div class="zo-tile" data-i="${i}" style="--x:${(50 + 41 * Math.cos(ang)).toFixed(2)}%;--y:${(50 + 41 * Math.sin(ang)).toFixed(2)}%;--tile:${TILE_BG[a]}">${animal(a, 30)}<span class="zo-badges"></span></div>`;
  }).join('');
  const stage = el(`<div class="zo-stage">
    <div class="history-strip zo-history" aria-label="Previous rounds"></div>
    <div class="zo-arena"><div class="zo-ring">${ringTiles}
      <div class="zo-center"><div class="zo-count"></div><div class="zo-sub"></div><div class="zo-bar"><i></i></div></div></div></div>
    <div class="stage-bottom"><div class="zo-cards">${ANIMALS.map(
      (a) => `<button type="button" class="zo-card" data-a="${a}">
        <div class="zo-card-top">${animal(a, 34)}<div><div class="zo-name">${NAMES[a]}</div><div class="zo-odds">${RING.filter((x) => x === a).length}/20 tiles</div></div></div>
        <div class="zo-pays">${[1, 2, 3].map((c) => `<span><small>${'●'.repeat(c)}</small>${PAY[a][c]}×</span>`).join('')}</div>
        <div class="zo-stake"></div></button>`,
    ).join('')}</div></div>
  </div>`);
  ctx.stage.appendChild(stage);
  const histEl = stage.querySelector('.zo-history');
  const ring = stage.querySelector('.zo-ring');
  const tiles = [...stage.querySelectorAll('.zo-tile')];
  const countEl = stage.querySelector('.zo-count');
  const subEl = stage.querySelector('.zo-sub');
  const barEl = stage.querySelector('.zo-bar i');
  const cards = Object.fromEntries([...stage.querySelectorAll('.zo-card')].map((c) => [c.dataset.a, c]));

  const client = createRoundClient(ctx, 'zoo', { onState: () => onState(), onBet: () => renderPlayers(), onCancel: () => renderPlayers() });
  ctx.onDestroy(() => client.destroy());

  // ---- stakes ----
  function updateChipAux() {
    if (rack) panel.setAux('chip', fmt.money(rack.chip.value, code));
  }

  function renderStakes() {
    for (const a of ANIMALS) {
      const v = stakes[a] || 0;
      cards[a].classList.toggle('backed', v > 0);
      cards[a].querySelector('.zo-stake').innerHTML = v > 0 ? `${esc(fmt.money(v, code))} ${coin(code, 13)}` : '';
    }
    const t = total();
    panel.set('total', fmt.amount(t, code));
    const suffix = panel.field('total')?.querySelector('.suffix');
    if (suffix) suffix.innerHTML = coin(code);
    // The panel amount mirrors the table so auto "increase on win/loss" scales the stakes.
    if (!panel.autoRunning) panel.set('amount', t);
    const locked = busy || panel.autoRunning;
    tools.querySelector('[data-act=undo]').disabled = locked || !log.length;
    tools.querySelector('[data-act=clear]').disabled = locked || !log.length;
    tools.querySelector('[data-act=repeat]').disabled = locked || !lastStakes;
  }

  function addChip(a) {
    if (busy || panel.autoRunning) return;
    const amount = rack.chip.value;
    stakes[a] = addAmt(stakes[a] || 0, amount);
    log.push({ a, amount });
    sound.click();
    renderStakes();
  }

  function removeAnimal(a) {
    if (busy || panel.autoRunning || !stakes[a]) return;
    delete stakes[a];
    log = log.filter((l) => l.a !== a);
    renderStakes();
  }

  // ---- ring ----
  function clearRing() {
    tiles.forEach((t) => {
      t.classList.remove('lit', 'landed');
      t.querySelector('.zo-badges').innerHTML = '';
    });
    for (const c of Object.values(cards)) c.classList.remove('hit', 'miss');
  }

  function markLanded(result, upto) {
    tiles.forEach((t) => t.querySelector('.zo-badges').innerHTML = '');
    for (let j = 0; j < upto; j++) {
      const t = tiles[result.tiles[j]];
      t.classList.add('landed');
      t.querySelector('.zo-badges').insertAdjacentHTML('beforeend', `<i>${j + 1}</i>`);
    }
  }

  function showResultCards(result) {
    for (const a of ANIMALS) {
      const c = result.counts[a];
      cards[a].classList.toggle('hit', c > 0);
      cards[a].classList.toggle('miss', c === 0);
      cards[a].dataset.count = c;
    }
  }

  // ---- views ----
  function renderHistory() {
    histEl.innerHTML = client.s.history
      .slice(0, 10)
      .reverse()
      .map((h) => `<button class="chip zo-h" data-hash="${esc(h.hash)}" data-tip="Round ${esc(h.id)} · verify">${h.result.tiles.map((t) => animal(RING[t], 18)).join('')}</button>`)
      .join('');
  }

  function renderPlayers() {
    players.render(client.s.bets, { phase: client.s.round?.phase, isMine: client.isMine, onCancel: (id) => cancel(id) });
  }

  function renderButton() {
    if (panel.mode !== 'manual') return;
    const phase = client.s.round?.phase;
    panel.setButton(!phase || phase === 'betting' ? 'Bet' : 'Bet (Next Round)', { disabled: busy });
  }

  function onState() {
    const r = client.s.round;
    if (!r) return;
    if (r.phase === 'betting' && shownRound && shownRound !== r.id) {
      clearRing();
      shownRound = null;
    }
    if (r.phase === 'result' && shownRound !== r.id) {
      shownRound = r.id;
      markLanded(r.result, SPINS);
      showResultCards(r.result);
      spinFrom = r.result.tiles[SPINS - 1];
      const mine = client.myBets();
      if (mine.length) {
        const paid = mine.reduce((a, b) => a + (b.payout || 0), 0);
        const staked = mine.reduce((a, b) => a + b.amount, 0);
        if (paid > staked) sound.win();
        else if (!paid) sound.lose();
      }
    }
    renderHistory();
    renderPlayers();
    renderButton();
  }

  // Spin j runs during the j-th third of the playing phase.
  function frame() {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const r = client.s.round;
    if (!r) return;
    const { left, p } = phaseProgress(client);
    if (r.phase === 'betting') {
      countEl.textContent = `${(left / 1000).toFixed(1)}s`;
      subEl.textContent = 'Place your chips';
      barEl.style.transform = `scaleX(${1 - p})`;
      barEl.parentElement.hidden = false;
      return;
    }
    barEl.parentElement.hidden = true;
    if (r.phase === 'playing' && r.result) {
      const anim = ctx.animations();
      const k = anim ? Math.min(SPINS - 1, Math.floor(p * SPINS)) : SPINS - 1;
      const t = anim ? Math.min(1, p * SPINS - k) : 1;
      markLanded(r.result, k);
      const from = k === 0 ? spinFrom : r.result.tiles[k - 1];
      const to = r.result.tiles[k];
      const dist = RING.length * 2 + ((to - from + RING.length) % RING.length);
      const pos = Math.floor(from + dist * (1 - (1 - t) ** 3)) % RING.length;
      tiles.forEach((tile, i) => tile.classList.toggle('lit', i === pos));
      countEl.textContent = `Spin ${k + 1}`;
      subEl.textContent = 'of 3';
      return;
    }
    if (r.phase === 'result' && r.result) {
      tiles.forEach((tile) => tile.classList.remove('lit'));
      const mine = client.myBets();
      const paid = mine.reduce((a, b) => a + (b.payout || 0), 0);
      countEl.textContent = mine.length ? (paid > 0 ? fmt.money(paid, mine[0].currency) : 'No win') : 'Round over';
      countEl.classList.toggle('win', paid > 0);
      subEl.textContent = r.result.tiles.map((t) => NAMES[RING[t]]).join(' · ');
    }
  }

  // ---- actions ----
  async function place(sendStakes) {
    const amount = Object.values(sendStakes).reduce((a, b) => addAmt(a, b), 0);
    if (!amount) {
      ctx.toast({ type: 'error', title: 'No chips placed', message: 'Pick a chip and click an animal to back it.' });
      return null;
    }
    if (!panel.checkBalance(amount)) return null;
    const res = await client.place({ stakes: sendStakes });
    sound.bet();
    lastStakes = { ...sendStakes };
    renderPlayers();
    return res;
  }

  async function manualBet() {
    if (busy || !ctx.requireAuth()) return;
    busy = true;
    renderButton();
    try {
      const res = await place(stakes);
      if (res) {
        stakes = {};
        log = [];
        if (res.queued) ctx.toast({ title: 'Bet queued', message: 'Your chips join the next round.' });
      }
    } finally {
      busy = false;
      renderStakes();
      renderButton();
    }
  }

  async function cancel(id) {
    try {
      await client.cancel(id);
      sound.click();
      renderPlayers();
    } catch (err) {
      ctx.toastError(err);
    }
  }

  // Auto keeps the table's chips and scales them with the panel amount.
  async function autoRound(v) {
    if (!ctx.requireAuth()) return null;
    const base = total();
    const k = base ? v.amount / base : 1;
    const send = {};
    for (const [a, s] of Object.entries(stakes)) {
      const x = roundDown(code, s * k);
      if (x > 0) send[a] = x;
    }
    const res = await place(send);
    if (!res || destroyed) return null;
    const bet = await client.settled(res.bet.id);
    if (!bet || destroyed) return null;
    return { win: bet.payout > bet.amount, profit: bet.payout - bet.amount };
  }

  on(stage, 'click', '.zo-card', (e, c) => addChip(c.dataset.a));
  on(stage, 'contextmenu', '.zo-card', (e, c) => {
    e.preventDefault();
    removeAnimal(c.dataset.a);
  });
  on(histEl, 'click', '[data-hash]', async (e, b) => {
    const { openFairnessModal } = await import('../ui/fairness.js');
    openFairnessModal({ tab: 'crash', prefill: { game: 'zoo', hash: b.dataset.hash } });
  });
  on(tools, 'click', '[data-act]', (e, b) => {
    if (b.disabled) return;
    if (b.dataset.act === 'undo') {
      const last = log.pop();
      if (last) {
        const next = addAmt(stakes[last.a] || 0, -last.amount);
        if (next > 0) stakes[last.a] = next;
        else delete stakes[last.a];
      }
    } else if (b.dataset.act === 'clear') {
      stakes = {};
      log = [];
    } else if (b.dataset.act === 'repeat' && lastStakes) {
      stakes = { ...lastStakes };
      log = Object.entries(stakes).map(([a, amount]) => ({ a, amount }));
    }
    renderStakes();
  });
  panel.onChange((key) => {
    if (key === 'mode' || key === 'autoStopped') {
      renderButton();
      renderStakes();
    }
  });
  ctx.on('currency', (c) => {
    code = c;
    stakes = {};
    log = [];
    lastStakes = null;
    rack.setCurrency(c);
    updateChipAux();
    renderStakes();
  });

  updateChipAux();
  renderStakes();
  client.fetchState();
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
    },
  };
}
