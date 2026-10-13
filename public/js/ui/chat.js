import { el, esc } from '../dom.js';
import { icon, coin } from '../icons.js';
import { api } from '../api.js';
import { state, bus } from '../state.js';
import * as fmt from '../format.js';
import { bySlug } from '../games/registry.js';
import { toastError } from './toast.js';

export function createChat(slot, onClose) {
  const panel = el(`<aside class="chat-panel">
    <div class="chat-head">${icon('chat', 18)} Chat <span class="online"><span class="dot-live"></span> Live</span>
      <button class="icon-btn" data-act="close" aria-label="Close chat">${icon('close', 18)}</button></div>
    <div class="chat-messages"><div class="spinner"></div></div>
    <form class="chat-form"><input class="input" maxlength="200" placeholder="Type your message">
      <button class="btn btn-primary" type="submit">Send</button></form>
  </aside>`);
  slot.appendChild(panel);
  const list = panel.querySelector('.chat-messages');
  const form = panel.querySelector('form');
  const input = form.querySelector('input');

  const betCard = (b) =>
    `<a class="chat-bet ${b.payout > b.amount ? 'win' : ''}" href="?modal=bet&id=${b.id}">${icon(b.game, 16)}<span>${esc(bySlug[b.game]?.name || b.game)}</span>
      <b>${fmt.multiplier(b.multiplier)}</b><span class="amt">${esc(fmt.money(b.payout, b.currency))} ${coin(b.currency, 13)}</span></a>`;
  const render = (m) =>
    el(`<div class="chat-msg"><span class="vip-tag">${esc(m.vip)}</span><span class="who">${esc(m.username)}:</span><span>${esc(m.text)}</span>
      <span class="dim" style="font-size:11px;margin-left:6px">${fmt.time(m.at)}</span>${m.bet ? betCard(m.bet) : ''}</div>`);
  const append = (m) => {
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    list.appendChild(render(m));
    while (list.children.length > 120) list.firstElementChild.remove();
    if (atBottom) list.scrollTop = list.scrollHeight;
  };

  api
    .get('/api/chat')
    .then(({ messages }) => {
      list.innerHTML = '';
      if (!messages.length) list.innerHTML = '<div class="empty">No messages yet. Say hi!</div>';
      messages.forEach(append);
      list.scrollTop = list.scrollHeight;
    })
    .catch(() => (list.innerHTML = '<div class="empty">Chat unavailable</div>'));

  const off = bus.on('live:chat', (m) => {
    list.querySelector('.empty')?.remove();
    append(m);
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try {
      await api.post('/api/chat', { text });
    } catch (err) {
      input.value = text;
      toastError(err);
    }
  });
  panel.querySelector('[data-act=close]').addEventListener('click', onClose);
  return {
    destroy() {
      off();
      panel.remove();
    },
  };
}
