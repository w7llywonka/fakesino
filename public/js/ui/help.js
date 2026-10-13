import { el, esc, on } from '../dom.js';
import { setQuery, navigate } from '../router.js';
import { DEMO_CARDS } from '../shared/cards.js';
import { openModal } from './modal.js';
import { helpFaq } from '../i18n.js';
import { setGuide, guideOn } from './onboarding.js';

// Help Center: searchable answers about how this play-money site works.
const FAQ = [
  ['Getting started', 'Is any of this real money?', 'No. Every balance is play money with no cash value. Deposits use demo cards or simulated transfers, and withdrawals never leave the site.'],
  ['Getting started', 'Do I need an account?', 'No sign-up. Your browser gets its own wallet automatically and keeps it on this device. Back up your wallet key in <a class="link" href="/settings/general#backup">Settings → General</a> to use it elsewhere.'],
  ['Wallet', 'How do I deposit?', 'Open <a class="link" href="?modal=wallet&tab=deposit">Wallet → Deposit</a>. Pick a currency, then a demo card, Demo Pay, a simulated bank transfer, or a crypto network with its (fake) address and the “Send test transaction” button.'],
  ['Wallet', 'Which card numbers work?', `Only demo cards. For example ${Object.keys(DEMO_CARDS).slice(0, 3).map((n) => `<code>${n.replace(/(\d{4})(?=\d)/g, '$1 ')}</code>`).join(', ')}. Use any future expiry and any CVC. Real card numbers are rejected.`],
  ['Wallet', 'How do crypto deposits confirm?', 'A simulated transfer shows as pending and confirms block by block, like the real network would (Bitcoin 2, Ethereum 6 confirmations, and so on). XRP needs the destination tag shown under the address.'],
  ['Wallet', 'How do withdrawals work?', 'Enter a correctly formatted address (or a saved card for fiat). The play money leaves your balance and the withdrawal completes after a few seconds. Nothing is sent anywhere.'],
  ['Wallet', 'What is the vault?', 'A separate balance you can’t bet from. Move play money in and out from <a class="link" href="?modal=wallet&tab=vault">Wallet → Vault</a>. With two-factor on, vault withdrawals need a code.'],
  ['Wallet', 'Can I swap one coin for another?', '<a class="link" href="?modal=wallet&tab=swap">Wallet → Swap</a> converts between cryptos at the reference rate with a 0.5% fee. The new coin arrives after its network confirmations.'],
  ['Wallet', 'Can I see amounts in my own currency?', 'Turn on “Display crypto in fiat” in <a class="link" href="?modal=wallet-settings">Wallet settings</a> and choose from 20 currencies. Bets are still placed in the crypto.'],
  ['Games', 'How do I know results are fair?', 'Every result comes from your client seed, our pre-committed server seed and a nonce. Rotate your seeds to reveal the server seed and recheck any bet. See <a class="link" href="/provably-fair">Provably Fair</a>.'],
  ['Sports', 'How does the sportsbook work?', 'Leagues and teams are fictional and every match is simulated — 90 minutes of soccer plays out in about ten. Add odds to the bet slip, choose Single or Multi, set a stake and place your bet. Live matches update every few seconds.'],
  ['Sports', 'Can I check a match was fair?', 'Each match is decided by a secret seed whose SHA-256 is shown before kick-off. At full time the seed is revealed and “Verify result” recomputes the score in your browser.'],
  ['Sports', 'What is cash out?', 'Settle an open bet early for its current value (based on the live odds, minus a 5% margin) from <a class="link" href="/sports/my-bets">My Bets</a>.'],
  ['Games', 'What is Trenball?', 'Side bets on a Crash round: Red wins if it busts below 2× (pays 1.96×), Green at 2× or more (pays 2×), Moon at 10× or more (pays 10×).'],
  ['Games', 'Are there keyboard shortcuts?', 'Yes. Turn on hotkeys from the keyboard icon under a game: Space bets, S doubles, A halves, D zeroes the amount, plus game-specific keys.'],
  ['Games', 'What are the bet limits?', 'Each currency has a maximum bet and a maximum profit per bet. The Max button picks the largest stake allowed at the current multiplier.'],
  ['Rewards', 'Do bonuses have wagering requirements?', 'The welcome bonus must be wagered 3× and chat bonus drops 1× before you can withdraw or tip. Progress shows in the Withdraw tab. VIP bonuses, rakeback, race prizes and affiliate commission have no wagering.'],
  ['Rewards', 'How does the VIP Club work?', 'Your rank rises with the amount you wager. Higher ranks unlock rakeback, daily, weekly and monthly bonuses and level-up rewards. See <a class="link" href="/vip">VIP Club</a>.'],
  ['Rewards', 'What is the Daily Race?', 'The top 10 by wager in each UTC day share $2,000 of play money, paid automatically when the day ends. Track it on the <a class="link" href="/leaderboard">Leaderboard</a>.'],
  ['Rewards', 'How does the affiliate program work?', 'Create a campaign in <a class="link" href="/affiliate/campaigns">Affiliate</a> and share its link. New players who join through it earn you house edge × wagered ÷ 2 × 10%, claimable in any currency.'],
  ['Account', 'How do I turn on two-factor?', 'In <a class="link" href="/settings/security">Settings → Security</a>, scan the QR code with an authenticator app and enter a code. Withdrawals, vault withdrawals, tips and rain will then ask for one.'],
  ['Account', 'How do I hide my name?', 'Ghost mode, “Hide all your statistics” and “Hide all your race statistics” are in <a class="link" href="/settings/preferences">Settings → Preferences</a>.'],
  ['Responsible gaming', 'Can I limit myself?', 'Set a daily deposit limit or take a break in <a class="link" href="/settings/limits">Settings → Responsible Gaming</a>. Even with play money, it’s good practice.'],
];

