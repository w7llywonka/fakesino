import { el, esc, on } from '../dom.js';
import { icon, coin } from '../icons.js';
import { api } from '../api.js';
import { state, bus, savePrefs } from '../state.js';
import * as fmt from '../format.js';
import { bySlug } from '../games/registry.js';
import { toast, toastError } from './toast.js';
import { ignored, setIgnored, openTip, openProfile, openRain, openChatRules } from './social.js';

const ROOMS = { en: 'English', es: 'Español', pt: 'Português', tr: 'Türkçe', de: 'Deutsch', fr: 'Français' };

const COMMANDS = [
  ['/tip', '<user> <amount>', 'Send a play-money tip'],
  ['/rain', '<amount> <users>', 'Share play money with recent chatters'],
  ['/bet', '<id>', 'Share a bet'],
  ['/user', '<name>', 'View a player profile'],
  ['/drop', '<code>', 'Redeem a bonus drop code'],
  ['/ignore', '<user>', 'Hide messages from a player'],
  ['/unignore', '<user>', 'Show their messages again'],
  ['/rules', '', 'Read the chat rules'],
];

// A compact emoji set, by category, with names for search.
const EMOJI = {
  'Smileys & People': '😀 grin,😂 joy,🤣 rofl,😊 blush,😍 heart eyes,😎 cool,🤩 star struck,😏 smirk,😅 sweat smile,😭 sob,😡 angry,🤯 mind blown,🥳 party,😴 sleep,🤔 think,🙄 eye roll,😬 grimace,🤑 money mouth,😇 angel,🤡 clown,👀 eyes,🙏 pray,👏 clap,👍 thumbs up,👎 thumbs down,💪 muscle,🤝 handshake,👋 wave,✌️ peace,🤞 fingers crossed',
  'Animals & Nature': '🐶 dog,🐱 cat,🦁 lion,🐯 tiger,🐻 bear,🐼 panda,🐸 frog,🐔 chicken,🐧 penguin,🐘 elephant,🦏 rhino,🐊 crocodile,🐆 cheetah,🦄 unicorn,🐍 snake,🌵 cactus,🍀 clover,🌈 rainbow,🔥 fire,⭐ star,🌙 moon,☀️ sun',
  'Food & Drink': '🍕 pizza,🍔 burger,🍟 fries,🌮 taco,🍣 sushi,🍩 donut,🍪 cookie,🎂 cake,🍿 popcorn,☕ coffee,🍺 beer,🍷 wine,🥂 cheers,🧃 juice',
  Activities: '🎰 slots,🎲 dice,🃏 joker,♠️ spade,♥️ heart suit,♦️ diamond suit,♣️ club,🎯 bullseye,🏆 trophy,🥇 gold medal,🎮 game,🎉 tada,🎊 confetti,🎁 gift',
  Objects: '💰 money bag,💸 money wings,💵 dollar,💎 gem,🪙 coin,📈 chart up,📉 chart down,🚀 rocket,💣 bomb,🔒 lock,🔑 key,💡 idea,⏰ alarm,🎈 balloon',
  Symbols: '❤️ heart,💔 broken heart,💯 hundred,✅ check,❌ cross,⚠️ warning,❓ question,❗ exclamation,💤 zzz,♻️ recycle,🆗 ok,🔝 top',
};
const EMOJI_LIST = Object.entries(EMOJI).flatMap(([cat, s]) => s.split(',').map((x) => ({ cat, ch: x.split(' ')[0], name: x.split(' ').slice(1).join(' ') })));
const FREQ_KEY = 'fakesino:emoji';

