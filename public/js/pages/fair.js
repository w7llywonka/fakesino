import { el, esc, on } from '../dom.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { GAMES, bySlug } from '../games/registry.js';
import { hmacHex, sha256Hex } from '../verify.js';
import { verifyTab } from '../ui/fairness.js';
import * as fmt from '../format.js';
import { markStep } from '../ui/onboarding.js';

const TABS = [
  ['overview', 'Overview'],
  ['implementation', 'Implementation'],
  ['conversions', 'Conversions'],
  ['game-events', 'Game Events'],
  ['unhash', 'Unhash'],
  ['calculation', 'Calculation'],
];

// How each game turns floats into a result. Formulas mirror public/js/shared/games/*.js.
const EVENTS = {
  dice: 'One float. <code>roll = floor(float × 10001) ÷ 100</code>, giving 0.00–100.00. Over/Under, Between, Outside and Two Ranges all compare against that roll.',
  limbo: 'One float. <code>result = floor(0.99 ÷ float × 100) ÷ 100</code>, at least 1.00× and capped at 1,000,000×. You win when the result reaches your target.',
  plinko: 'One float per row: below 0.5 bounces left, otherwise right. The number of right bounces is the slot.',
  mines: 'Up to 24 floats run a Fisher–Yates selection over the 25 tiles; the first <i>m</i> picks are the mines.',
  keno: '10 floats run a Fisher–Yates selection over the numbers 1–40; those are the 10 drawn numbers.',
  wheel: 'One float. <code>segment = floor(float × segments)</code>.',
  roulette: 'One float. <code>pocket = floor(float × 37)</code> on a single-zero wheel.',
  hilo: 'One float per card from an infinite deck: <code>index = floor(float × 52)</code>, rank = index ÷ 4 (2 … A), suit = index mod 4 (♦ ♥ ♠ ♣).',
  blackjack: 'Infinite deck. Each card drawn — player, dealer, splits, doubles — uses the next float: <code>index = floor(float × 52)</code>.',
  baccarat: 'Infinite deck, punto banco third-card rules. Cards are drawn in order Player, Banker, Player, Banker, then any third cards: <code>index = floor(float × 52)</code>.',
  videopoker: '52 floats shuffle one deck (Fisher–Yates). Cards 1–5 are the deal; cards 6–10 replace discards from left to right.',
  tower: 'For each of the 9 rows, a Fisher–Yates selection over the row’s tiles picks where the eggs are (difficulty sets tiles per row and eggs per row).',
  coinflip: '20 floats are drawn up front, one per flip: <code>float ≤ 0.5</code> lands tails, otherwise heads.',
  slots: 'One float per reel: <code>stop = floor(float × reelLength)</code>. Free spins keep consuming floats from the same stream.',
  diamonds: 'Five floats, one per gem: <code>gem = floor(float × 7)</code>. The pay comes from how many gems share a colour.',
  darts: 'Two floats. The first sets the angle (visual only); the second is the area fraction from the centre, <code>radius = √float</code>, which picks the ring.',
  tarot: 'Three floats, flipped middle (Major), left (Minor), right (Minor). Each float walks the published probability table for that card.',
  blitz: 'One float per card: <code>index = floor(float × 52)</code>. The run ends at the first repeated card.',
  chicken: '20 floats run a Fisher–Yates selection over the 20 lanes; the first 1/3/5/10 (by difficulty) are the lanes with cars.',
  pump: '24 floats run a Fisher–Yates selection over pumps 1–25; the first 1/3/5/10 (by difficulty) are the pop points.',
  moles: 'Each step draws one float per mole and runs a Fisher–Yates selection over the 7 holes.',
  lava: 'Each round, one float per dropped tile runs a Fisher–Yates selection over the tiles still standing.',
  rps: 'One float per throw: <code>house = floor(float × 3)</code> → Rock, Paper or Scissors. A draw consumes the float and replays.',
};

