import { el, esc } from '../dom.js';
import { icon } from '../icons.js';

let current = null;

// One modal at a time. Returns a handle to update or close it.
export function openModal({ title = '', iconName = null, size = '', body = '', foot = '', onClose = null, dismissable = true } = {}) {
  closeModal({ silent: true, instant: true });
  const root = document.getElementById('modal-root');
  const backdrop = el(`<div class="modal-backdrop" role="dialog" aria-modal="true">
    <div class="modal ${size}">
      <div class="modal-head">${iconName ? icon(iconName, 18) : ''}<span class="modal-title">${esc(title)}</span>
        <button class="icon-btn close" aria-label="Close">${icon('close', 18)}</button></div>
      <div class="modal-body"></div>
      ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
    </div>
  </div>`);
  const modal = backdrop.querySelector('.modal');
  const bodyEl = backdrop.querySelector('.modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.appendChild(body);

  const handle = {
    el: modal,
    body: bodyEl,
    onClose,
    setTitle(t, ic) {
      backdrop.querySelector('.modal-title').textContent = t;
      if (ic !== undefined) {
        const head = backdrop.querySelector('.modal-head');
        head.querySelector('svg:not(.close svg)')?.remove();
        if (ic) head.insertAdjacentHTML('afterbegin', icon(ic, 18));
      }
    },
    setBody(content) {
      bodyEl.innerHTML = '';
      if (typeof content === 'string') bodyEl.innerHTML = content;
      else bodyEl.appendChild(content);
    },
    setFoot(content) {
      let f = modal.querySelector('.modal-foot');
      if (!content) return f?.remove();
      if (!f) {
        f = document.createElement('div');
        f.className = 'modal-foot';
        modal.appendChild(f);
      }
      f.innerHTML = content;
    },
    close: () => closeModal(),
  };

  const close = () => dismissable && closeModal();
  backdrop.querySelector('.close').addEventListener('click', () => closeModal());
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close();
  });
  handle.keydown = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', handle.keydown);
  root.appendChild(backdrop);
  handle.backdrop = backdrop;
  current = handle;
  document.body.style.overflow = 'hidden';
  setTimeout(() => modal.querySelector('input:not([type=hidden]):not([readonly])')?.focus(), 50);
  return handle;
}

export function closeModal({ silent = false, instant = false } = {}) {
  if (!current) return;
  const h = current;
  current = null;
  document.removeEventListener('keydown', h.keydown);
  // A quick fade-out, unless another modal is replacing this one.
  if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) h.backdrop.remove();
  else {
    h.backdrop.classList.add('closing');
    setTimeout(() => h.backdrop.remove(), 140);
  }
  document.body.style.overflow = '';
  if (!silent && h.onClose) h.onClose();
}

export function currentModal() {
  return current;
}