export function createChat(slot, onClose) {
  let room = ROOMS[state.prefs.chatRoom] ? state.prefs.chatRoom : 'en';
  let unseen = 0;
  const chatters = new Map(); // recent names for @ autocomplete

  const panel = el(`<aside class="chat-panel">
    <div class="chat-head">${icon('chat', 18)}
      <select class="chat-room" aria-label="Chat room">${Object.entries(ROOMS).map(([k, l]) => `<option value="${k}" ${k === room ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <span class="online"><span class="dot-live"></span> Live</span>
      <button class="icon-btn" data-act="rules" aria-label="Chat rules" data-tip="Chat rules">${icon('info', 16)}</button>
      <button class="icon-btn" data-act="close" aria-label="Close chat">${icon('close', 18)}</button></div>
    <div class="chat-messages"><div class="spinner"></div></div>
    <button class="chat-paused" hidden>Chat paused due to scroll</button>
    <div class="chat-pop" hidden></div>
    <form class="chat-form"><button type="button" class="icon-btn chat-emoji-btn" aria-label="Emoji">${icon('sparkle', 18)}</button><input class="input" maxlength="200" placeholder="Type your message" autocomplete="off">
      <button class="btn btn-primary" type="submit">Send</button></form>
  </aside>`);
  slot.appendChild(panel);
  const list = panel.querySelector('.chat-messages');
  const form = panel.querySelector('form');
  const input = form.querySelector('input');
  const pausedPill = panel.querySelector('.chat-paused');
  const pop = panel.querySelector('.chat-pop');

  const me = () => state.user?.username?.toLowerCase();
  const isIgnored = (name) => ignored().some((n) => n.toLowerCase() === String(name || '').toLowerCase());

  // Escape, then highlight @mentions.
  const formatText = (text) => esc(text).replace(/@([A-Za-z0-9_]{3,14})/g, (m, n) => `<span class="mention ${n.toLowerCase() === me() ? 'me' : ''}">@${n}</span>`);
  const betCard = (b) =>
    `<a class="chat-bet ${b.payout > b.amount ? 'win' : ''}" href="?modal=bet&id=${b.id}">${icon(b.game, 16)}<span>${esc(bySlug[b.game]?.name || b.game)}</span>
      <b>${fmt.multiplier(b.multiplier)}</b><span class="amt">${esc(fmt.money(b.payout, b.currency))} ${coin(b.currency, 13)}</span></a>`;

  function render(m) {
    if (m.type === 'system') {
      const who = m.recipients?.length ? `<div class="chat-rec">${m.recipients.map(esc).join(', ')}</div>` : '';
      const ic = m.kind === 'rain' || m.kind === 'tip' ? 'coins' : m.kind === 'drop' ? 'gift' : 'info';
      return el(`<div class="chat-msg system ${m.kind || ''}">${icon(ic, 15)}<div><span>${esc(m.text)}</span>${m.code ? ` <button class="chat-code" data-code="${esc(m.code)}">${esc(m.code)}</button>` : ''}${who}</div></div>`);
    }
    const mentioned = (m.mentions || []).some((n) => n.toLowerCase() === me());
    return el(`<div class="chat-msg ${mentioned ? 'mentioned' : ''}">${m.vip && m.vip !== 'None' ? `<span class="vip-tag">${esc(m.vip)}</span>` : ''}<button class="who" data-user="${esc(m.username)}">${esc(m.username)}</button><span class="colon">:</span> <span class="txt">${formatText(m.text)}</span>
      <span class="dim" style="font-size:11px;margin-left:6px">${fmt.time(m.at)}</span>${m.bet ? betCard(m.bet) : ''}</div>`);
  }

  const atBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  function append(m) {
    if (m.room && m.room !== room) return;
    if (m.type !== 'system' && isIgnored(m.username)) return;
    if (m.username && m.type !== 'system') chatters.set(m.username.toLowerCase(), m.username);
    const stick = atBottom();
    list.querySelector('.empty')?.remove();
    list.appendChild(render(m));
    while (list.children.length > 150) list.firstElementChild.remove();
    if (stick) list.scrollTop = list.scrollHeight;
    else {
      unseen++;
      pausedPill.hidden = false;
      pausedPill.textContent = `Chat paused due to scroll · ${unseen} new`;
    }
  }

  function load() {
    list.innerHTML = '<div class="spinner"></div>';
    api
      .get(`/api/chat?room=${room}`)
      .then(({ messages }) => {
        list.innerHTML = '';
        const shown = messages.filter((m) => m.type === 'system' || !isIgnored(m.username));
        if (!shown.length) list.innerHTML = '<div class="empty">No messages yet. Say hi!</div>';
        shown.forEach(append);
        list.scrollTop = list.scrollHeight;
        pausedPill.hidden = true;
        unseen = 0;
      })
      .catch(() => (list.innerHTML = '<div class="empty">Chat unavailable</div>'));
  }
  load();

  list.addEventListener('scroll', () => {
    if (atBottom()) {
      pausedPill.hidden = true;
      unseen = 0;
    }
  });
  pausedPill.addEventListener('click', () => {
    list.scrollTop = list.scrollHeight;
    pausedPill.hidden = true;
    unseen = 0;
  });
  panel.querySelector('.chat-room').addEventListener('change', (e) => {
    room = e.target.value;
    savePrefs({ chatRoom: room });
    load();
  });

  const off = bus.on('live:chat', (m) => append(m));

  // ---- popover (user menu, emoji, autocomplete) ----
  function showPop(html, onPick) {
    pop.innerHTML = html;
    pop.hidden = false;
    pop.onclick = (e) => {
      const b = e.target.closest('[data-m], [data-pick]');
      if (!b) return;
      hidePop();
      onPick(b.dataset.m ?? b.dataset.pick);
    };
  }
  function hidePop() {
    pop.hidden = true;
    pop.innerHTML = '';
  }
  const outside = (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('.chat-emoji-btn, [data-user]')) hidePop();
  };
  document.addEventListener('click', outside);

  on(list, 'click', '[data-user]', (e, b) => {
    const name = b.dataset.user;
    const mine = name.toLowerCase() === me();
    showPop(
      `<div class="chat-menu"><div class="chat-menu-head">${esc(name)}</div>
        <button data-m="profile">${icon('user', 15)} View profile</button>
        ${mine ? '' : `<button data-m="tip">${icon('coins', 15)} Tip</button><button data-m="mention">${icon('chat', 15)} Mention</button><button data-m="ignore">${icon('eyeOff', 15)} ${isIgnored(name) ? 'Unignore' : 'Ignore'}</button>`}</div>`,
      (m) => {
        if (m === 'profile') openProfile(name);
        else if (m === 'tip') openTip(name);
        else if (m === 'mention') {
          input.value = `${input.value ? `${input.value.trim()} ` : ''}@${name} `;
          input.focus();
        } else if (m === 'ignore') {
          const now = !isIgnored(name);
          setIgnored(name, now);
          toast({ title: now ? `${name} ignored` : `${name} unignored` });
          load();
        }
      },
    );
  });
  on(list, 'click', '[data-code]', (e, b) => redeem(b.dataset.code));

  // ---- emoji picker ----
  function emojiPicker(q = '') {
    let freq = [];
    try {
      freq = JSON.parse(localStorage.getItem(FREQ_KEY) || '[]');
    } catch {
      /* ignore */
    }
    const hits = q ? EMOJI_LIST.filter((e) => e.name.includes(q.toLowerCase())) : null;
    const grid = (items) => `<div class="emoji-grid">${items.map((e) => `<button type="button" data-pick="${e.ch}" title="${esc(e.name)}">${e.ch}</button>`).join('')}</div>`;
    const body = hits
      ? hits.length
        ? grid(hits)
        : '<div class="empty" style="padding:14px">No emoji found</div>'
      : `${freq.length ? `<div class="emoji-cat">Frequently Used</div>${grid(freq.map((ch) => EMOJI_LIST.find((e) => e.ch === ch) || { ch, name: '' }))}` : ''}${Object.keys(EMOJI)
          .map((cat) => `<div class="emoji-cat">${esc(cat)}</div>${grid(EMOJI_LIST.filter((e) => e.cat === cat))}`)
          .join('')}`;
    return `<div class="emoji-pick"><input class="input emoji-search" placeholder="Search emoji" value="${esc(q)}"><div class="emoji-body">${body}</div></div>`;
  }
  function pickEmoji(ch) {
    insert(ch);
    try {
      const freq = JSON.parse(localStorage.getItem(FREQ_KEY) || '[]').filter((x) => x !== ch);
      localStorage.setItem(FREQ_KEY, JSON.stringify([ch, ...freq].slice(0, 16)));
    } catch {
      /* ignore */
    }
  }
  function openEmoji() {
    showPop(emojiPicker(), pickEmoji);
    const search = pop.querySelector('.emoji-search');
    search.addEventListener('input', () => {
      const html = emojiPicker(search.value);
      pop.querySelector('.emoji-body').innerHTML = el(html).querySelector('.emoji-body').innerHTML;
    });
    search.focus();
  }
  panel.querySelector('.chat-emoji-btn').addEventListener('click', () => {
    if (!pop.hidden && pop.querySelector('.emoji-pick')) return hidePop();
    openEmoji();
  });
  function insert(text) {
    const at = input.selectionStart ?? input.value.length;
    input.value = input.value.slice(0, at) + text + input.value.slice(input.selectionEnd ?? at);
    input.focus();
    input.setSelectionRange(at + text.length, at + text.length);
  }

  // ---- autocomplete: /commands and @mentions ----
  input.addEventListener('input', () => {
    const v = input.value;
    if (/^\/\S*$/.test(v)) {
      const items = COMMANDS.filter(([c]) => c.startsWith(v.toLowerCase()));
      if (!items.length) return hidePop();
      return showPop(
        `<div class="chat-ac">${items.map(([c, args, d]) => `<button type="button" data-pick="${c} "><span><b>${c}</b> <span class="dim">${esc(args)}</span></span><span class="muted">${esc(d)}</span></button>`).join('')}</div>`,
        (c) => {
          input.value = c;
          input.focus();
        },
      );
    }
    const m = v.slice(0, input.selectionStart).match(/@([A-Za-z0-9_]*)$/);
    if (m) {
      const q = m[1].toLowerCase();
      const names = [...chatters.values()].filter((n) => n.toLowerCase().startsWith(q) && n.toLowerCase() !== me()).slice(0, 6);
      if (!names.length) return hidePop();
      return showPop(`<div class="chat-ac">${names.map((n) => `<button type="button" data-pick="${esc(n)}">@${esc(n)}</button>`).join('')}</div>`, (n) => {
        const pos = input.selectionStart;
        input.value = input.value.slice(0, pos).replace(/@([A-Za-z0-9_]*)$/, `@${n} `) + input.value.slice(pos);
        input.focus();
      });
    }
    if (!pop.hidden && !pop.querySelector('.emoji-pick')) hidePop();
  });

  async function redeem(code) {
    if (!code) return toast({ type: 'error', title: 'Usage: /drop <code>' });
    const { openRedeem } = await import('./offers.js');
    return openRedeem(code);
  }

  async function command(text) {
    const [cmd, ...args] = text.trim().split(/\s+/);
    const name = (args[0] || '').replace(/^@/, '');
    switch (cmd.toLowerCase()) {
      case '/tip':
        return openTip(name, args[1] ? Number(args[1]) : null);
      case '/rain':
        return openRain({ amount: args[0], users: args[1] });
      case '/bet': {
        const id = name.replace('#', '');
        if (!id) return toast({ type: 'error', title: 'Usage: /bet <id>' });
        return api.post('/api/chat', { text: `Bet #${id}`, betId: id, room });
      }
      case '/user':
        return name ? openProfile(name) : toast({ type: 'error', title: 'Usage: /user <name>' });
      case '/drop':
        return redeem(args[0]);
      case '/ignore':
      case '/unignore':
        if (!name) return toast({ type: 'error', title: `Usage: ${cmd} <user>` });
        setIgnored(name, cmd === '/ignore');
        toast({ title: `${name} ${cmd === '/ignore' ? 'ignored' : 'unignored'}` });
        return load();
      case '/rules':
        return openChatRules();
      default:
        return toast({ type: 'error', title: 'Unknown command', message: 'Type / to see the commands.' });
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    hidePop();
    input.value = '';
    try {
      if (text.startsWith('/')) await command(text);
      else await api.post('/api/chat', { text, room });
    } catch (err) {
      input.value = text;
      toastError(err);
    }
  });
  panel.querySelector('[data-act=rules]').addEventListener('click', openChatRules);
  panel.querySelector('[data-act=close]').addEventListener('click', onClose);
  return {
    destroy() {
      off();
      document.removeEventListener('click', outside);
      panel.remove();
    },
  };
}
