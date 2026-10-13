import { icon } from '../icons.js';

export default function fairPage(page) {
  document.title = 'Provably Fair — Fakesino';
  page.innerHTML = `<div class="page-title">${icon('shield', 22)} Provably Fair</div>
  <div class="card doc">
    <p>Every result on Fakesino can be checked by you, after the fact, without trusting us. Before you bet we commit to a secret <b>server seed</b> by showing you its SHA-256 hash. You choose a <b>client seed</b>. Each bet also has a <b>nonce</b> that counts up by one.</p>
    <p>When you rotate your seed pair, the old server seed is revealed. Hash it yourself and compare: if it matches the hash you were shown, the server could not have changed it — so none of the results produced with it could have been manipulated.</p>
    <div class="row" style="gap:10px;flex-wrap:wrap"><a class="btn btn-primary" href="?modal=fairness&tab=seeds">Manage seeds</a><a class="btn btn-secondary" href="?modal=fairness&tab=verify">Open the verifier</a></div>

    <h2>Random number generation</h2>
    <p>Each bet turns the three inputs into floats between 0 and 1:</p>
<pre>digest = HMAC_SHA256(key = serverSeed, message = clientSeed + ":" + nonce + ":" + round)
float  = byte0/256 + byte1/256² + byte2/256³ + byte3/256⁴</pre>
    <p>One digest gives 32 bytes, so 8 floats. Games that need more (a Plinko drop with 16 rows, a hand of blackjack, free spins) increment <code>round</code> for the next 8.</p>

    <h2>From floats to results</h2>
    <ul>
      <li><b>Dice</b> — <code>roll = floor(float × 10001) / 100</code>, giving 0.00–100.00.</li>
      <li><b>Limbo</b> — <code>result = floor(0.99 / float × 100) / 100</code>, at least 1.00×.</li>
      <li><b>Plinko</b> — one float per row; under 0.5 bounces left, otherwise right.</li>
      <li><b>Mines, Keno, Video Poker, Dragon Tower</b> — floats pick positions one at a time from the items still left (a Fisher–Yates shuffle).</li>
      <li><b>Cards</b> (Blackjack, Hilo, Baccarat) — <code>index = floor(float × 52)</code> from an infinite deck: rank = index ÷ 4 (2 … A), suit = index mod 4 (♦ ♥ ♠ ♣).</li>
      <li><b>Roulette</b> — <code>pocket = floor(float × 37)</code>. <b>Wheel</b> — <code>segment = floor(float × segments)</code>. <b>Coinflip</b> — heads under 0.5.</li>
      <li><b>Slots</b> — one float per reel stops it at <code>floor(float × reelLength)</code>; free spins keep consuming floats.</li>
    </ul>

    <h2>Crash</h2>
    <p>Crash is shared by every player, so it uses a pre-generated hash chain instead of personal seeds. We generated ${(20000).toLocaleString()} SHA-256 hashes in a row and play them backwards. The last hash in the chain (the <b>terminating hash</b>) is published up front. Hashing any round's hash gives the previous round's hash, so the whole future sequence was fixed before the first round started.</p>
<pre>h = HMAC_SHA256(key = gameHash, message = salt)
x = int(first 13 hex chars of h) / 2^52
crashPoint = max(1, floor(99 / (1 − x)) / 100)</pre>
    <p>This gives every target multiplier <i>m</i> a <code>0.99 / m</code> chance of being reached — a 1% house edge.</p>

    <h2>House edge by game</h2>
    <p>Dice, Limbo, Plinko, Mines, Keno, Wheel, Hilo, Coinflip and Crash: 1%. Dragon Tower: 2%. Blackjack ≈ 0.5% with perfect strategy. Video Poker (9/6 Jacks or Better) ≈ 0.46% with perfect strategy. Baccarat ≈ 1.06–1.24%. Roulette: 2.7%. Neon Fruits slot: 3.7% (96.3% RTP).</p>
  </div>`;
}
