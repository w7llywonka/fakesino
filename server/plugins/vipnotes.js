import { vipInfo } from '../accounts.js';

// VIP level-up notifications, from the engine's bet hook.
export default function register({ engine, notify }) {
  engine.onBet((bet, user) => {
    const level = vipInfo(user.stats?.wageredUsd || 0).level;
    if (user.vipSeen === undefined) user.vipSeen = level;
    if (level !== user.vipSeen) {
      user.vipSeen = level;
      notify(user.id, { kind: 'vip', category: 'rewards', title: `Welcome to ${level}!`, message: 'You reached a new VIP level. Check the VIP Club for your perks.', link: '/vip' });
    }
  });
}
