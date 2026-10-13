import { el, on } from '../dom.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { state, bus } from '../state.js';
import { challengeCard, tickCountdowns } from '../ui/challenges.js';

const TABS = [
  ['active', 'Active'],
  ['finished', 'Finished'],
  ['mine', 'My Completed'],
];
const EMPTY = { active: 'There are no active challenges right now.', finished: 'There are no completed challenges', mine: "You haven't completed any challenges" };

export default function challengesPage(page) {
  document.title = 'Challenges — Fakesino';
  let tab = 'active';
  const root = el(`<div>
    <div class="page-title">${icon('trophy', 22)} Challenges</div>
    <p class="muted" style="margin-top:-6px">Be the first to hit the target multiplier with at least the minimum bet and the play-money prize is yours. New challenges every Monday.</p>
    <div class="tabs" data-role="tabs">${TABS.map(([k, l]) => `<button class="tab ${k === tab ? 'active' : ''}" data-t="${k}">${l}</button>`).join('')}</div>
    <div class="ch-grid"></div>
  </div>`);
  page.appendChild(root);
  const grid = root.querySelector('.ch-grid');
  async function load() {
    grid.innerHTML = '<div class="spinner"></div>';
    try {
      const { challenges } = await api.get(`/api/challenges?status=${tab}`);
      grid.innerHTML = challenges.length ? challenges.map(challengeCard).join('') : `<div class="empty">${icon('trophy', 28)}<div>${EMPTY[tab]}</div></div>`;
    } catch (err) {
      grid.innerHTML = `<div class="empty">${err.message}</div>`;
    }
  }
  on(root, 'click', '[data-t]', (e, b) => {
    tab = b.dataset.t;
    root.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('active', x === b));
    load();
  });
  load();
  const stop = tickCountdowns(grid);
  const off = bus.on('live:challenges:finished', () => load());
  const offUser = bus.on('user', () => tab === 'mine' && state.user && load());
  return () => {
    stop();
    off();
    offUser();
  };
}