const ROUND_EVENTS = {
  crash: 'Shared round from a pre-generated hash chain. <code>h = HMAC_SHA256(gameHash, salt)</code>; <code>crash point = max(1, 2³² ÷ (int(first 8 hex of h) + 1) × 0.99)</code>, floored to 2 decimals.',
  slide: 'Shared round from its own hash chain. Same as Crash with a 2% edge: <code>result = max(1, 2³² ÷ (int(first 8 hex of h) + 1) × 0.98)</code>.',
  liveroulette: 'Shared table from its own hash chain: <code>pocket = floor(float × 37)</code>, where the float comes from the first 4 bytes of <code>HMAC_SHA256(gameHash, salt)</code>. Payouts as on the solo table.',
  zoo: 'Shared round from its own hash chain. Three spins of the 20-tile ring: spin <i>j</i> = <code>floor(float_j × 20)</code>, where float_j is built from bytes 4j…4j+3 of <code>HMAC_SHA256(gameHash, salt)</code>.',
};

export default function fairPage(page, { tab = 'overview' } = {}) {
  document.title = 'Provably Fair — Fakesino';
  markStep('fair');
  if (!TABS.some(([k]) => k === tab)) tab = 'overview';
  const root = el(`<div class="fair-page"><div class="page-title">${icon('shield', 22)} Provably Fair</div>
    <div class="fair-layout"><nav class="fair-nav">${TABS.map(([k, l]) => `<a class="${k === tab ? 'active' : ''}" href="/provably-fair/${k}">${l}</a>`).join('')}</nav>
    <div class="card doc fair-body"></div></div></div>`);
  page.appendChild(root);
  const body = root.querySelector('.fair-body');
  ({ overview, implementation, conversions, 'game-events': gameEvents, unhash, calculation })[tab](body);
}

function overview(body) {
  body.innerHTML = `<h2 style="margin-top:0">Solving the trust issue with online gambling</h2>
    <p>Every result on Fakesino can be checked by you, after the fact, without trusting us. Before you bet we commit to a secret <b>server seed</b> by showing you its SHA-256 hash. You choose a <b>client seed</b>. Each bet also has a <b>nonce</b> that counts up by one.</p>
    <p>Because the server seed is fixed (and hashed) before you choose your client seed, neither side can steer the result: we can’t pick a server seed that beats your client seed, and you can’t pick a client seed that beats ours.</p>
    <p>When you rotate your seed pair, the old server seed is revealed. Hash it yourself and compare: if it matches the hash you were shown, none of the results produced with it could have been changed.</p>
    <p>Shared games (Crash, Slide and Zoo) use a pre-generated hash chain instead of personal seeds; see <a class="link" href="/provably-fair/game-events">Game Events</a>.</p>
    <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:16px"><a class="btn btn-primary" href="?modal=fairness&tab=seeds">Manage seeds</a><a class="btn btn-secondary" href="/provably-fair/calculation">Verify a bet</a></div>
    <h2>House edge by game</h2>
    <div class="table-wrap"><table class="table"><thead><tr><th>Game</th><th class="r">House edge</th><th class="r">RTP</th></tr></thead><tbody>
    ${GAMES.slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((g) => `<tr><td><a class="cell-game" href="/casino/games/${g.slug}">${icon(g.slug, 16)} ${esc(g.name)}</a></td><td class="r">${fmt.percent((g.edge ?? 0) * 100)}</td><td class="r">${fmt.percent(g.rtp ?? (1 - (g.edge ?? 0)) * 100)}</td></tr>`)
      .join('')}</tbody></table></div>
    <p class="muted" style="font-size:13px">Blackjack and Video Poker edges assume perfect strategy.</p>`;
}

function implementation(body) {
  body.innerHTML = `<h2 style="margin-top:0">Random number generation</h2>
    <p>For each bet, the server seed, client seed, nonce and a <b>cursor</b> are combined with HMAC-SHA256. Each HMAC gives 32 bytes; games that need more bytes increment the cursor for the next 32.</p>
<pre>// Inputs: serverSeed, clientSeed, nonce, cursor (starts at 0)
function* byteGenerator(serverSeed, clientSeed, nonce, cursor = 0) {
  let round = Math.floor(cursor / 32);
  let pos = cursor % 32;
  while (true) {
    const hmac = HMAC_SHA256(serverSeed, \`\${clientSeed}:\${nonce}:\${round}\`);
    for (let i = pos; i < 32; i++) yield hmac[i];
    pos = 0;
    round += 1;
  }
}</pre>
    <h2>Server seed</h2>
    <p>The server seed is 32 random bytes in hex, generated before you bet. You see <code>SHA-256(serverSeed)</code> as the active hash and the hash of the <i>next</i> server seed too, so rotation can’t swap seeds either.</p>
    <h2>Client seed</h2>
    <p>The client seed is yours: change it any time in <a class="link" href="?modal=fairness&tab=seeds">Seeds</a>. A new wallet gets a random one.</p>
    <h2>Nonce</h2>
    <p>The nonce starts at 0 for each seed pair and increases by 1 after every bet, so each bet with the same seeds gets fresh bytes.</p>
    <h2>Cursor</h2>
    <p>One HMAC gives 8 floats (4 bytes each). Games that need more — Plinko with 16 rows, a Keno draw of 10, a 52-card shuffle — move the cursor (round) on to the next HMAC with the same nonce.</p>`;
}

