import { el, esc } from '../dom.js';
import { state, savePrefs } from '../state.js';
import { bySlug } from '../games/registry.js';
import { setQuery } from '../router.js';
import { openModal } from './modal.js';

const GLOBAL = [
  ['Space', 'Bet · start or stop autobet · cash out in step games'],
  ['S', 'Double bet amount'],
  ['A', 'Halve bet amount'],
  ['D', 'Zero bet amount'],
];

// ?modal=hotkeys — the keys for every game plus the current game's own.
export function openHotkeysModal(slug = null) {
  const meta = slug ? bySlug[slug] : null;
  const row = ([k, label]) => `<tr><td><span class="kbd">${esc(k)}</span></td><td>${esc(label)}</td></tr>`;
  const body = el(`<div class="hk">
    <table class="table hk-table"><thead><tr><th>Key</th><th>Action</th></tr></thead><tbody>
      ${GLOBAL.map(row).join('')}
      ${meta?.hotkeys?.length ? `<tr class="hk-sep"><td colspan="2">${esc(meta.name)}</td></tr>${meta.hotkeys.map(row).join('')}` : ''}
    </tbody></table>
    <label class="setting-row" style="margin-top:14px"><div><div class="t">Hotkeys enabled</div><div class="d">When hotkeys are enabled they stay on for all games until disabled.</div></div><input type="checkbox" class="toggle" ${state.prefs.hotkeys ? 'checked' : ''}></label>
  </div>`);
  body.querySelector('.toggle').addEventListener('change', (e) => savePrefs({ hotkeys: e.target.checked }));
  return openModal({ title: 'Hotkeys', iconName: 'keyboard', body, onClose: () => setQuery({ modal: null }, { replace: true }) });
}
