// Crash is a shared multiplayer round (server/crash.js); this module only
// carries its catalogue entry. The crash formula lives in ../fair.js.
export const META = {
  slug: 'crash',
  name: 'Crash',
  category: 'originals',
  order: 10,
  kind: 'multiplayer',
  edge: 0.01,
  rtp: 99,
  desc: 'Ride the multiplier as it climbs and cash out before it crashes. Every round is shared by all players and generated from a pre-committed hash chain.',
  howTo: ['Place a bet during the countdown (or queue one for the next round).', 'Set an auto cash-out, or press Cash Out while the multiplier climbs.', 'If the round crashes before you cash out, the bet is lost.'],
  hotkeys: [['W', 'Auto cash-out −'], ['E', 'Auto cash-out +']],
};
