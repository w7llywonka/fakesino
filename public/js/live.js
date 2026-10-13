import { bus, state, setBalance } from './state.js';
import { api } from './api.js';
import { bySlug } from './games/registry.js';

let source = null;
let retry = 1000;
let generation = 0;
let lastTicketRetry = 0;

// One EventSource per wallet. EventSource can't send the wallet key header, so
// it authenticates with a short-lived ticket; that lets the server push this
// wallet's balance changes, deposit confirmations and crash cashouts.
export async function connectLive() {
  const gen = ++generation;
  if (source) source.close();
  source = null;
  let ticket = null;
  if (state.user) {
    try {
      ({ ticket } = await api.post('/api/live/ticket'));
    } catch {
      /* fall back to an anonymous feed */
    }
  }
  if (gen !== generation) return; // a newer connection superseded this one
  source = new EventSource(ticket ? `/api/live?ticket=${ticket}` : '/api/live');
  source.addEventListener('hello', (e) => {
    retry = 1000;
    const data = JSON.parse(e.data);
    state.serverOffset = data.serverTime - Date.now();
    bus.emit('live:hello', data);
    if (data.crash) bus.emit('live:crash', data.crash);
    // The server forgot our ticket (e.g. it restarted): get a fresh one.
    if (state.user && !data.authed && Date.now() - lastTicketRetry > 10000) {
      lastTicketRetry = Date.now();
      connectLive();
    }
  });
  source.addEventListener('bet', (e) => {
    const bet = JSON.parse(e.data);
    bus.emit('live:bet', bet);
    // Shared-round games settle on the server, so our own results arrive here.
    if (bet.mine && bySlug[bet.game]?.kind === 'multiplayer') bus.emit('bet:mine', bet);
  });
  source.addEventListener('crash', (e) => {
    const data = JSON.parse(e.data);
    state.serverOffset = data.serverTime - Date.now();
    bus.emit('live:crash', data);
  });
  source.addEventListener('crash:bet', (e) => bus.emit('live:crash:bet', JSON.parse(e.data)));
  source.addEventListener('crash:cashout', (e) => bus.emit('live:crash:cashout', JSON.parse(e.data)));
  source.addEventListener('crash:cancel', (e) => bus.emit('live:crash:cancel', JSON.parse(e.data)));
  source.addEventListener('chat', (e) => bus.emit('live:chat', JSON.parse(e.data)));
  source.addEventListener('game', (e) => {
    const { channel, type, data } = JSON.parse(e.data);
    bus.emit(`live:${channel}`, { type, data });
    bus.emit(`live:${channel}:${type}`, data);
  });
  source.addEventListener('tx', (e) => bus.emit('live:tx', JSON.parse(e.data)));
  source.addEventListener('notification', (e) => bus.emit('live:notification', JSON.parse(e.data)));
  source.addEventListener('balance', (e) => {
    const { currency, amount } = JSON.parse(e.data);
    setBalance(currency, amount, { reason: 'push' });
  });
  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) {
      setTimeout(connectLive, retry);
      retry = Math.min(retry * 2, 15000);
    }
  };
}
