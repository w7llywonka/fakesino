import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createArrayRng } from '../public/js/shared/fair.js';
import { RANKS, SUITS } from '../public/js/shared/games/util.js';
import * as blackjack from '../public/js/shared/games/blackjack.js';
import * as baccarat from '../public/js/shared/games/baccarat.js';
import * as videopoker from '../public/js/shared/games/videopoker.js';
import * as hilo from '../public/js/shared/games/hilo.js';
import * as mines from '../public/js/shared/games/mines.js';
import * as slots from '../public/js/shared/games/slots.js';
import * as roulette from '../public/js/shared/games/roulette.js';

// Build a float that maps to a given card: index = rank*4 + suit.
const f = (rank, suit = 'spades') => (RANKS.indexOf(rank) * 4 + SUITS.indexOf(suit) + 0.5) / 52;
const deck = (...ranks) => createArrayRng(ranks.map((r) => f(r)));
const card = (rank, suit = 'spades') => ({ rank, suit });

test('blackjack hand values handle soft aces', () => {
  assert.deepEqual(blackjack.handValue([card('A'), card('6')]), { total: 17, soft: true });
  assert.deepEqual(blackjack.handValue([card('A'), card('6'), card('K')]), { total: 17, soft: false });
  assert.deepEqual(blackjack.handValue([card('A'), card('A'), card('9')]), { total: 21, soft: true });
});

test('blackjack: player natural pays 3:2', () => {
  // player A, dealer 9, player K, dealer 7
  const s = blackjack.start(deck('A', '9', 'K', '7'));
  assert.equal(s.done, true);
  assert.equal(s.payout, 2.5);
});

test('blackjack: dealer stands on all 17s and busts correctly', () => {
  const rng = deck('10', '6', '8', '10', 'K');
  const s = blackjack.start(rng);
  blackjack.act(s, 'stand', {}, rng); // player 18, dealer 16 draws K → 26 bust
  assert.equal(s.done, true);
  assert.equal(s.payout, 2);
  assert.equal(s.hands[0].result, 'win');
  const rng2 = deck('10', 'A', '7', '6', '5');
  const s2 = blackjack.start(rng2); // dealer A-6 soft 17 stands (insurance offered first)
  assert.equal(s2.insurance, 'offered');
  blackjack.act(s2, 'noInsurance', {}, rng2);
  blackjack.act(s2, 'stand', {}, rng2);
  assert.equal(blackjack.handValue(s2.dealer).total, 17);
  assert.equal(s2.payout, 1, 'push on 17 v 17');
});

test('blackjack: double and split adjust the wager', () => {
  const rng = deck('6', '9', '5', '7', '10', '10');
  const s = blackjack.start(rng); // 11 v 9
  assert.ok(blackjack.actions(s).includes('double'));
  assert.equal(blackjack.cost(s, 'double'), 1);
  blackjack.act(s, 'double', {}, rng); // 21; dealer 16 draws 10 → bust
  assert.equal(s.wager, 2);
  assert.equal(s.payout, 4);

  const rng2 = deck('8', '6', '8', '10', '3', '2', '10');
  const s2 = blackjack.start(rng2);
  assert.ok(blackjack.actions(s2).includes('split'));
  blackjack.act(s2, 'split', {}, rng2); // hand1: 8,3 ; hand2: 8 (+2 later)
  assert.equal(s2.hands.length, 2);
  assert.equal(s2.wager, 2);
  blackjack.act(s2, 'stand', {}, rng2); // hand2 gets 2 → 10
  blackjack.act(s2, 'stand', {}, rng2); // dealer 16 draws 10 → bust
  assert.equal(s2.done, true);
  assert.equal(s2.payout, 4);
});

test('blackjack: insurance pays 2:1 when the dealer has blackjack', () => {
  const rng = deck('10', 'A', '9', 'K');
  const s = blackjack.start(rng);
  assert.deepEqual(blackjack.actions(s), ['insurance', 'noInsurance']);
  blackjack.act(s, 'insurance', {}, rng);
  assert.equal(s.done, true);
  assert.equal(s.wager, 1.5);
  assert.equal(s.payout, 1.5, 'main bet lost, insurance returns 1.5');
});

