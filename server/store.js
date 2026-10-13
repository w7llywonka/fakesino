import fs from 'node:fs';
import path from 'node:path';

const MAX_BETS = 20000; // kept in memory for feeds, history and bet lookups
const MAX_TX = 20000;
const COMPACT_LINES = 100000;

const empty = () => ({
  version: 1,
  seq: { user: 0, bet: 0, tx: 0, msg: 0 },
  users: {},
  usernames: {}, // lowercase username → id
  devices: {}, // sha256(device key) → user id; the device key lives only in the browser
  sessions: {}, // token → { userId, createdAt }
  bets: [],
  transactions: [],
  payments: {},
  chat: [],
  crash: null,
});

// Small JSON-file database. All mutations happen synchronously on the single
// Node thread, so each request handler sees a consistent view. Everything
// except bets is snapshotted to `file` (debounced, atomic tmp + rename); bets
// are high-volume, so they are appended to `file.bets.jsonl` instead.
export class Store {
  constructor(file) {
    this.file = file;
    this.betsFile = file ? `${file}.bets.jsonl` : null;
    this.data = empty();
    this.timer = null;
    this.pendingBets = [];
    if (file && fs.existsSync(file)) {
      try {
        this.data = { ...empty(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
      } catch (err) {
        const backup = `${file}.corrupt-${Date.now()}`;
        fs.renameSync(file, backup);
        console.error(`[store] could not parse ${file}, moved to ${backup}:`, err.message);
      }
    }
    if (this.betsFile && fs.existsSync(this.betsFile)) this.loadBets();
  }

  loadBets() {
    const lines = fs.readFileSync(this.betsFile, 'utf8').split('\n').filter(Boolean);
    const bets = [];
    for (const line of lines.slice(-MAX_BETS)) {
      try {
        bets.push(JSON.parse(line));
      } catch {
        /* skip a torn final line */
      }
    }
    this.data.bets = bets;
    if (lines.length > COMPACT_LINES) {
      fs.writeFileSync(`${this.betsFile}.tmp`, bets.map((b) => JSON.stringify(b)).join('\n') + '\n');
      fs.renameSync(`${this.betsFile}.tmp`, this.betsFile);
    }
  }

  nextId(kind) {
    this.data.seq[kind] = (this.data.seq[kind] || 0) + 1;
    return this.data.seq[kind];
  }

  save() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 500);
  }

  flush() {
    if (!this.file) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (this.pendingBets.length) {
      fs.appendFileSync(this.betsFile, this.pendingBets.map((b) => JSON.stringify(b)).join('\n') + '\n');
      this.pendingBets = [];
    }
    const { bets, ...rest } = this.data;
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(rest));
    fs.renameSync(tmp, this.file);
  }

  addBet(bet) {
    this.data.bets.push(bet);
    if (this.data.bets.length > MAX_BETS) this.data.bets.splice(0, this.data.bets.length - MAX_BETS);
    if (this.betsFile) this.pendingBets.push(bet);
    this.save();
  }

  addTransaction(tx) {
    this.data.transactions.push(tx);
    if (this.data.transactions.length > MAX_TX) this.data.transactions.splice(0, this.data.transactions.length - MAX_TX);
    this.save();
  }

  findBet(id) {
    // Bet ids are increasing, so binary search the array.
    const bets = this.data.bets;
    let lo = 0;
    let hi = bets.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (bets[mid].id === id) return bets[mid];
      if (bets[mid].id < id) lo = mid + 1;
      else hi = mid - 1;
    }
    return null;
  }
}
