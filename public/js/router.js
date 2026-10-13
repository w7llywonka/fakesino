import { bus } from './state.js';

// History-API router. Routes map a path pattern to a page loader; modals are
// driven by the `?modal=` query parameter so they can be linked and closed
// with the back button.
const routes = [];
let current = null;

export function route(pattern, load) {
  const keys = [];
  const re = new RegExp(
    '^' +
      pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => {
        keys.push(k);
        return '/([^/]+)';
      }) +
      '/?$',
  );
  routes.push({ re, keys, load, pattern });
}

export function match(pathname) {
  for (const r of routes) {
    const m = r.re.exec(pathname);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { ...r, params };
    }
  }
  return null;
}

export function navigate(to, { replace = false } = {}) {
  const url = new URL(to, location.origin);
  if (url.origin !== location.origin) {
    location.href = to;
    return;
  }
  const same = url.pathname === location.pathname;
  history[replace ? 'replaceState' : 'pushState']({}, '', url.pathname + url.search + url.hash);
  handle(same);
}

export function setQuery(patch, { replace = false } = {}) {
  const url = new URL(location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === '') url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  history[replace ? 'replaceState' : 'pushState']({}, '', url.pathname + url.search);
  bus.emit('query', Object.fromEntries(url.searchParams));
}

export function query() {
  return Object.fromEntries(new URLSearchParams(location.search));
}

function handle(samePath) {
  if (!samePath || !current) {
    const m = match(location.pathname);
    current = m;
    bus.emit('route', { match: m, path: location.pathname });
  }
  bus.emit('query', query());
}

export function startRouter() {
  window.addEventListener('popstate', () => {
    const m = match(location.pathname);
    const changed = !current || m?.pattern !== current.pattern || JSON.stringify(m?.params) !== JSON.stringify(current?.params);
    if (changed) {
      current = m;
      bus.emit('route', { match: m, path: location.pathname });
    }
    bus.emit('query', query());
  });
  // Intercept same-origin link clicks.
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download') || a.dataset.external != null) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('#')) return;
    e.preventDefault();
    if (href.startsWith('?')) {
      setQuery(Object.fromEntries(new URLSearchParams(href)));
      return;
    }
    navigate(href);
  });
  current = match(location.pathname);
  bus.emit('route', { match: current, path: location.pathname });
  bus.emit('query', query());
}