test('baccarat third-card rules', () => {
  // Player 2+3=5 draws; banker 3+4=7 stands.
  let r = baccarat.deal(deck('2', '3', '3', '4', '9'));
  assert.equal(r.player.length, 3);
  assert.equal(r.banker.length, 2);
  // Natural 9 ends the hand.
  r = baccarat.deal(deck('4', '2', '5', '3'));
  assert.equal(r.playerTotal, 9);
  assert.equal(r.player.length, 2);
  assert.equal(r.winner, 'player');
  // Banker 3 does not draw against a player third card of 8.
  r = baccarat.deal(deck('2', 'K', '2', '3', '8'));
  assert.equal(r.player.length, 3);
  assert.equal(r.banker.length, 2);
  // Tie returns player/banker stakes.
  const tie = baccarat.outcome(deck('4', '4', '3', '3'), { chips: { player: 1, banker: 2, tie: 1 } });
  assert.equal(tie.winner, 'tie');
  assert.equal(tie.payout, 1 + 2 + 9);
});

test('video poker hand evaluation', () => {
  const h = (s) => s.split(' ').map((c) => ({ rank: c.slice(0, -1), suit: { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }[c.slice(-1)] }));
  assert.equal(videopoker.evaluate(h('10s Js Qs Ks As')), 'royal_flush');
  assert.equal(videopoker.evaluate(h('5h 6h 7h 8h 9h')), 'straight_flush');
  assert.equal(videopoker.evaluate(h('As 2d 3c 4h 5s')), 'straight');
  assert.equal(videopoker.evaluate(h('Ks Kd Kc 4h 4s')), 'full_house');
  assert.equal(videopoker.evaluate(h('Js Jd 3c 4h 9s')), 'jacks_better');
  assert.equal(videopoker.evaluate(h('10s 10d 3c 4h 9s')), null);
  assert.equal(videopoker.evaluate(h('2s 2d 3c 3h 9s')), 'two_pair');
});

test('hilo ends on a wrong guess and multiplies on right ones', () => {
  const rng = createArrayRng([f('5'), f('9'), f('2')]);
  const s = hilo.start(rng);
  hilo.act(s, 'higher_or_same', {}, rng);
  assert.equal(s.done, false);
  assert.ok(s.multiplier > 1);
  hilo.act(s, 'higher_or_same', {}, rng);
  assert.equal(s.done, true);
  assert.equal(s.payout, 0);
});

test('mines: auto tiles and positions are consistent', () => {
  const rng = createArrayRng(Array.from({ length: 24 }, (_, i) => (i * 0.37) % 1));
  const positions = mines.minePositions(createArrayRng(Array.from({ length: 24 }, (_, i) => (i * 0.37) % 1)), 3);
  const safe = [...Array(25).keys()].filter((t) => !positions.includes(t)).slice(0, 4);
  const s = mines.start(rng, { mines: 3, autoTiles: safe });
  assert.equal(s.done, true);
  assert.equal(s.payout, mines.multiplierFor(3, 4));
});

test('slots: wilds substitute and scatters trigger free spins', () => {
  assert.deepEqual(slots.evaluateLine(['wild', 'seven', 'seven', 'cherry', 'bar']), { symbol: 'seven', count: 3, pay: 30 });
  assert.deepEqual(slots.evaluateLine(['wild', 'wild', 'wild', 'wild', 'lemon']), { symbol: 'wild', count: 4, pay: 250 });
  assert.equal(slots.evaluateLine(['scatter', 'seven', 'seven', 'seven', 'bar']), null);
  const grid = [
    ['scatter', 'lemon', 'plum'],
    ['bell', 'scatter', 'plum'],
    ['bar', 'grape', 'scatter'],
    ['cherry', 'lemon', 'orange'],
    ['seven', 'plum', 'bell'],
  ];
  const e = slots.evaluateGrid(grid);
  assert.equal(e.scatters.length, 3);
  assert.equal(e.scatterWin, 2 * slots.LINES);
});

test('roulette: inside bets cover the right numbers', () => {
  assert.deepEqual(roulette.BETS['corner:1'].numbers, [1, 2, 4, 5]);
  assert.deepEqual(roulette.BETS['street:12'].numbers, [34, 35, 36]);
  assert.deepEqual(roulette.BETS['line:1'].numbers, [1, 2, 3, 4, 5, 6]);
  assert.equal(roulette.BETS['column:1'].numbers.length, 12);
  assert.ok(roulette.BETS['column:3'].numbers.includes(36));
  const r = roulette.outcome(createArrayRng([17.5 / 37]), { chips: { 'straight:17': 1, black: 2, 'split:17-20': 1 } });
  assert.equal(r.number, 17);
  assert.equal(r.payout, 36 + 4 + 18);
});
