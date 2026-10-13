import { el, esc, on } from '../dom.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { state } from '../state.js';
import * as fmt from '../format.js';

export function notFound(page) {
  document.title = 'Not found — Fakesino';
  page.innerHTML = `<div class="not-found"><h1>404</h1><p class="muted">This page doesn't exist — unlike your play-money balance.</p><a class="btn btn-primary" href="/casino">Back to the casino</a></div>`;
}

export function promotionsPage(page) {
  document.title = 'Promotions — Fakesino';
  const promos = [
    ['p1', 'Daily Reload', 'Claim free play money once every 24 hours from the VIP Club. The amount grows with your VIP level.', '/vip', 'Claim now'],
    ['p2', 'Rakeback', '5% of the house edge on every bet you place comes back to you. Claim it whenever you like.', '/vip', 'View rakeback'],
    ['p3', 'Daily Race', 'Wager the most in 24 hours to climb the leaderboard. Prizes are bragging rights — it is all play money after all.', '/leaderboard', 'See the race'],
  ];
  page.innerHTML = `<div class="page-title">${icon('gift', 22)} Promotions</div>
    <div class="hero" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">${promos
      .map(([c, t, d, href, cta]) => `<div class="promo ${c}" style="display:flex"><span class="tag">Ongoing</span><div><h2>${t}</h2><p style="max-width:100%">${d}</p></div><a class="btn btn-secondary" href="${href}">${cta}</a></div>`)
      .join('')}</div>`;
}

export async function leaderboardPage(page) {
  document.title = 'Leaderboard — Fakesino';
  let period = 'day';
  const root = el(`<div><div class="page-title">${icon('trophy', 22)} Leaderboard</div>
    <div class="tabs" style="margin-bottom:16px"><button class="tab active" data-p="day">24 hours</button><button class="tab" data-p="week">7 days</button><button class="tab" data-p="all">All time</button></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Rank</th><th>Player</th><th class="r">Bets</th><th class="r">Wagered</th></tr></thead><tbody></tbody></table></div></div>`);
  page.appendChild(root);
  const tbody = root.querySelector('tbody');
  const load = async () => {
    tbody.innerHTML = '<tr><td colspan="4"><div class="spinner"></div></td></tr>';
    const { leaders } = await api.get(`/api/leaderboard?period=${period}`);
    tbody.innerHTML = leaders.length
      ? leaders
          .map(
            (l, i) => `<tr><td>${i < 3 ? icon('trophy', 16, `style="color:${['#f5b83d', '#b8c4d1', '#c47a3a'][i]}"`) : ''} ${i + 1}</td>
        <td>${l.username ? esc(l.username) : `<span class="user-hidden">${icon('eyeOff', 14)} Hidden</span>`}</td><td class="r">${l.bets.toLocaleString()}</td><td class="r">${fmt.fiat(l.wageredUsd)}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="4"><div class="empty">No bets in this period yet.</div></td></tr>';
  };
  on(root, 'click', '[data-p]', (e, b) => {
    period = b.dataset.p;
    root.querySelectorAll('[data-p]').forEach((x) => x.classList.toggle('active', x === b));
    load();
  });
  load();
}

export function responsiblePage(page) {
  document.title = 'Responsible Gaming — Fakesino';
  page.innerHTML = `<div class="page-title">${icon('support', 22)} Responsible Gaming</div><div class="card doc">
    <p>Fakesino is a <b>play-money simulation</b>. Balances have no cash value, deposits use demo cards that are never charged, and nothing can be withdrawn to the real world.</p>
    <p>That said, casino games are designed so the house wins over time — every game here shows its RTP, and the long-run result of playing is always a loss. Real-money gambling works the same way, with real consequences.</p>
    <p>You can set a daily deposit limit or take a break from <a class="link" href="/settings/limits">Settings → Responsible Gaming</a>.</p>
    <h2>If gambling stops being fun</h2>
    <ul><li>Set limits on time and money before you start, and stick to them.</li><li>Never chase losses.</li><li>Don't gamble when you are upset, stressed or have been drinking.</li><li>Take regular breaks.</li></ul>
    <p>If you or someone you know has a gambling problem, free and confidential help is available: <b>1-800-GAMBLER</b> (US), <b>GamCare 0808 8020 133</b> (UK), or <b>Gambling Help Online</b> (AU).</p></div>`;
}

export function termsPage(page) {
  document.title = 'Terms — Fakesino';
  page.innerHTML = `<div class="page-title">${icon('list', 22)} Terms of Service</div><div class="card doc">
    <h2>1. Play money only</h2><p>All balances, deposits, withdrawals, bonuses and winnings on Fakesino are fictional. They have no monetary value, cannot be exchanged, sold or transferred, and are never paid out.</p>
    <h2>2. No real payments</h2><p>The checkout only accepts published demo card numbers. Real card numbers are rejected in your browser and by the server, and no card data is stored beyond the last four digits of demo cards you choose to save. Crypto deposit addresses are fake and exist on no blockchain — never send real funds to them.</p>
    <h2>3. Eligibility</h2><p>You must be 18 or older to use Fakesino.</p>
    <h2>4. Fairness</h2><p>Game outcomes are generated with a provably fair scheme. You can verify any bet in the Fairness panel.</p>
    <h2>5. Conduct</h2><p>Be kind in chat. Messages may be removed and accounts closed at our discretion.</p></div>`;
}
