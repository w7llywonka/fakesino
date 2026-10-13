// Advanced autobet: strategies are ordered condition blocks evaluated after
// every settled bet. Pure logic, shared by the bet panel and the tests.
//
// Block kinds:
//   { type: 'bet', trigger, n, event, action, value }
//     trigger: every | everyStreakOf | firstStreakOf | streakGreaterThan | streakLowerThan
//     event:   bets | wins | losses
//   { type: 'profit', cmp, amount, action, value }
//     cmp: gt | gte | lt | lte (session profit vs amount)
// Actions: increaseBetPct, decreaseBetPct, addToBet, subtractFromBet, setBet,
// resetBet, increaseWinChancePct, decreaseWinChancePct, addToWinChance,
// subtractFromWinChance, setWinChance, resetWinChance, switchOverUnder, stop.
// A value of 'base' means the base bet amount.

export const TRIGGERS = [
  ['every', 'Every'],
  ['everyStreakOf', 'Every streak of'],
  ['firstStreakOf', 'First streak of'],
  ['streakGreaterThan', 'Streak greater than'],
  ['streakLowerThan', 'Streak lower than'],
];
export const EVENTS = [
  ['bets', 'Bets'],
  ['wins', 'Wins'],
  ['losses', 'Losses'],
];
export const CMPS = [
  ['gt', 'Greater than'],
  ['gte', 'Greater than or equal to'],
  ['lt', 'Lower than'],
  ['lte', 'Lower than or equal to'],
];
export const ACTIONS = [
  ['increaseBetPct', 'Increase bet amount by %', 'bet'],
  ['decreaseBetPct', 'Decrease bet amount by %', 'bet'],
  ['addToBet', 'Add to bet amount', 'bet'],
  ['subtractFromBet', 'Subtract from bet amount', 'bet'],
  ['setBet', 'Set bet amount', 'bet'],
  ['resetBet', 'Reset bet amount', 'bet'],
  ['increaseWinChancePct', 'Increase win chance by %', 'chance'],
  ['decreaseWinChancePct', 'Decrease win chance by %', 'chance'],
  ['addToWinChance', 'Add to win chance', 'chance'],
  ['subtractFromWinChance', 'Subtract from win chance', 'chance'],
  ['setWinChance', 'Set win chance', 'chance'],
  ['resetWinChance', 'Reset win chance', 'chance'],
  ['switchOverUnder', 'Switch over / under', 'dice'],
  ['stop', 'Stop autobet', 'any'],
];
export const NO_VALUE = new Set(['resetBet', 'resetWinChance', 'switchOverUnder', 'stop']);

export const PRESETS = [
  {
    id: 'martingale',
    name: 'Martingale',
    builtin: true,
    blocks: [
      { type: 'bet', trigger: 'every', n: 1, event: 'losses', action: 'increaseBetPct', value: 100 },
      { type: 'bet', trigger: 'every', n: 1, event: 'wins', action: 'resetBet' },
    ],
  },
  {
    id: 'delayed-martingale',
    name: 'Delayed Martingale',
    builtin: true,
    blocks: [
      { type: 'bet', trigger: 'streakGreaterThan', n: 2, event: 'losses', action: 'increaseBetPct', value: 100 },
      { type: 'bet', trigger: 'every', n: 1, event: 'wins', action: 'resetBet' },
    ],
  },
  {
    id: 'paroli',
    name: 'Paroli',
    builtin: true,
    blocks: [
      { type: 'bet', trigger: 'every', n: 1, event: 'wins', action: 'increaseBetPct', value: 100 },
      { type: 'bet', trigger: 'everyStreakOf', n: 3, event: 'wins', action: 'resetBet' },
      { type: 'bet', trigger: 'every', n: 1, event: 'losses', action: 'resetBet' },
    ],
  },
  {
    id: 'dalembert',
    name: "D'Alembert",
    builtin: true,
    blocks: [
      { type: 'bet', trigger: 'every', n: 1, event: 'losses', action: 'addToBet', value: 'base' },
      { type: 'bet', trigger: 'every', n: 1, event: 'wins', action: 'subtractFromBet', value: 'base', min: 'base' },
    ],
  },
];

const r8 = (n) => Math.round(n * 1e8) / 1e8;

