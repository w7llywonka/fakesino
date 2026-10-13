import { bytesToFloat } from '../fair.js';

// Zoo is a shared multiplayer round (server/plugins/zoo.js); this module holds
// its catalogue entry and the rules shared with the verifier.
export const META = {
  slug: 'zoo',
  name: 'Zoo',
  category: 'originals',
  order: 14,
  kind: 'multiplayer',
  edge: 0.02,
  rtp: 98,
  desc: 'Back your favourite animals, then three spins of a 20-tile ring pick the winners. The rarer the animal and the more times it lands, the bigger the payout — up to 1,000× for three lions.',
  howTo: ['Put chips on any of the six animals during the countdown.', 'Three independent spins each land on one of 20 tiles.', 'Each animal pays by how many of the three spins land on it.'],
  icon: '<circle cx="12" cy="13" r="6"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="7" r="2.5"/><path d="M10 12h.01M14 12h.01M10.5 15.5c1 .8 2 .8 3 0"/>',
  thumb: {
    bg: ['#f59f00', '#2b8a3e'],
    glyph:
      '<g transform="translate(150 185)"><circle r="96" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="22" stroke-dasharray="18 12"/><circle r="62" fill="#ffd43b"/><circle cx="-40" cy="-44" r="22" fill="#e67700"/><circle cx="40" cy="-44" r="22" fill="#e67700"/><circle r="56" fill="#ffc078"/><circle cx="-20" cy="-8" r="7" fill="#212529"/><circle cx="20" cy="-8" r="7" fill="#212529"/><path d="M-12 18q12 12 24 0" stroke="#212529" stroke-width="5" fill="none"/><path d="M-8 6h16l-8 8z" fill="#212529"/></g>',
  },
};

export const RULES_VERSION = 1;

export const ANIMALS = ['lion', 'cheetah', 'elephant', 'crocodile', 'rhino', 'penguin'];
export const NAMES = { lion: 'Lion', cheetah: 'Cheetah', elephant: 'Elephant', crocodile: 'Crocodile', rhino: 'Rhino', penguin: 'Penguin' };

// The 20-tile ring, clockwise from the top.
export const RING = ['lion', 'penguin', 'rhino', 'penguin', 'elephant', 'penguin', 'crocodile', 'penguin', 'rhino', 'penguin', 'cheetah', 'penguin', 'rhino', 'penguin', 'elephant', 'penguin', 'crocodile', 'penguin', 'rhino', 'penguin'];
export const SPINS = 3;

// PAY[animal][c] = multiplier when c of the 3 spins land on that animal.
export const PAY = {
  lion: [0, 3, 63, 1000],
  cheetah: [0, 3, 63, 1000],
  elephant: [0, 2, 10, 224],
  crocodile: [0, 2, 10, 224],
  rhino: [0, 1.5, 3, 14.5],
  penguin: [0, 0.68, 1.2, 2.2],
};

// h = HMAC_SHA256(gameHash, salt) as bytes; spin j uses bytes 4j..4j+3.
export function spinsFromBytes(bytes) {
  return Array.from({ length: SPINS }, (_, j) => Math.floor(bytesToFloat(bytes, 4 * j) * RING.length));
}

export function counts(tiles) {
  const out = Object.fromEntries(ANIMALS.map((a) => [a, 0]));
  for (const t of tiles) out[RING[t]]++;
  return out;
}

// Units returned for a stake map ({ lion: 1, penguin: 2 } → total payout in the same units).
export function payoutFor(stakes, tiles) {
  const c = counts(tiles);
  let total = 0;
  for (const [a, s] of Object.entries(stakes)) total += s * PAY[a][c[a]];
  return total;
}

export const hexToBytes = (hex) => Uint8Array.from(hex.match(/../g).map((b) => parseInt(b, 16)));
