// Catalogue of every game: lobby metadata + lazy loader for its UI module.

export const GAMES = [
  { slug: 'crash', name: 'Crash', category: 'originals', rtp: 99, desc: 'Ride the multiplier as it climbs and cash out before it crashes. Every round is shared by all players and generated from a pre-committed hash chain.' },
  { slug: 'plinko', name: 'Plinko', category: 'originals', rtp: 99, desc: 'Drop a ball through 8–16 rows of pegs. Each peg sends it left or right and the bucket it lands in sets your multiplier — up to 1,000× on high risk.' },
  { slug: 'mines', name: 'Mines', category: 'originals', rtp: 99, desc: 'Uncover gems on a 5×5 grid while avoiding the mines. Every safe tile raises your multiplier; cash out whenever you like.' },
  { slug: 'dice', name: 'Dice', category: 'originals', rtp: 99, desc: 'Pick a target and roll over or under it. Slide to trade win chance for multiplier, from 1.0102× to 9,900×.' },
  { slug: 'limbo', name: 'Limbo', category: 'originals', rtp: 99, desc: 'Set a target multiplier and see if the result reaches it. Simple, fast and up to 1,000,000×.' },
  { slug: 'keno', name: 'Keno', category: 'originals', rtp: 99, desc: 'Pick up to 10 numbers from 40. Ten are drawn — the more hits, the bigger the payout across four risk levels.' },
  { slug: 'wheel', name: 'Wheel', category: 'originals', rtp: 99, desc: 'Spin a wheel of 10 to 50 segments. Choose the risk and watch where the pointer lands.' },
  { slug: 'hilo', name: 'Hilo', category: 'originals', rtp: 99, desc: 'Guess whether the next card is higher or lower. Chain correct guesses to multiply your stake, skip cards you don’t like.' },
  { slug: 'tower', name: 'Dragon Tower', category: 'originals', rtp: 98, desc: 'Climb nine floors by picking the tiles that hide eggs. Higher difficulty means fewer eggs and bigger multipliers.' },
  { slug: 'coinflip', name: 'Coinflip', category: 'originals', rtp: 99, desc: 'Heads or tails for 1.98×. The simplest game in the house.' },
  { slug: 'blackjack', name: 'Blackjack', category: 'table', rtp: 99.5, desc: 'Beat the dealer to 21. Blackjack pays 3:2, dealer stands on all 17s, double, split and insurance available.' },
  { slug: 'roulette', name: 'Roulette', category: 'table', rtp: 97.3, desc: 'European single-zero roulette with every inside and outside bet: straights, splits, streets, corners, lines, dozens, columns and even-money bets.' },
  { slug: 'baccarat', name: 'Baccarat', category: 'table', rtp: 98.9, desc: 'Punto banco with standard third-card rules. Back the Player, the Banker or a Tie.' },
  { slug: 'videopoker', name: 'Video Poker', category: 'table', rtp: 99.5, desc: 'Full-pay 9/6 Jacks or Better. Hold the cards you want and draw once to make the best poker hand.' },
  { slug: 'slots', name: 'Neon Fruits', category: 'slots', rtp: 96.3, desc: 'A 5-reel, 20-line video slot with wilds, scatter pays and free spins where every win is tripled.' },
];

export const CATEGORIES = [
  { key: 'originals', name: 'Fakesino Originals', icon: 'fire' },
  { key: 'table', name: 'Table Games', icon: 'blackjack' },
  { key: 'slots', name: 'Slots', icon: 'slots' },
];

export const bySlug = Object.fromEntries(GAMES.map((g) => [g.slug, g]));

export function loadGame(slug) {
  return import(`./${slug}.js`);
}
