// Lightweight tooltips for any element with data-tip="…": shown on hover and
// keyboard focus. Help (?) buttons also open on tap, for touch screens.
let tip = null;
let pinned = null;

export function initTooltips() {
  document.addEventListener('mouseover', (e) => {
    if (pinned) return;
    const t = e.target.closest('[data-tip]');
    if (!t) return hide();
    show(t);
  });
  document.addEventListener('focusin', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (t && t.matches(':focus-visible')) show(t);
  });
  document.addEventListener('focusout', () => !pinned && hide());
  document.addEventListener('click', (e) => {
    const t = e.target.closest('.help-tip');
    if (t) {
      e.preventDefault();
      e.stopPropagation();
      if (pinned === t) return unpin();
      pinned = t;
      show(t);
      return;
    }
    unpin();
  }, true);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && unpin());
  document.addEventListener('scroll', unpin, true);
  window.addEventListener('resize', unpin);
}

function unpin() {
  pinned = null;
  hide();
}

function show(target) {
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'tooltip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
  }
  const text = target.dataset.tip;
  if (!text) return hide();
  tip.textContent = text;
  tip.classList.toggle('wrap', text.length > 42);
  tip.style.display = 'block';
  tip.classList.remove('in');
  void tip.offsetWidth;
  tip.classList.add('in');
  const r = target.getBoundingClientRect();
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
  let top = r.top - h - 8;
  tip.classList.toggle('below', top < 8);
  if (top < 8) top = r.bottom + 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  tip.style.setProperty('--arrow-x', `${Math.max(10, Math.min(w - 10, r.left + r.width / 2 - left))}px`);
}

function hide() {
  if (tip) tip.style.display = 'none';
}
