import { el, esc, on } from '../dom.js';
import { icon } from '../icons.js';
import { state, bus } from '../state.js';

// "Get started" checklist on the lobby. Steps that the wallet can't tell us
// about (opening the verifier, backing up the key) are remembered here.
const KEY = 'fakesino:onboarding';
const DAY = 24 * 3600 * 1000;

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}
function save(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: the checklist just won't remember */
  }
}

export function markStep(id) {
  const s = load();
  if (s[id]) return;
  s[id] = Date.now();
  save(s);
  bus.emit('onboarding');
}

bus.on('bet:mine', () => markStep('bet'));

const funded = (u) => [u.balances, u.vault].some((b) => Object.values(b || {}).some((v) => v > 0));

function steps(u, s) {
  const bet = u.stats.bets > 0 || !!s.bet;
  const welcomeOpen = !u.welcomeCode && Date.now() - u.createdAt < DAY;
  return [
    { id: 'fund', ic: 'wallet', title: 'Add play money', text: 'Deposit with a demo card. Nothing is ever charged.', href: '?modal=wallet&tab=deposit', done: funded(u) || bet },
    (welcomeOpen || u.welcomeCode) && { id: 'welcome', ic: 'gift', title: 'Claim the welcome bonus', text: 'Redeem the code WELCOME for $20 within 24 hours.', href: '/settings/offers', done: !!u.welcomeCode },
    { id: 'bet', ic: 'dice', title: 'Place your first bet', text: 'Dice is the quickest game to learn.', href: '/casino/games/dice', done: bet },
    { id: 'fair', ic: 'shield', title: 'Check a result is fair', text: 'The verifier recomputes any bet in your browser.', href: '?modal=fairness&tab=verify', done: !!s.fair },
    { id: 'backup', ic: 'lock', title: 'Back up your wallet', text: 'Save your wallet key to play on another device.', href: '/settings/general#backup', done: !!s.backup },
  ].filter(Boolean);
}

function ring(done, total) {
  const r = 17;
  const c = 2 * Math.PI * r;
  return `<svg class="ob-ring" width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
    <circle cx="22" cy="22" r="${r}" fill="none" stroke="var(--surface-4)" stroke-width="5"/>
    <circle cx="22" cy="22" r="${r}" fill="none" stroke="var(--accent)" stroke-width="5" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - done / total)).toFixed(1)}" transform="rotate(-90 22 22)"/>
    <text x="22" y="22" text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="800" fill="currentColor">${done}/${total}</text></svg>`;
}

// Mounts the checklist into `slot`; returns a cleanup function.
export function mountOnboarding(slot) {
  const render = () => {
    const u = state.user;
    const s = load();
    if (!u || s.hidden) {
      slot.innerHTML = '';
      return;
    }
    const list = steps(u, s);
    const done = list.filter((x) => x.done).length;
    const all = done === list.length;
    const next = list.find((x) => !x.done);
    const expanded = slot.querySelector('.onboard')?.classList.contains('expanded');
    slot.innerHTML = '';
    slot.appendChild(
      el(`<section class="onboard ${all ? 'complete' : ''} ${expanded ? 'expanded' : ''}" aria-label="Get started">
        <div class="ob-head">${ring(done, list.length)}
          <div class="ob-titles"><div class="ob-title">${all ? 'You’re all set' : 'Get started'}</div>
            <div class="ob-sub">${all ? 'You know your way around. Have fun — it’s all play money.' : 'A few quick steps to find your way around.'}</div></div>
          <button class="icon-btn ob-hide" data-act="ob-hide" data-tip="Hide" aria-label="Hide">${icon('close', 16)}</button></div>
        <div class="ob-steps">${list
          .map(
            (x) => `<a class="ob-step ${x.done ? 'done' : ''} ${x === next ? 'next' : ''}" href="${x.href}">
            <span class="ob-ic">${icon(x.done ? 'check' : x.ic, 16)}</span>
            <span class="ob-txt"><span class="ob-t">${esc(x.title)}</span><span class="ob-d">${esc(x.text)}</span></span>
            ${x.done ? '' : `<span class="ob-go">${icon('right', 16)}</span>`}</a>`,
          )
          .join('')}</div>
        ${list.length - done > 1 ? `<button class="ob-more link" data-act="ob-more" type="button"><span>All steps</span> (${list.length - done})</button>` : ''}</section>`),
    );
  };
  render();
  const offs = [bus.on('onboarding', render), bus.on('user', render), bus.on('balance', (e) => e?.reason !== 'debit' && render())];
  const offMore = on(slot, 'click', '[data-act=ob-more]', () => slot.querySelector('.onboard')?.classList.add('expanded'));
  const offClick = on(slot, 'click', '[data-act=ob-hide]', () => {
    const s = load();
    s.hidden = Date.now();
    save(s);
    slot.querySelector('.onboard')?.classList.add('leaving');
    setTimeout(render, 180);
  });
  return () => {
    offs.forEach((off) => off());
    offClick();
    offMore();
  };
}

export const guideOn = () => !load().hidden;
export function setGuide(show) {
  const s = load();
  if (show) delete s.hidden;
  else s.hidden = Date.now();
  save(s);
  bus.emit('onboarding');
}

// First-visit how-to on game pages.
const TIPS_KEY = 'fakesino:tips';
function loadTips() {
  try {
    return JSON.parse(localStorage.getItem(TIPS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}
function saveTips(t) {
  try {
    localStorage.setItem(TIPS_KEY, JSON.stringify(t));
  } catch {
    /* storage blocked: the tip shows again next time */
  }
}
export const gameTipsOn = () => !loadTips().off;
export const showGameTip = (slug) => {
  const t = loadTips();
  return !t.off && !(t.seen || []).includes(slug);
};
export function dismissGameTip(slug) {
  const t = loadTips();
  t.seen = [...new Set([...(t.seen || []), slug])];
  saveTips(t);
}
// Turning tips back on shows them again for every game.
export const setGameTips = (show) => saveTips(show ? {} : { ...loadTips(), off: true });
