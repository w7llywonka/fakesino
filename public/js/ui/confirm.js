import { el, esc } from '../dom.js';
import { openModal } from './modal.js';

// Small confirmation dialog. Resolves { ok, checked }.
export function confirmDialog({ title = 'Are you sure?', message = '', confirmLabel = 'Continue', cancelLabel = 'Cancel', checkbox = null } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve({ ok, checked: !!body.querySelector('input[type=checkbox]')?.checked });
      if (ok !== null) modal.close();
    };
    const body = el(`<div class="confirm-body"><p style="margin-top:0">${esc(message)}</p>
      ${checkbox ? `<label class="check-row"><input type="checkbox"> ${esc(checkbox)}</label>` : ''}
      <div class="row" style="gap:8px;margin-top:16px"><button class="btn btn-secondary" data-act="cancel" style="flex:1">${esc(cancelLabel)}</button><button class="btn btn-primary" data-act="ok" style="flex:1">${esc(confirmLabel)}</button></div></div>`);
    const modal = openModal({ title, body, onClose: () => finish(null) });
    body.querySelector('[data-act=ok]').addEventListener('click', () => finish(true));
    body.querySelector('[data-act=cancel]').addEventListener('click', () => finish(false));
  }).then((r) => ({ ok: !!r.ok, checked: r.checked }));
}
