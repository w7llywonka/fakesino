// Lightweight hover tooltips for any element with data-tip="…".
let tip = null;

export function initTooltips() {
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t) return hide();
    show(t);
  });
  document.addEventListener('scroll', hide, true);
}

function show(target) {
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'tooltip';
    document.body.appendChild(tip);
  }
  tip.textContent = target.dataset.tip;
  tip.style.display = 'block';
  const r = target.getBoundingClientRect();
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
  let top = r.top - h - 8;
  if (top < 8) top = r.bottom + 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function hide() {
  if (tip) tip.style.display = 'none';
}