const CARDS = Object.keys(DEMO_CARDS)
  .slice(0, 3)
  .map((n) => `<code>${n.replace(/(\d{4})(?=\d)/g, '$1 ')}</code>`)
  .join(', ');
// Translated entries (same order as FAQ) when a language pack is loaded.
const entries = () => {
  const t = helpFaq();
  return t && t.length === FAQ.length ? t.map(([c, q, a]) => [c, q, a.replace('{cards}', CARDS)]) : FAQ;
};

export function openHelpModal({ q = '' } = {}) {
  const all = entries();
  const cats = [...new Set(all.map(([c]) => c))];
  const view = el(`<div class="help">
    <input class="input" type="search" placeholder="Search help articles" aria-label="Search help articles">
    <div class="help-chips" role="tablist"><button class="active" data-cat="">All topics</button>${cats.map((c) => `<button data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div class="help-list"></div>
    <div class="help-foot">
      <span class="help-keys hide-mobile"><span>Shortcuts:</span> <span class="kbd">/</span> <span>search games</span> · <span class="kbd">?</span> <span>this Help Center</span></span>
      ${guideOn() ? '' : '<button class="link" data-act="guide">Show the getting-started guide</button>'}
    </div>
    <div class="muted" style="font-size:12px;margin-top:10px"><span>Fakesino has no human support team — it’s a play-money demo.</span> <button class="link" data-act="chat">Ask in Live Chat</button></div></div>`);
  const list = view.querySelector('.help-list');
  const input = view.querySelector('input');
  let cat = '';
  const render = () => {
    const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hits = all.filter(([c, qn, a]) => (!cat || c === cat) && words.every((w) => `${c} ${qn} ${a}`.toLowerCase().includes(w)));
    let lastCat = null;
    list.innerHTML = hits.length
      ? hits
          .map(([c, qn, a]) => {
            const head = c !== lastCat && !cat ? `<div class="help-cat">${esc(c)}</div>` : '';
            lastCat = c;
            return `${head}<details class="help-item" ${(words.length && hits.length <= 3) || hits.length === 1 ? 'open' : ''}><summary>${esc(qn)}</summary><div class="help-a">${a}</div></details>`;
          })
          .join('')
      : `<div class="empty"><div class="empty-title">No articles match</div><div>Try different words, or ask in Live Chat.</div></div>`;
  };
  input.value = q;
  render();
  input.addEventListener('input', render);
  on(view, 'click', '[data-cat]', (e, b) => {
    cat = b.dataset.cat;
    view.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('active', x === b));
    render();
  });
  const modal = openModal({ title: 'Help Center', iconName: 'help', body: view, onClose: () => setQuery({ modal: null, q: null }, { replace: true }) });
  on(view, 'click', 'a.link', () => modal.close());
  view.querySelector('[data-act=guide]')?.addEventListener('click', () => {
    setGuide(true);
    modal.close();
    navigate('/casino');
  });
  view.querySelector('[data-act=chat]').addEventListener('click', () => {
    modal.close();
    document.querySelector('[data-act=chat]')?.click();
  });
  return modal;
}
