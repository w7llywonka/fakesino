import { ROWS, LANG_ORDER } from './i18n-strings.js';

// Interface translation. Pages are written in English; once a language is
// chosen, text nodes and labels whose whole text is a known UI string are
// swapped for the translation as they appear (chat, usernames, inputs and
// code are never touched).
export const LANGUAGES = [
  ['en', 'English'],
  ['es', 'Español'],
  ['pt', 'Português'],
  ['de', 'Deutsch'],
  ['fr', 'Français'],
  ['tr', 'Türkçe'],
  ['ru', 'Русский'],
  ['ja', '日本語'],
  ['ko', '한국어'],
  ['zh', '中文'],
  ['id', 'Bahasa Indonesia'],
];
const KEY = 'fakesino:lang';
const SKIP = 'script, style, textarea, input, code, pre, .mono, .chat-msg, .chat-messages, .no-i18n, .who, .sb-teams, .slip-match, .bc-spot-name';
const ATTRS = ['placeholder', 'aria-label', 'title', 'data-tip'];

export function currentLanguage() {
  try {
    const l = localStorage.getItem(KEY);
    if (l && LANGUAGES.some(([k]) => k === l)) return l;
  } catch {
    /* storage blocked */
  }
  return 'en';
}

export function setLanguage(lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* storage blocked: the choice lasts for this page view */
  }
  location.reload();
}

let dict = null;
export const t = (s) => (dict && dict.get(s)) || s;

function translateText(node) {
  const raw = node.nodeValue;
  const s = raw.trim();
  if (!s || s.length > 240) return;
  const tr = dict.get(s);
  if (tr && tr !== s) node.nodeValue = raw.replace(s, tr);
}

function translateEl(elm) {
  for (const a of ATTRS) {
    const v = elm.getAttribute?.(a);
    const tr = v && dict.get(v.trim());
    if (tr && tr !== v) elm.setAttribute(a, tr);
  }
}

function walk(root) {
  if (root.nodeType === 3) {
    if (!root.parentElement?.closest(SKIP)) translateText(root);
    return;
  }
  if (root.nodeType !== 1 || root.closest(SKIP)) return;
  translateEl(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (n.nodeType === 3) translateText(n);
    else translateEl(n);
  }
}

export function initI18n() {
  const lang = currentLanguage();
  document.documentElement.lang = lang;
  if (lang === 'en') return;
  const col = LANG_ORDER.indexOf(lang) + 1;
  dict = new Map(ROWS.map((r) => [r[0], r[col]]));
  walk(document.body);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes') translateEl(r.target);
      else if (r.type === 'characterData') {
        if (!r.target.parentElement?.closest(SKIP)) translateText(r.target);
      } else for (const n of r.addedNodes) walk(n);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
