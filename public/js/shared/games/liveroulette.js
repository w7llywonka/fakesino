import { bytesToFloat } from '../fair.js';
import { BETS, colorOf, normalize as normalizeChips, payoutFor as betPays } from './roulette.js';

// Live Roulette: a shared table (server/plugins/liveroulette.js). Everyone
// bets on the same spin, which comes from a pre-committed hash chain.
export const META = {
  slug: 'liveroulette',
  name: 'Live Roulette',
  category: 'live',
  order: 300,
  kind: 'multiplayer',
  edge: 0.027,
  rtp: 97.3,
  desc: 'A shared European roulette table: every player bets on the same spin. Place chips during the countdown; the wheel spins for everyone at once.',
  howTo: ['Pick a chip value and place chips on the table during the countdown.', 'Press Bet — bets placed while the wheel spins join the next round.', 'Winning bets pay 36 ÷ (numbers covered) × the stake, as on the solo table.'],
  icon: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/><circle cx="19" cy="5" r="2.2" fill="currentColor"/>',
  thumb: {
    bg: ['#c92a2a', '#5f0f40'],
    glyph:
      '<g transform="translate(150 180)"><circle r="96" fill="#2b2f36"/><circle r="84" fill="none" stroke="#f1c40f" stroke-width="6"/>' +
      Array.from({ length: 18 }, (_, i) => `<path d="M0 0L${(80 * Math.sin((i * 20 * Math.PI) / 180)).toFixed(1)} ${(-80 * Math.cos((i * 20 * Math.PI) / 180)).toFixed(1)}A80 80 0 0 1 ${(80 * Math.sin(((i + 1) * 20 * Math.PI) / 180)).toFixed(1)} ${(-80 * Math.cos(((i + 1) * 20 * Math.PI) / 180)).toFixed(1)}Z" fill="${i === 0 ? '#2b8a3e' : i % 2 ? '#c92a2a' : '#212529'}"/>`).join('') +
      '<circle r="38" fill="#8d6e3a"/><circle r="10" fill="#f1c40f"/><circle cx="48" cy="-48" r="9" fill="#fff"/></g>' +
      '<g transform="translate(150 300)"><rect x="-38" y="-14" width="76" height="28" rx="14" fill="#e03131"/><circle cx="-20" cy="0" r="5" fill="#fff"/><text x="6" y="6" text-anchor="middle" font-size="16" font-weight="900" fill="#fff">LIVE</text></g>',
  },
};

export const RULES_VERSION = 1;
export const chipGame = true;
export const hexToBytes = (hex) => Uint8Array.from(hex.match(/../g).map((b) => parseInt(b, 16)));

// pocket = floor(float × 37), float from the first 4 bytes of HMAC_SHA256(gameHash, salt).
export function resultFromHex(hmacHex) {
  const number = Math.floor(bytesToFloat(hexToBytes(hmacHex), 0) * 37);
  return { number, color: colorOf(number) };
}

export function normalize(params = {}) {
  return normalizeChips(params);
}

export function payout(chips, number) {
  let total = 0;
  for (const [key, amount] of Object.entries(chips)) if (BETS[key].numbers.includes(number)) total += amount * betPays(key);
  return total;
}

export function winningKeys(chips, number) {
  return Object.keys(chips).filter((k) => BETS[k].numbers.includes(number));
}

export const maxMultiplier = () => 36;
