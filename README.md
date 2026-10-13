# Fakesino

A complete online casino that runs entirely on **play money**. It has everything you'd expect from a modern crypto/online casino — a multi-currency wallet, card checkout, crypto deposits, withdrawals, a vault, VIP levels, rakeback, live bets, chat and fifteen games with real rules, real payout tables and provably fair results — except that none of the money is real.

- **Deposits** go through a full checkout (amount → card details → 3-D Secure → receipt) that only accepts published demo card numbers. Real card numbers are refused in the browser before they are sent, and refused again by the server.
- **Crypto deposits** show a fake address (prefixed `fake…`, valid on no blockchain) and let you simulate an incoming transfer that confirms block by block.
- **Withdrawals** debit your balance and "complete" after a few seconds — the money goes nowhere.
- **No sign-up.** Open the site and you already have a wallet. It's tied to a random key saved in your browser, and the balance is mirrored to local storage, so it survives restarts — even if the server's database is wiped, your browser rebuilds the wallet. Copy the key from **Settings → Wallet backup** to open the same wallet in another browser.

> Fakesino is a simulation for fun, demos and learning. Balances have no cash value and nothing can ever be paid out.

## Quick start

```bash
npm start            # http://localhost:3000
npm test             # 40 tests: fairness, RTP of every table, game rules, API flows
```

Requires Node.js 18.17+. There are **no dependencies** — no `npm install` needed. Data is stored in `data/db.json` (override with `FAKESINO_DATA=/path/db.json`, port with `PORT`).

Open the site, click **Wallet → Deposit**, and pay with a demo card:

| Card number | Result |
| --- | --- |
| `4242 4242 4242 4242` | Visa — succeeds |
| `5555 5555 5555 4444` | Mastercard — succeeds |
| `3782 822463 10005` | Amex — succeeds (4-digit CVC) |
| `6011 1111 1111 1117` | Discover — succeeds |
| `4000 0027 6000 3184` | Requires 3-D Secure (code `123456`) |
| `4000 0000 0000 0002` | Declined |
| `4000 0000 0000 9995` | Declined — insufficient funds |

Any future expiry date and any CVC work.

## Games

| Game | Type | RTP |
| --- | --- | --- |
| Crash | Multiplayer, shared rounds from a pre-committed hash chain | 99% |
| Plinko | 8–16 rows, low/medium/high risk | 99% |
| Mines | 5×5 grid, 1–24 mines | 99% |
| Dice | Roll over/under, 0.01%–98% chance | 99% |
| Limbo | Target 1.01×–1,000,000× | 99% |
| Keno | 40 numbers, 10 drawn, four risk tables | 99% |
| Wheel | 10–50 segments, three risk levels | 99% |
| Hilo | Infinite deck, higher/lower/same, skip, cash out | 99% |
| Dragon Tower | 9 floors, five difficulties | 98% |
| Coinflip | Heads or tails, 1.98× | 99% |
| Blackjack | 3:2, dealer stands on 17, double, split, insurance | ~99.5% |
| Roulette | European single zero, every inside and outside bet | 97.3% |
| Baccarat | Punto banco, standard third-card rules | ~98.9% |
| Video Poker | 9/6 Jacks or Better | ~99.5% |
| Neon Fruits | 5×3 video slot, 20 lines, wilds, scatters, free spins ×3 | 96.3% |

Every payout table is verified by `test/rtp.test.js` (exactly, not by simulation).

## Provably fair

Each user has a server seed (shown hashed in advance), a client seed they can change, and a nonce. Results come from `HMAC_SHA256(serverSeed, clientSeed:nonce:round)` turned into floats, and the same shared modules (`public/js/shared/games/*.js`) compute outcomes on the server and in the browser verifier. Rotating your seed pair reveals the old server seed so you can verify every past bet in **Fairness → Verify**. Crash uses a 20,000-long SHA-256 hash chain played in reverse with a published terminating hash.

## Architecture

```
server/            Node http server (no framework)
  app.js           routes, static files, security headers
  accounts.js      browser-key wallets (no sign-up), sessions, balances, VIP
  payments.js      demo card checkout + 3DS, fake crypto deposits, withdrawals, vault, bonuses
  engine.js        bet engine for instant, multi-step and chip games
  crash.js         multiplayer crash rounds + hash chain
  live.js          server-sent events (live bets, crash, chat, balance pushes)
  store.js         JSON file database with atomic writes
public/
  js/shared/       game rules, payout tables and fairness — used by server AND browser
  js/games/        one UI module per game
  js/ui/           shell, wallet/checkout, fairness, bet panel, live bets, chat…
  js/pages/        lobby, game page, VIP, transactions, settings, provably fair…
test/              node:test suites
```

## License

MIT