// base: { amount, chance } at the start. Returns a runner whose record()
// takes each settled bet ({ profit }) and returns the next bet settings.
export function createRunner(strategy, base) {
  const c = { totalBets: 0, wins: 0, losses: 0, winStreak: 0, lossStreak: 0, sessionProfit: 0 };
  let amount = base.amount;
  let chance = base.chance ?? null;
  let switchCount = 0;
  const fired = new Set(); // firstStreakOf blocks already used in the current streak

  const value = (v) => (v === 'base' ? base.amount : Number(v) || 0);

  function matches(b, outcome) {
    const { n } = b;
    if (b.event !== 'bets' && b.event !== outcome) return false;
    const count = b.event === 'bets' ? c.totalBets : b.event === 'wins' ? c.wins : c.losses;
    const streak = b.event === 'bets' ? c.totalBets : b.event === 'wins' ? c.winStreak : c.lossStreak;
    switch (b.trigger) {
      case 'every':
        return count > 0 && count % n === 0;
      case 'everyStreakOf':
        return streak > 0 && streak % n === 0;
      case 'firstStreakOf':
        return streak === n;
      case 'streakGreaterThan':
        return streak > n;
      case 'streakLowerThan':
        return streak > 0 && streak < n;
      default:
        return false;
    }
  }

  function profitMatches(b) {
    const a = Number(b.amount) || 0;
    const p = c.sessionProfit;
    return b.cmp === 'gt' ? p > a : b.cmp === 'gte' ? p >= a : b.cmp === 'lt' ? p < a : p <= a;
  }

  function apply(b) {
    const v = value(b.value);
    switch (b.action) {
      case 'increaseBetPct':
        amount *= 1 + v / 100;
        break;
      case 'decreaseBetPct':
        amount *= 1 - v / 100;
        break;
      case 'addToBet':
        amount += v;
        break;
      case 'subtractFromBet':
        amount -= v;
        if (b.min === 'base') amount = Math.max(amount, base.amount);
        break;
      case 'setBet':
        amount = v;
        break;
      case 'resetBet':
        amount = base.amount;
        break;
      case 'increaseWinChancePct':
        if (chance != null) chance *= 1 + v / 100;
        break;
      case 'decreaseWinChancePct':
        if (chance != null) chance *= 1 - v / 100;
        break;
      case 'addToWinChance':
        if (chance != null) chance += v;
        break;
      case 'subtractFromWinChance':
        if (chance != null) chance -= v;
        break;
      case 'setWinChance':
        if (chance != null) chance = v;
        break;
      case 'resetWinChance':
        if (chance != null) chance = base.chance;
        break;
      case 'switchOverUnder':
        switchCount++;
        break;
      case 'stop':
        return true;
      default:
    }
    return false;
  }

  return {
    counters: c,
    // profit > 0 is a win, < 0 a loss, 0 a push (changes no streak).
    record({ profit }) {
      c.totalBets++;
      c.sessionProfit = r8(c.sessionProfit + profit);
      let outcome = null;
      if (profit > 0) {
        outcome = 'wins';
        c.wins++;
        c.winStreak++;
        c.lossStreak = 0;
      } else if (profit < 0) {
        outcome = 'losses';
        c.losses++;
        c.lossStreak++;
        c.winStreak = 0;
      }
      let stop = false;
      switchCount = 0;
      for (const [i, b] of strategy.blocks.entries()) {
        let hit = false;
        if (b.type === 'profit') hit = profitMatches(b);
        else if (outcome || b.event === 'bets') {
          hit = matches(b, outcome);
          if (hit && b.trigger === 'firstStreakOf') {
            if (fired.has(i)) hit = false;
            else fired.add(i);
          }
        }
        // A firstStreakOf block re-arms once its streak breaks.
        if (b.type === 'bet' && b.trigger === 'firstStreakOf') {
          const streak = b.event === 'bets' ? c.totalBets : b.event === 'wins' ? c.winStreak : c.lossStreak;
          if (streak === 0) fired.delete(i);
        }
        if (hit && apply(b)) stop = true;
      }
      amount = Math.max(0, r8(amount));
      return { amount, chance, switchOverUnder: switchCount % 2 === 1, stop };
    },
  };
}

export const blankBlock = () => ({ type: 'bet', trigger: 'every', n: 1, event: 'losses', action: 'increaseBetPct', value: 100 });
