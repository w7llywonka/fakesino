import { bus, state, setBalance } from './state.js';

let source = null;
let retry = 1000;

// One EventSource per session; reconnects when the user signs in/out so the
// server can attach per-user pushes (balances, deposits, crash cashouts).
export function connectLive() {
  if (source) source.close();
  source = new EventSource('/api/live');
  source.addEventListener('hello', (e) => {
    retry = 1000;
    const data = JSON.parse(e.data);
    state.serverOffset = data.serverTime - Date.now();
    bus.emit('live:hello', data);
    if (data.crash) bus.emit('live:crash', data.crash);
  });
  source.addEventListener('bet', (e) => bus.emit('live:bet', JSON.parse(e.data)));
  source.addEventListener('crash', (e) => {
    const data = JSON.parse(e.data);
    state.serverOffset = data.serverTime - Date.now();
    bus.emit('live:crash', data);
  });
  source.addEventListener('crash:bet', (e) => bus.emit('live:crash:bet', JSON.parse(e.data)));
  source.addEventListener('crash:cashout', (e) => bus.emit('live:crash:cashout', JSON.parse(e.data)));
  source.addEventListener('crash:cancel', (e) => bus.emit('live:crash:cancel', JSON.parse(e.data)));
  source.addEventListener('chat', (e) => bus.emit('live:chat', JSON.parse(e.data)));
  source.addEventListener('tx', (e) => bus.emit('live:tx', JSON.parse(e.data)));
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
