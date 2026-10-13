import { el, esc, on } from '../dom.js';
import { icon } from '../icons.js';
import { state } from '../state.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import { PRESETS, TRIGGERS, EVENTS, CMPS, ACTIONS, NO_VALUE, blankBlock } from '../shared/autobet.js';

// User strategies live in this browser, per wallet.
const key = () => `fakesino:strategies:${state.user?.id ?? 'guest'}`;

export function loadStrategies() {
  let mine = [];
  try {
    mine = JSON.parse(localStorage.getItem(key()) || '[]');
    if (!Array.isArray(mine)) mine = [];
  } catch {
    mine = [];
  }
  return [...PRESETS, ...mine];
}

function saveMine(list) {
  try {
    localStorage.setItem(key(), JSON.stringify(list.filter((s) => !s.builtin)));
  } catch {
    toast({ type: 'error', title: 'Could not save', message: 'This browser blocked local storage.' });
  }
}

const opts = (list, v) => list.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('');

// Opens the editor. caps: { chance: bool, overUnder: bool }. onSaved(id) after save/delete.
export function editStrategy(strategy, { caps = {}, onSaved } = {}) {
  const readOnly = !!strategy?.builtin;
  const draft = strategy ? JSON.parse(JSON.stringify(strategy)) : { id: `s${Date.now().toString(36)}`, name: 'My strategy', blocks: [blankBlock()] };
  const actions = ACTIONS.filter(([, , kind]) => kind === 'bet' || kind === 'any' || (kind === 'chance' && caps.chance) || (kind === 'dice' && caps.overUnder));

  const body = el(`<div class="st-edit">
    <div class="muted" style="font-size:13px;margin-bottom:12px">Advanced bet conditions will be executed in a top-down order.</div>
    <div class="field"><div class="field-label">Strategy name</div><input class="input" name="name" maxlength="40" value="${esc(draft.name)}" ${readOnly ? 'disabled' : ''}></div>
    <div class="st-blocks"></div>
    ${readOnly ? '' : `<button class="btn btn-secondary btn-block" data-act="add">${icon('plus', 16)} Add new condition block</button>`}
  </div>`);

  function blockHtml(b, i) {
    const dis = readOnly ? 'disabled' : '';
    const cond =
      b.type === 'profit'
        ? `<span class="st-w">On profit</span><select class="select" data-f="cmp" ${dis}>${opts(CMPS, b.cmp)}</select><input class="input st-n" data-f="amount" inputmode="decimal" value="${esc(b.amount ?? 0)}" ${dis}>`
        : `<span class="st-w">On</span><select class="select" data-f="trigger" ${dis}>${opts(TRIGGERS, b.trigger)}</select><input class="input st-n" data-f="n" inputmode="numeric" value="${esc(b.n ?? 1)}" ${dis}><select class="select" data-f="event" ${dis}>${opts(EVENTS, b.event)}</select>`;
    const valueBox = NO_VALUE.has(b.action) ? '' : `<input class="input st-n" data-f="value" inputmode="decimal" value="${esc(b.value === 'base' ? 'base' : b.value ?? 0)}" ${dis}>`;
    return `<div class="st-block" data-i="${i}">
      <div class="st-top"><div class="segmented st-kind"><button data-kind="bet" class="${b.type !== 'profit' ? 'active' : ''}" ${dis}>Bet Condition</button><button data-kind="profit" class="${b.type === 'profit' ? 'active' : ''}" ${dis}>Profit Condition</button></div>
        ${readOnly ? '' : `<div class="st-tools"><button class="icon-btn" data-move="-1" aria-label="Move up">${icon('up', 16)}</button><button class="icon-btn" data-move="1" aria-label="Move down">${icon('down', 16)}</button><button class="icon-btn" data-del aria-label="Delete">${icon('trash', 16)}</button></div>`}</div>
      <div class="st-row">${cond}</div>
      <div class="st-row"><span class="st-w">Do</span><select class="select" data-f="action" ${dis}>${opts(actions, b.action)}</select>${valueBox}</div>
    </div>`;
  }

  const blocksEl = body.querySelector('.st-blocks');
  const render = () => {
    blocksEl.innerHTML = draft.blocks.length ? draft.blocks.map(blockHtml).join('') : '<div class="empty" style="padding:16px">No conditions yet.</div>';
  };
  render();

  if (!readOnly) {
    on(blocksEl, 'change', '[data-f]', (e, input) => {
      const i = Number(input.closest('.st-block').dataset.i);
      const f = input.dataset.f;
      const b = draft.blocks[i];
      let v = input.value;
      if (f === 'n') v = Math.max(1, Math.round(Number(v) || 1));
      else if (f === 'amount') v = Number(v) || 0;
      else if (f === 'value') v = v.trim() === 'base' ? 'base' : Number(v) || 0;
      b[f] = v;
      if (f === 'action') render();
    });
    on(blocksEl, 'click', '[data-kind]', (e, btn) => {
      const i = Number(btn.closest('.st-block').dataset.i);
      const b = draft.blocks[i];
      if (btn.dataset.kind === b.type) return;
      draft.blocks[i] = btn.dataset.kind === 'profit' ? { type: 'profit', cmp: 'gt', amount: 0, action: b.action, value: b.value } : { ...blankBlock(), action: b.action, value: b.value };
      render();
    });
    on(blocksEl, 'click', '[data-move]', (e, btn) => {
      const i = Number(btn.closest('.st-block').dataset.i);
      const j = i + Number(btn.dataset.move);
      if (j < 0 || j >= draft.blocks.length) return;
      [draft.blocks[i], draft.blocks[j]] = [draft.blocks[j], draft.blocks[i]];
      render();
    });
    on(blocksEl, 'click', '[data-del]', (e, btn) => {
      draft.blocks.splice(Number(btn.closest('.st-block').dataset.i), 1);
      render();
    });
    body.querySelector('[data-act=add]').addEventListener('click', () => {
      draft.blocks.push(blankBlock());
      render();
    });
  }

  const isNew = !strategy;
  const modal = openModal({ title: readOnly ? strategy.name : isNew ? 'Create strategy' : 'Edit strategy', iconName: 'sliders', size: 'wide', body });
  const foot = readOnly
    ? `<button class="btn btn-primary" data-act="dup">Duplicate and edit</button>`
    : `${isNew ? '' : '<button class="btn btn-ghost" data-act="delete" style="color:var(--red)">Delete strategy</button>'}<button class="btn btn-primary" data-act="save" style="margin-left:auto">Save</button>`;
  modal.setFoot(`<div class="row" style="gap:8px;width:100%">${foot}</div>`);
  on(modal.el, 'click', '[data-act=save]', () => {
    draft.name = body.querySelector('[name=name]').value.trim() || 'My strategy';
    delete draft.builtin;
    const all = loadStrategies().filter((s) => !s.builtin && s.id !== draft.id);
    saveMine([...all, draft]);
    toast({ type: 'success', title: 'Strategy saved' });
    modal.close();
    onSaved?.(draft.id);
  });
  on(modal.el, 'click', '[data-act=delete]', () => {
    if (!confirm(`Delete "${draft.name}"?`)) return;
    saveMine(loadStrategies().filter((s) => !s.builtin && s.id !== draft.id));
    modal.close();
    onSaved?.(null);
  });
  on(modal.el, 'click', '[data-act=dup]', () => {
    modal.close();
    const copy = { ...JSON.parse(JSON.stringify(strategy)), id: `s${Date.now().toString(36)}`, name: `${strategy.name} (copy)` };
    delete copy.builtin;
    setTimeout(() => editStrategy({ ...copy, builtin: false }, { caps, onSaved }), 0);
  });
  return modal;
}
