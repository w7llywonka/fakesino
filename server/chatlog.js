// Chat rooms live in store.data.chatRooms; any server feature can post.
export const ROOMS = { en: 'English', es: 'Español', pt: 'Português', tr: 'Türkçe', de: 'Deutsch', fr: 'Français' };
const KEEP = 200;

export function chatRooms(store) {
  const d = store.data;
  if (Array.isArray(d.chat) && !d.chatRooms) d.chatRooms = { en: d.chat };
  d.chatRooms ||= {};
  for (const r of Object.keys(ROOMS)) d.chatRooms[r] ||= [];
  return d.chatRooms;
}

export function postChat(store, live, room, msg) {
  const list = chatRooms(store)[ROOMS[room] ? room : 'en'];
  const full = { id: store.nextId('msg'), room: ROOMS[room] ? room : 'en', at: Date.now(), ...msg };
  list.push(full);
  if (list.length > KEEP) list.splice(0, list.length - KEEP);
  store.save();
  live.broadcast('chat', full);
  return full;
}

export const postSystem = (store, live, room, text, extra = {}) => postChat(store, live, room, { type: 'system', username: 'Fakesino', vip: null, text, ...extra });
