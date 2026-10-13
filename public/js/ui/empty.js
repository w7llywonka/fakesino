import { esc } from '../dom.js';
import { icon } from '../icons.js';

// Empty states: an icon, what's missing and what to do about it.
// `actions` is trusted markup (buttons or links).
export function emptyState({ ic = 'info', title = '', text = '', actions = '' } = {}) {
  return `<div class="empty">${icon(ic, 26)}${title ? `<div class="empty-title">${esc(title)}</div>` : ''}${text ? `<div>${esc(text)}</div>` : ''}${
    actions ? `<div class="empty-actions">${actions}</div>` : ''
  }</div>`;
}

export const actionLink = (href, label, primary = true) => `<a class="btn ${primary ? 'btn-primary' : 'btn-secondary'} btn-sm" href="${esc(href)}">${esc(label)}</a>`;

export const skeletonRows = (n = 5) => `<div class="skeleton-rows" aria-hidden="true">${'<span class="skeleton"></span>'.repeat(n)}</div>`;