function conversions(body) {
  body.innerHTML = `<h2 style="margin-top:0">Bytes to floats</h2>
    <p>Every 4 bytes become one float in [0, 1):</p>
<pre>float = byte₀ ÷ 256 + byte₁ ÷ 256² + byte₂ ÷ 256³ + byte₃ ÷ 256⁴</pre>
    <p>The chance of a float being exactly 1 is zero, and every value in [0, 1) is equally likely to 9 decimal places. Games scale a float to a range: <code>floor(float × n)</code> picks one of <i>n</i> outcomes uniformly.</p>
    <h2>Try it</h2>
    <form class="conv-form" novalidate>
      <div class="two-col" style="gap:12px"><div class="field"><div class="field-label">Server seed</div><input class="input mono" name="serverSeed" value="${'0'.repeat(16)}"></div>
      <div class="field"><div class="field-label">Client seed</div><input class="input mono" name="clientSeed" value="my-client-seed"></div></div>
      <div class="two-col" style="gap:12px"><div class="field"><div class="field-label">Nonce</div><input class="input" name="nonce" inputmode="numeric" value="0"></div>
      <div class="field"><div class="field-label">Cursor (round)</div><input class="input" name="round" inputmode="numeric" value="0"></div></div>
    </form>
    <div class="conv-out"></div>`;
  const form = body.querySelector('form');
  const out = body.querySelector('.conv-out');
  const run = async () => {
    const fd = Object.fromEntries(new FormData(form));
    const hex = await hmacHex(fd.serverSeed, `${fd.clientSeed}:${Number(fd.nonce) || 0}:${Number(fd.round) || 0}`);
    const bytes = hex.match(/../g).map((h) => parseInt(h, 16));
    const rows = [];
    for (let i = 0; i < 8; i++) {
      const b = bytes.slice(i * 4, i * 4 + 4);
      const f = b.reduce((a, x, j) => a + x / 256 ** (j + 1), 0);
      rows.push(`<tr><td>${i}</td><td class="mono">${b.map((x) => String(x).padStart(3, ' ')).join(' ')}</td><td class="mono">${f.toFixed(10)}</td><td class="mono hide-mobile">${(Math.floor(f * 10001) / 100).toFixed(2)}</td></tr>`);
    }
    out.innerHTML = `<div class="field-label">HMAC_SHA256 (hex)</div><div class="mono conv-hex">${hex}</div>
      <div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Bytes</th><th>Float</th><th class="hide-mobile">As a dice roll</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  };
  form.addEventListener('input', run);
  form.addEventListener('submit', (e) => e.preventDefault());
  run();
}

function gameEvents(body) {
  const games = GAMES.slice().sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  body.innerHTML = `<h2 style="margin-top:0">Game events</h2>
    <p>A game event turns the floats into something you see: a roll, a card, a tile, a multiplier. Every game’s rules live in a public module that runs both on the server and in your browser’s verifier.</p>
    <div class="ge-list">${games
      .map((g) => {
        const text = ROUND_EVENTS[g.slug] || EVENTS[g.slug] || 'Floats are consumed in order from the stream described under Implementation.';
        return `<div class="ge-item" id="ge-${g.slug}"><div class="ge-head">${icon(g.slug, 18)} <b>${esc(g.name)}</b><span class="pill">${fmt.percent((g.edge ?? 0) * 100)} edge</span></div><div class="ge-text">${text}</div></div>`;
      })
      .join('')}</div>
    <h2>Hash chains (Crash, Slide, Zoo)</h2>
    <p>We generate 20,000 SHA-256 hashes in a row from a secret seed and play them backwards. The last hash (the <b>terminating hash</b>) and a public salt are published before the first round. Hashing any round’s hash gives the previous round’s hash, so the whole sequence was fixed in advance. Live chain details are in <a class="link" href="?modal=fairness&tab=crash">Fairness → Live Games</a>.</p>`;
}

function unhash(body) {
  body.innerHTML = `<h2 style="margin-top:0">Unhash server seed</h2>
    <p>Paste the hash of a server seed you played with. Once you have rotated that seed pair, this shows the original server seed so you can check every bet made with it.</p>
    <form class="unhash-form" novalidate>
      <div class="field" data-field="hash"><div class="field-label">Server seed (hashed)</div><input class="input mono" name="hash" autocomplete="off" placeholder="64 hex characters"><div class="field-error"></div></div>
      <button class="btn btn-primary" type="submit">Unhash</button>
    </form><div class="unhash-out" style="margin-top:16px"></div>
    <div class="unhash-recent" style="margin-top:20px"></div>`;
  const form = body.querySelector('form');
  const out = body.querySelector('.unhash-out');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.querySelector('[data-field=hash]');
    f.classList.remove('invalid');
    out.innerHTML = '';
    try {
      const { seed } = await api.get(`/api/fair/unhash?hash=${encodeURIComponent(form.hash.value.trim())}`);
      const check = await sha256Hex(seed.serverSeed);
      out.innerHTML = `<div class="summary"><div class="line"><span>Server seed</span><span class="mono" style="word-break:break-all;text-align:right">${esc(seed.serverSeed)}</span></div>
        <div class="line"><span>SHA-256 check</span><span>${check === seed.serverSeedHash ? '<span class="pill green">Matches</span>' : '<span class="pill red">Mismatch</span>'}</span></div>
        <div class="line"><span>Client seed</span><span class="mono">${esc(seed.clientSeed)}</span></div>
        <div class="line"><span>Bets made</span><span>${seed.nonce}</span></div>
        <div class="line"><span>Revealed</span><span>${fmt.dateTime(seed.revealedAt)}</span></div></div>
        <a class="btn btn-secondary" style="margin-top:12px" href="/provably-fair/calculation?serverSeed=${encodeURIComponent(seed.serverSeed)}&clientSeed=${encodeURIComponent(seed.clientSeed)}">Verify bets with this seed</a>`;
    } catch (err) {
      f.classList.add('invalid');
      f.querySelector('.field-error').textContent = err.message;
    }
  });
  if (!state.user) return;
  api
    .get('/api/fair/seeds')
    .then(({ active, history }) => {
      const recent = body.querySelector('.unhash-recent');
      recent.innerHTML = `<div class="field-label">Your seed hashes</div>
        <div class="unhash-hashes"><button type="button" class="unhash-chip" data-h="${esc(active.serverSeedHash)}"><span class="pill yellow">Active</span><span class="mono">${esc(active.serverSeedHash.slice(0, 24))}…</span></button>
        ${history
          .slice(0, 6)
          .map((h) => `<button type="button" class="unhash-chip" data-h="${esc(h.serverSeedHash)}"><span class="pill green">Revealed</span><span class="mono">${esc(h.serverSeedHash.slice(0, 24))}…</span></button>`)
          .join('')}</div>`;
      on(recent, 'click', '[data-h]', (e, b) => {
        form.hash.value = b.dataset.h;
        form.requestSubmit();
      });
    })
    .catch(() => {});
}

function calculation(body) {
  const q = Object.fromEntries(new URLSearchParams(location.search));
  body.innerHTML = `<h2 style="margin-top:0">Calculation</h2>
    <p>Pick a game and enter the seeds to recompute any bet in your browser. Nothing is sent to the server.</p><div class="calc"></div>`;
  const game = q.game && bySlug[q.game] && bySlug[q.game].kind !== 'multiplayer' ? q.game : 'dice';
  verifyTab(body.querySelector('.calc'), { game, serverSeed: q.serverSeed, clientSeed: q.clientSeed, nonce: q.nonce ?? 0 });
}
