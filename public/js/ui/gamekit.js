import { el, esc } from '../dom.js';
import { coin } from '../icons.js';
import { api } from '../api.js';
import { state, bus, currency, balanceOf, setBalance, isAuthed } from '../state.js';
import * as fmt from '../format.js';
import { sound } from '../sound.js';
import { toast, toastError } from './toast.js';
import { createBetPanel } from './controls.js';
import { setQuery } from '../router.js';

// Session stats shared by the live-stats panel.
export const session = { wagered: {}, profit: {}, wins: 0, losses: 0, points: [0], currencyProfit: 0 };
bus.on('bet:mine', (bet) => {
  session.wagered[bet.currency] = (session.wagered[bet.currency] || 0) + bet.amount;
  session.profit[bet.currency] = (session.profit[bet.currency] || 0) + (bet.payout - bet.amount);
  if (bet.payout > bet.amount) session.wins++;
  else session.losses++;
  const usd = fmt.usdOf(bet.payout - bet.amount, bet.currency);
  session.points.push(session.points[session.points.length - 1] + usd);
  if (session.points.length > 500) session.points.shift();
});

// Build the context object handed to every game module.
export function createGameContext({ slug, controls, stage, footer }) {
  const cleanups = [];
  const ctx = {
    slug,
    controls,
    stage,
    footer,
    api,
    bus,
    state,
    fmt,
    sound,
    toast,
    toastError,
    currency,
    balance: () => balanceOf(),
    animations: () => state.prefs.animations !== false,
    isAuthed,
    requireAuth() {
      if (isAuthed()) return true;
      // The wallet session is (re)connecting; app.js listens for this.
      window.dispatchEvent(new CustomEvent('auth-required'));
      return false;
    },
    createBetPanel(opts) {
      const p = createBetPanel(controls, opts);
      cleanups.push(() => p.destroy());
      return p;
    },
    // Show the balance as it stands right after the stake was taken, before
    // the result animation finishes.
    debitView(res) {
      if (!res?.balance) return;
      const payout = res.bet?.payout ?? 0;
      setBalance(res.balance.currency, Math.max(0, res.balance.amount - payout), { reason: 'debit' });
    },
    // Apply the final balance and publish the finished bet.
    settle(res) {
      if (res?.balance) setBalance(res.balance.currency, res.balance.amount, { reason: res.bet && res.bet.payout > res.bet.amount ? 'win' : 'settle' });
      if (res?.bet) bus.emit('bet:mine', res.bet);
    },
    setBalance(b) {
      if (b) setBalance(b.currency, b.amount);
    },
    reportBet(bet) {
      bus.emit('bet:mine', bet);
    },
    on(event, fn) {
      const off = bus.on(event, fn);
      cleanups.push(off);
      return off;
    },
    onDestroy(fn) {
      cleanups.push(fn);
    },
    destroy() {
      while (cleanups.length) {
        try {
          cleanups.pop()();
        } catch (err) {
          console.error(err);
        }
      }
    },
    resultPop,
    historyStrip,
    showBet(id) {
      setQuery({ modal: 'bet', id });
    },
  };
  return ctx;
}

// Centered win card: multiplier + payout.
export function resultPop(container, { multiplier, payout, currency: code, duration = 1600, lose = false }) {
  container.querySelector('.result-pop')?.remove();
  const node = el(`<div class="result-pop" style="${lose ? 'border-color:var(--red)' : ''}">
    <div class="m" style="${lose ? 'color:var(--red)' : ''}">${fmt.multiplier(multiplier)}</div>
    <div class="a">${esc(fmt.money(payout, code))} ${coin(code)}</div></div>`);
  container.appendChild(node);
  if (duration) setTimeout(() => node.remove(), duration);
  return node;
}

// Recent results strip (top-right of a stage). Click a chip to open the bet.
export function historyStrip(container, { max = 8 } = {}) {
  const strip = el('<div class="history-strip"></div>');
  container.appendChild(strip);
  return {
    el: strip,
    push({ label, win, betId }) {
      const chip = el(`<button class="chip ${win ? 'win' : 'lose'}">${esc(label)}</button>`);
      if (betId) chip.addEventListener('click', () => setQuery({ modal: 'bet', id: betId }));
      strip.appendChild(chip);
      while (strip.children.length > max) strip.firstElementChild.remove();
    },
    clear() {
      strip.innerHTML = '';
    },
  };
}

export { toastError };
