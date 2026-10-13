// Tiny DOM helpers. Templates are plain strings; anything user-controlled must
// go through esc() before it is interpolated.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export function html(strings, ...values) {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? values[i] ?? '' : ''), '');
}

export function el(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

export function frag(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup;
  return t.content;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function on(root, event, selector, handler, opts) {
  const fn = (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  };
  root.addEventListener(event, fn, opts);
  return () => root.removeEventListener(event, fn, opts);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

const loadedCss = new Set();
export function loadCss(href) {
  if (loadedCss.has(href)) return Promise.resolve();
  loadedCss.add(href);
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  fallbackCopy(text);
  return Promise.resolve();
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } catch {
    /* ignore */
  }
  ta.remove();
}

// Animate a number from a to b over ms, calling fn(value) each frame.
export function tween(from, to, ms, fn, ease = (t) => 1 - Math.pow(1 - t, 3)) {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms);
      fn(from + (to - from) * ease(t));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}
