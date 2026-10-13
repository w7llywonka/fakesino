import { fail, cardFromFloat } from './util.js';

// Catalogue entry, read by the server (game discovery) and the lobby (/api/config).
export const META = {
  slug: 'baccarat',
  name: 'Baccarat',
  category: 'table',
  order: 220,
  edge: 0.0106,
  rtp: 98.9,
  desc: 'Punto banco with standard third-card rules. Back the Player, the Banker or a Tie.',
  howTo: [
      'Pick a chip value and place chips on Player, Banker or Tie.',
      'Press Bet to deal.',
      'Banker wins pay 0.95:1, Tie pays 8:1 and returns Player/Banker stakes.',
    ],
};

export const RULES_VERSION = 1;

// Punto banco with standard third-card rules. Banker wins pay 0.95:1, a tie
// pays 8:1 and returns Player/Banker stakes.

export const PAYOUT = { player: 2, banker: 1.95, tie: 9 };
export const chipGame = true;

export function cardValue(card) {
  if (card.rank === 'A') return 1;
  if (['10', 'J', 'Q', 'K'].includes(card.rank)) return 0;
  return Number(card.rank);
}

export function handTotal(cards) {
  return cards.reduce((a, c) => a + cardValue(c), 0) % 10;
}

export function normalize(params = {}) {
  const chips = params.chips || {};
  const out = {};
  for (const key of ['player', 'banker', 'tie']) {
    const v = Number(chips[key] ?? 0);
    if (!Number.isFinite(v) || v < 0) fail('Invalid chip amount');
    if (v > 0) out[key] = v;
  }
  for (const key of Object.keys(chips)) if (!(key in PAYOUT)) fail(`Unknown bet: ${key}`);
  if (!Object.keys(out).length && !params.allowEmpty) fail('Place a chip on Player, Banker or Tie');
  return { chips: out };
}

export function chipTotal(params) {
  return Object.values(params.chips).reduce((a, b) => a + b, 0);
}

export function deal(rng) {
  const draw = () => cardFromFloat(rng.next());
  const player = [draw()];
  const banker = [draw()];
  player.push(draw());
  banker.push(draw());
  let p = handTotal(player);
  let b = handTotal(banker);
  if (p < 8 && b < 8) {
    let playerThird = null;
    if (p <= 5) {
      playerThird = draw();
      player.push(playerThird);
    }
    let bankerDraws;
    if (!playerThird) bankerDraws = b <= 5;
    else {
      const t = cardValue(playerThird);
      if (b <= 2) bankerDraws = true;
      else if (b === 3) bankerDraws = t !== 8;
      else if (b === 4) bankerDraws = t >= 2 && t <= 7;
      else if (b === 5) bankerDraws = t >= 4 && t <= 7;
      else if (b === 6) bankerDraws = t === 6 || t === 7;
      else bankerDraws = false;
    }
    if (bankerDraws) banker.push(draw());
    p = handTotal(player);
    b = handTotal(banker);
  }
  const winner = p > b ? 'player' : b > p ? 'banker' : 'tie';
  return { player, banker, playerTotal: p, bankerTotal: b, winner };
}

export function outcome(rng, params) {
  const hand = deal(rng);
  let payout = 0;
  for (const [key, amount] of Object.entries(params.chips)) {
    if (key === hand.winner) payout += amount * PAYOUT[key];
    else if (hand.winner === 'tie' && key !== 'tie') payout += amount; // push
  }
  return { ...hand, payout };
}
