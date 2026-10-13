import { esc } from '../dom.js';
import { icon } from '../icons.js';

// Short explanations shown by the (?) next to bet settings and wallet fields.
// Keyed by the field's English label (anything in brackets is ignored, so
// "Total Profit (2.50×)" finds "Total Profit").
export const HELP = {
  'Bet Amount': 'How much play money each bet stakes. ½ and 2× halve or double it.',
  'Profit on Win': 'What a winning bet adds to your balance on top of your stake.',
  'Total Profit': 'What you would collect on top of your stake if you cashed out now.',
  Multiplier: 'A win pays your bet × this multiplier. Higher multipliers have a lower win chance.',
  'Win Chance': 'How likely this bet is to win. A higher chance pays a lower multiplier.',
  'Roll Over': 'Where the roll (0.00–100.00) has to land for you to win. Click the box to switch between over and under.',
  'Target Multiplier': 'You win if the result reaches this multiplier. A higher target pays more but hits less often.',
  'Cashout At': 'Your bet cashes out automatically at this multiplier. You can still press Cash Out earlier.',
  Mines: 'How many of the 25 tiles hide a mine. More mines make each gem worth more.',
  Gems: 'Safe tiles on the board: 25 minus the mines.',
  Risk: 'Higher risk spreads the payouts: bigger top multipliers, but more small ones.',
  Rows: 'More rows add pegs and widen the range of multipliers.',
  Segments: 'More segments make the top multipliers bigger but rarer.',
  Difficulty: 'Harder levels pay bigger multipliers but win less often.',
  'Chip Value': 'The value of each chip you place on the table.',
  'Total Bet': 'Everything currently on the table.',
  'Number of Bets': 'How many bets Auto places. 0 keeps going until you stop it.',
  'On Win': 'After a win, go back to your starting bet or raise the bet by this percentage.',
  'On Loss': 'After a loss, go back to your starting bet or raise the bet by this percentage.',
  'Stop on Profit': 'Auto stops once this run is up by this much. 0 means no limit.',
  'Stop on Loss': 'Auto stops once this run is down by this much. 0 means no limit.',
  Strategy: 'A betting system that changes your bet after each result. Pick one or build your own.',
  Cards: 'How many cards to deal. Every card must be different for the bet to win.',
  Network: 'The blockchain the coin moves on. Deposit and withdraw on the same network — on a real site, the wrong one loses the funds.',
  'Destination tag': 'XRP addresses are shared, so the tag tells the site which wallet a transfer belongs to. Always include it.',
  'Client Seed': 'Your own random input. It mixes with the server seed to make each result, and you can change it any time.',
  'Server Seed (Hashed)': 'The SHA-256 hash of our secret seed, shown before you bet. The seed itself is revealed when you rotate the pair.',
  'Server Seed': 'The secret seed, revealed once you rotate the pair. Hash it to check it matches the hash you were shown.',
  'Next Server Seed (Hashed)': 'The seed that takes over when you rotate, committed in advance so it can’t be swapped.',
  Nonce: 'Counts your bets with this seed pair, so every bet gets a fresh result.',
};

export const helpFor = (label) => HELP[String(label || '').replace(/\s*\(.*\)\s*$/, '').trim()] || '';

// A small (?) button; hover, focus or tap shows the explanation.
export function helpTip(labelOrText, { text = helpFor(labelOrText) } = {}) {
  return text ? `<button type="button" class="help-tip" data-tip="${esc(text)}" aria-label="${esc(text)}">${icon('help', 14)}</button>` : '';
}
