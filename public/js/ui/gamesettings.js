import { el, on } from '../dom.js';
import { icon } from '../icons.js';
import { state, savePrefs } from '../state.js';
import { setQuery } from '../router.js';

// Per-game prefs live in maps keyed by slug.
export const isInstant = (slug) => !!state.prefs.instant?.[slug];
export const isMaxBet = (slug) => !!state.prefs.maxBet?.[slug];
const setFor = (key, slug, value) => savePrefs({ [key]: { ...(state.prefs[key] || {}), [slug]: value } });

// Cog popover in the game footer.
export function openGameSettings(anchor, slug, { onInfo } = {}) {
  document.querySelector('.gs-pop')?.remove();
  const vol = Math.round((state.prefs.volume ?? 0.5) * 100);
  const pop = el(`<div class="gs-pop" role="dialog" aria-label="Game settings">
    <div class="gs-vol"><button class="icon-btn" data-act="mute" aria-label="Mute">${icon(state.prefs.sound ? 'volume' : 'volumeOff', 18)}</button>
      <input type="range" min="0" max="100" value="${state.prefs.sound ? vol : 0}" aria-label="Volume"><span class="gs-vol-n">${state.prefs.sound ? vol : 0}</span></div>
    <label class="gs-row"><span>${icon('bolt', 16)} Instant Bet</span><input type="checkbox" class="toggle" data-k="instant" ${isInstant(slug) ? 'checked' : ''}></label>
    <label class="gs-row"><span>${icon('sparkle', 16)} Animations</span><input type="checkbox" class="toggle" data-k="animations" ${state.prefs.animations !== false ? 'checked' : ''}></label>
    <label class="gs-row"><span>${icon('arrowUp', 16)} Max Bet</span><input type="checkbox" class="toggle" data-k="maxBet" ${isMaxBet(slug) ? 'checked' : ''}></label>
    <button class="gs-row gs-link" data-act="hotkeys"><span>${icon('keyboard', 16)} Hotkeys</span>${icon('right', 16)}</button>
    <button class="gs-row gs-link" data-act="info"><span>${icon('info', 16)} Game Info</span>${icon('right', 16)}</button>
  </div>`);
  anchor.parentElement.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const host = anchor.parentElement.getBoundingClientRect();
  pop.style.left = `${Math.max(8, r.left - host.left + r.width / 2 - 130)}px`;

  const range = pop.querySelector('input[type=range]');
  const muteBtn = pop.querySelector('[data-act=mute]');
  range.addEventListener('input', () => {
    const v = Number(range.value);
    pop.querySelector('.gs-vol-n').textContent = v;
    savePrefs({ volume: v / 100, sound: v > 0 });
    muteBtn.innerHTML = icon(v > 0 ? 'volume' : 'volumeOff', 18);
  });
  muteBtn.addEventListener('click', () => {
    const on = !state.prefs.sound;
    savePrefs({ sound: on, volume: on && !(state.prefs.volume > 0) ? 0.5 : state.prefs.volume });
    range.value = on ? Math.round(state.prefs.volume * 100) : 0;
    pop.querySelector('.gs-vol-n').textContent = range.value;
    muteBtn.innerHTML = icon(on ? 'volume' : 'volumeOff', 18);
  });
  on(pop, 'change', '[data-k]', (e, t) => {
    const k = t.dataset.k;
    if (k === 'animations') savePrefs({ animations: t.checked });
    else setFor(k, slug, t.checked);
  });
  on(pop, 'click', '[data-act=hotkeys]', () => {
    close();
    setQuery({ modal: 'hotkeys' });
  });
  on(pop, 'click', '[data-act=info]', () => {
    close();
    onInfo?.();
  });
  const outside = (e) => {
    if (!pop.contains(e.target) && !anchor.contains(e.target)) close();
  };
  const esc = (e) => e.key === 'Escape' && close();
  setTimeout(() => document.addEventListener('mousedown', outside));
  document.addEventListener('keydown', esc);
  function close() {
    pop.remove();
    document.removeEventListener('mousedown', outside);
    document.removeEventListener('keydown', esc);
  }
  return { close };
}
