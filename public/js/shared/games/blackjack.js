import { fail, cardFromFloat } from './util.js';

// Infinite-deck blackjack.
// - Blackjack pays 3:2, insurance pays 2:1
// - Dealer stands on all 17s and peeks for blackjack
// - Double on any first two cards (also after a split, except split aces)
// - One split per round; split aces receive one card each
// Cards are dealt player, dealer, player, dealer (hole card), then in order of play.

export const stateful = true;

export function cardPoints(card) {
  if (card.rank === 'A') return 11;
  if (['K', 'Q', 'J'].includes(card.rank)) return 10;
  return Number(card.rank);
}

export function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardPoints(c);
    if (c.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 && total <= 21 };
}

export function isBlackjack(cards) {
  return cards.length === 2 && handValue(cards).total === 21;
}

const tenValue = (card) => cardPoints(card) === 10;

export function normalize() {
  return {};
}

function draw(rng) {
  const c = cardFromFloat(rng.next());
  return { rank: c.rank, suit: c.suit };
}

export function start(rng) {
  const p1 = draw(rng);
  const d1 = draw(rng);
  const p2 = draw(rng);
  const d2 = draw(rng);
  const state = {
    hands: [{ cards: [p1, p2], units: 1, done: false, doubled: false, splitAces: false, result: null }],
    active: 0,
    dealer: [d1, d2],
    split: false,
    insurance: null, // null | 'offered' | 'taken' | 'declined'
    wager: 1,
    payout: 0,
    done: false,
  };
  if (d1.rank === 'A') {
    state.insurance = 'offered';
    return state;
  }
  afterPeekCheck(state);
  return state;
}

// Dealer peeks when showing an Ace (after insurance) or a ten-value card.
function afterPeekCheck(state) {
  const up = state.dealer[0];
  const dealerBj = isBlackjack(state.dealer);
  const playerBj = isBlackjack(state.hands[0].cards);
  if ((up.rank === 'A' || tenValue(up)) && dealerBj) {
    state.hands[0].done = true;
    return settle(state);
  }
  if (playerBj) {
    state.hands[0].done = true;
    return settle(state);
  }
  return state;
}

export function actions(state) {
  if (state.done) return [];
  if (state.insurance === 'offered') return ['insurance', 'noInsurance'];
  const hand = state.hands[state.active];
  const list = ['hit', 'stand'];
  if (hand.cards.length === 2 && !hand.splitAces) list.push('double');
  if (!state.split && state.hands.length === 1 && hand.cards.length === 2 && cardPoints(hand.cards[0]) === cardPoints(hand.cards[1])) {
    list.push('split');
  }
  return list;
}

export function cost(state, action) {
  if (action === 'double') return state.hands[state.active].units;
  if (action === 'split') return 1;
  if (action === 'insurance') return 0.5;
  return 0;
}

function advance(state, rng) {
  while (state.active < state.hands.length && state.hands[state.active].done) state.active++;
  if (state.active >= state.hands.length) {
    state.active = state.hands.length - 1;
    playDealer(state, rng);
    settle(state);
  } else {
    const hand = state.hands[state.active];
    if (hand.cards.length === 1) {
      hand.cards.push(draw(rng));
      if (hand.splitAces || handValue(hand.cards).total === 21) {
        hand.done = true;
        advance(state, rng);
      }
    }
  }
}

function playDealer(state, rng) {
  const live = state.hands.some((h) => handValue(h.cards).total <= 21);
  if (!live) return;
  while (handValue(state.dealer).total < 17) state.dealer.push(draw(rng));
}

function settle(state) {
  const dealer = handValue(state.dealer);
  const dealerBj = isBlackjack(state.dealer);
  let payout = 0;
  for (const hand of state.hands) {
    const v = handValue(hand.cards).total;
    const bj = !state.split && isBlackjack(hand.cards);
    let mult;
    if (v > 21) mult = 0;
    else if (bj && !dealerBj) mult = 2.5;
    else if (dealerBj) mult = bj ? 1 : 0;
    else if (dealer.total > 21 || v > dealer.total) mult = 2;
    else if (v === dealer.total) mult = 1;
    else mult = 0;
    hand.result = mult === 0 ? 'lose' : mult === 1 ? 'push' : bj && mult === 2.5 ? 'blackjack' : 'win';
    payout += mult * hand.units;
  }
  if (state.insurance === 'taken' && dealerBj) payout += 1.5; // 0.5 stake at 2:1 plus the stake
  state.payout = payout;
  state.done = true;
  return state;
}

export function act(state, action, data, rng) {
  if (!actions(state).includes(action)) fail('That move is not available');
  if (action === 'insurance' || action === 'noInsurance') {
    state.insurance = action === 'insurance' ? 'taken' : 'declined';
    if (action === 'insurance') state.wager += 0.5;
    afterPeekCheck(state);
    return state;
  }
  const hand = state.hands[state.active];
  switch (action) {
    case 'hit': {
      hand.cards.push(draw(rng));
      const v = handValue(hand.cards).total;
      if (v >= 21) hand.done = true;
      break;
    }
    case 'stand':
      hand.done = true;
      break;
    case 'double':
      state.wager += hand.units;
      hand.units *= 2;
      hand.doubled = true;
      hand.cards.push(draw(rng));
      hand.done = true;
      break;
    case 'split': {
      state.wager += 1;
      state.split = true;
      const aces = hand.cards[0].rank === 'A';
      const second = { cards: [hand.cards[1]], units: 1, done: false, doubled: false, splitAces: aces, result: null };
      hand.cards = [hand.cards[0], draw(rng)];
      hand.splitAces = aces;
      state.hands.push(second);
      if (aces || handValue(hand.cards).total === 21) hand.done = true;
      break;
    }
    default:
      fail('Unknown action');
  }
  if (hand.done) advance(state, rng);
  return state;
}

export function view(state) {
  const hideHole = !state.done;
  const dealerCards = hideHole ? [state.dealer[0], { hidden: true }] : state.dealer;
  return {
    hands: state.hands.map((h) => ({ ...h, value: handValue(h.cards) })),
    active: state.active,
    dealer: { cards: dealerCards, value: hideHole ? handValue([state.dealer[0]]) : handValue(state.dealer) },
    insurance: state.insurance,
    done: state.done,
    wager: state.wager,
    payout: state.payout,
    actions: actions(state),
  };
}
