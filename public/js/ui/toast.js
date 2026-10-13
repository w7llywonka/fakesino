import { el, esc } from '../dom.js';
import { icon } from '../icons.js';

export function toast({ title = '', message = '', type = 'info', duration = 4000 } = {}) {
  const root = document.getElementById('toast-root');
  const ic = type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info';
  const t = el(`<div class="toast ${type}" style="--toast-d:${duration}ms">
    <span class="t-icon">${icon(ic, 18)}</span>
    <div><div class="t-title">${esc(title)}</div>${message ? `<div class="t-msg">${esc(message)}</div>` : ''}</div>
  </div>`);
  root.appendChild(t);
  const timer = setTimeout(dismiss, duration);
  t.addEventListener('click', dismiss);
  function dismiss() {
    clearTimeout(timer);
    t.classList.add('out');
    setTimeout(() => t.remove(), 200);
  }
  while (root.children.length > 4) root.firstElementChild.remove();
  return dismiss;
}

export const toastError = (err, title = 'Error') => toast({ type: 'error', title, message: err?.message || String(err) });
export const toastSuccess = (title, message = '') => toast({ type: 'success', title, message });
