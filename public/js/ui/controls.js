import { el, esc, on, sleep } from '../dom.js';
import { icon, coin } from '../icons.js';
import { CURRENCIES, roundDown } from '../shared/currencies.js';
import { state, bus, currency, balanceOf, savePrefs, ensureSession } from '../state.js';
import * as fmt from '../format.js';
import { toast, toastError } from './toast.js';
import { maxStake } from '../shared/limits.js';
import { createRunner } from '../shared/autobet.js';
import { api } from '../api.js';

const AMOUNT_KEY = 'fakesino:amounts';
function rememberAmount(code, value) {
  try {
    const all = JSON.parse(localStorage.getItem(AMOUNT_KEY) || '{}');
    all[code] = value;
    localStorage.setItem(AMOUNT_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}
function recallAmount(code) {
  try {
    return Number(JSON.parse(localStorage.getItem(AMOUNT_KEY) || '{}')[code]) || 0;
  } catch {
    return 0;
  }
}

export function amountField({ key = 'amount', label = 'Bet Amount', halfDouble = true } = {}) {
  return { key, type: 'amount', label, halfDouble };
}

/**
 * Sidebar bet panel shared by every game.
 *
 * opts.fields: [{ key, type: 'amount'|'select'|'number'|'segmented'|'profit'|'readonly'|'custom', label, ... , mode }]
 * opts.onBet(values): manual bet handler (async)
 * opts.auto: { run(values) → { profit, win } } enables the Auto tab
 */
export function createBetPanel(container, opts) {
  // Advanced (strategy) autobet is on wherever Auto is, unless a game opts out.
  const modes = opts.auto ? ['manual', 'auto', ...(opts.advanced === false ? [] : ['advanced'])] : ['manual'];
  const MODE_LABEL = { manual: 'Manual', auto: 'Auto', advanced: 'Advanced' };
  let mode = 'manual'; // games see 'auto' for both Auto and Advanced
  let advanced = false;
  let strategyId = 'martingale';
  let busy = false;
  let locked = false;
  let autoRunning = false;
  let autoStop = false;
  const listeners = [];
  const cleanups = [];
  const values = {};
  const fieldEls = {};
  let profitMultiplier = null;
  let maxedAt = null; // amount set by the Max button, for the max-bet warning

  const root = el(`<div class="bet-panel stack" style="gap:12px">
    ${modes.length > 1 ? `<div class="bp-mode"><div class="tabs">${modes.map((m) => `<button class="tab ${m === mode ? 'active' : ''}" data-mode="${m}">${MODE_LABEL[m]}</button>`).join('')}</div></div>` : ''}
    <div class="bp-fields stack" style="gap:12px"></div>
    <div class="bp-auto-fields stack" style="gap:12px;display:none"></div>
    <div class="bp-adv-fields stack" style="gap:12px;display:none"></div>
    <div class="bp-actions"><button class="btn btn-primary btn-block bp-bet">${esc(opts.betLabel || 'Bet')}</button></div>
    <div class="bp-extra stack" style="gap:8px"></div>
  </div>`);
  container.appendChild(root);
  const fieldsEl = root.querySelector('.bp-fields');
  const autoEl = root.querySelector('.bp-auto-fields');
  const advEl = root.querySelector('.bp-adv-fields');
  const betBtn = root.querySelector('.bp-bet');
  const extraEl = root.querySelector('.bp-extra');

  // ---- field rendering ----
  function renderField(f) {
    let node;
    const label = f.label ? `<div class="bp-label"><span>${esc(f.label)}</span><span class="aux"></span></div>` : '';
    switch (f.type) {
      case 'amount': {
        const code = currency();
        values[f.key] = recallAmount(code);
        node = el(`<div class="bp-field" data-key="${f.key}">${label}
          <div class="input-group">
            <div class="input-icon"><input class="input" inputmode="decimal" autocomplete="off" value="${fmt.inputAmount(values[f.key], code)}"><span class="suffix">${coin(code)}</span></div>
            ${f.halfDouble !== false ? '<button class="addon" data-act="half">½</button><button class="addon" data-act="double">2×</button><button class="addon bp-max" data-act="max" hidden>Max</button>' : ''}
          </div></div>`);
        const input = node.querySelector('input');
        input.addEventListener('input', () => {
          const v = Number(input.value.replace(/,/g, ''));
          values[f.key] = Number.isFinite(v) && v >= 0 ? v : 0;
          rememberAmount(currency(), values[f.key]);
          updateAmountAux();
          emit(f.key);
        });
        input.addEventListener('blur', () => setValue(f.key, values[f.key]));
        node.querySelector('[data-act=half]')?.addEventListener('click', () => setValue(f.key, values[f.key] / 2));
        node.querySelector('[data-act=double]')?.addEventListener('click', () => {
          const next = values[f.key] * 2;
          setValue(f.key, Math.min(next, Math.max(balanceOf(), values[f.key])));
        });
        // Max: the most the balance and the bet limits allow at the current multiplier.
        node.querySelector('[data-act=max]')?.addEventListener('click', () => {
          const m = profitMultiplier > 1 ? profitMultiplier : 1;
          setValue(f.key, Math.min(balanceOf(), maxStake(currency(), m)));
          maxedAt = values[f.key];
        });
        break;
      }
      case 'select': {
        values[f.key] = f.value ?? f.options[0][0];
        node = el(`<div class="bp-field" data-key="${f.key}">${label}<select class="select">${f.options
          .map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(values[f.key]) ? 'selected' : ''}>${esc(l)}</option>`)
          .join('')}</select></div>`);
        node.querySelector('select').addEventListener('change', (e) => {
          const raw = e.target.value;
          values[f.key] = typeof f.options[0][0] === 'number' ? Number(raw) : raw;
          emit(f.key);
        });
        break;
      }
      case 'segmented': {
        values[f.key] = f.value ?? f.options[0][0];
        node = el(`<div class="bp-field" data-key="${f.key}">${label}<div class="segmented">${f.options
          .map(([v, l]) => `<button data-v="${esc(v)}" class="${String(v) === String(values[f.key]) ? 'active' : ''}">${esc(l)}</button>`)
          .join('')}</div></div>`);
        on(node, 'click', 'button[data-v]', (e, b) => {
          if (b.disabled) return;
          setValue(f.key, typeof f.options[0][0] === 'number' ? Number(b.dataset.v) : b.dataset.v);
          emit(f.key);
        });
        break;
      }
      case 'number':
      case 'text': {
        values[f.key] = f.value ?? '';
        node = el(`<div class="bp-field" data-key="${f.key}">${label}<div class="input-suffix"><input class="input" ${f.type === 'number' ? 'inputmode="decimal"' : ''} autocomplete="off" value="${esc(values[f.key])}">${f.suffix ? `<span class="suffix">${f.suffix}</span>` : ''}</div></div>`);
        const input = node.querySelector('input');
        input.addEventListener('input', () => {
          values[f.key] = f.type === 'number' ? (input.value === '' ? '' : Number(input.value)) : input.value;
          emit(f.key);
        });
        if (f.type === 'number')
          input.addEventListener('blur', () => {
            let v = Number(input.value);
            if (!Number.isFinite(v)) v = f.value ?? 0;
            if (f.min != null) v = Math.max(f.min, v);
            if (f.max != null) v = Math.min(f.max, v);
            setValue(f.key, v);
            emit(f.key);
          });
        break;
      }
      case 'profit':
      case 'readonly': {
        node = el(`<div class="bp-field bp-readonly" data-key="${f.key}">${label}<div class="input-suffix"><input class="input" readonly tabindex="-1" value="${esc(f.value ?? '')}">${f.suffix || f.type === 'profit' ? `<span class="suffix">${f.type === 'profit' ? coin(currency()) : f.suffix}</span>` : ''}</div></div>`);
        break;
      }
      case 'custom': {
        node = el(`<div class="bp-field" data-key="${f.key || ''}">${label}<div class="bp-custom"></div></div>`);
        f.render(node.querySelector('.bp-custom'), node);
        break;
      }
      default:
        node = el('<div></div>');
    }
    if (f.mode) node.dataset.mode = f.mode;
    if (f.hidden) node.style.display = 'none';
    fieldEls[f.key] = { node, spec: f };
    return node;
  }

  for (const f of opts.fields) fieldsEl.appendChild(renderField(f));

  // ---- auto fields ----
  const auto = { bets: 0, onWin: 'reset', onWinPct: 0, onLoss: 'reset', onLossPct: 0, stopProfit: 0, stopLoss: 0 };
  if (opts.auto) {
    autoEl.innerHTML = `
      <div class="bp-field"><div class="bp-label"><span>Number of Bets</span></div>
        <div class="input-suffix"><input class="input" data-auto="bets" inputmode="numeric" value="0"><span class="suffix">${icon('refresh', 14)}</span></div></div>
      ${['Win', 'Loss']
        .map(
          (k) => `<div class="bp-field"><div class="bp-label"><span>On ${k}</span></div>
        <div class="bp-onwinloss"><div class="toggle-pair"><button class="active" data-on="${k}" data-v="reset">Reset</button><button data-on="${k}" data-v="increase">Increase by:</button></div>
        <div class="input-suffix" style="flex:1"><input class="input" data-auto="on${k}Pct" inputmode="decimal" value="0" disabled><span class="suffix">%</span></div></div></div>`,
        )
        .join('')}
      <div class="bp-field"><div class="bp-label"><span>Stop on Profit</span><span class="aux" data-aux="stopProfit"></span></div>
        <div class="input-suffix"><input class="input" data-auto="stopProfit" inputmode="decimal" value="0"><span class="suffix auto-coin">${coin(currency())}</span></div></div>
      <div class="bp-field"><div class="bp-label"><span>Stop on Loss</span><span class="aux" data-aux="stopLoss"></span></div>
        <div class="input-suffix"><input class="input" data-auto="stopLoss" inputmode="decimal" value="0"><span class="suffix auto-coin">${coin(currency())}</span></div></div>`;
    on(autoEl, 'input', 'input[data-auto]', (e, input) => {
      auto[input.dataset.auto] = Number(input.value) || 0;
    });
    on(autoEl, 'click', 'button[data-on]', (e, b) => {
      if (autoRunning) return;
      const k = b.dataset.on;
      auto[`on${k}`] = b.dataset.v;
      b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      const pct = autoEl.querySelector(`[data-auto=on${k}Pct]`);
      pct.disabled = b.dataset.v !== 'increase';
    });
  }

  // ---- helpers ----
  function emit(key) {
    for (const fn of listeners) fn(key, values[key], values);
    if (key === 'amount') refreshProfit();
  }

  function setValue(key, v) {
    const f = fieldEls[key];
    if (!f) {
      values[key] = v;
      return;
    }
    const spec = f.spec;
    if (spec.type === 'amount') {
      const code = currency();
      v = Math.max(0, roundDown(code, Number(v) || 0));
      values[key] = v;
      f.node.querySelector('input').value = fmt.inputAmount(v, code);
      rememberAmount(code, v);
      updateAmountAux();
      refreshProfit();
    } else if (spec.type === 'select') {
      values[key] = v;
      f.node.querySelector('select').value = String(v);
    } else if (spec.type === 'segmented') {
      values[key] = v;
      f.node.querySelectorAll('button[data-v]').forEach((b) => b.classList.toggle('active', b.dataset.v === String(v)));
    } else if (spec.type === 'number' || spec.type === 'text') {
      values[key] = v;
      const input = f.node.querySelector('input');
      if (document.activeElement !== input) input.value = spec.decimals != null && v !== '' ? Number(v).toFixed(spec.decimals) : v;
    } else if (spec.type === 'readonly' || spec.type === 'profit') {
      f.node.querySelector('input').value = v;
    }
  }

  function updateAmountAux() {
    for (const { node, spec } of Object.values(fieldEls)) {
      if (spec.type !== 'amount') continue;
      const code = currency();
      const aux = node.querySelector('.aux');
      if (aux) aux.textContent = CURRENCIES[code].type === 'crypto' ? fmt.fiat(fmt.usdOf(values[spec.key], code)) : '';
    }
  }

  function refreshProfit() {
    const pf = Object.values(fieldEls).find((f) => f.spec.type === 'profit');
    if (!pf) return;
    const code = currency();
    const m = profitMultiplier;
    const amount = values.amount || 0;
    const profit = m == null ? 0 : Math.max(0, amount * m - amount);
    pf.node.querySelector('input').value = fmt.amount(roundDown(code, profit), code);
    const aux = pf.node.querySelector('.aux');
    if (aux) aux.textContent = CURRENCIES[code].type === 'crypto' ? fmt.fiat(fmt.usdOf(profit, code)) : '';
  }

  function applyDisabled() {
    const disable = busy || locked || autoRunning;
    for (const { node, spec } of Object.values(fieldEls)) {
      if (spec.type === 'profit' || spec.type === 'readonly') continue;
      if (spec.keepEnabled) continue;
      node.querySelectorAll('input, select, button').forEach((x) => (x.disabled = disable));
    }
    autoEl.querySelectorAll('input, button').forEach((x) => {
      if (x.dataset.auto?.endsWith('Pct')) {
        const k = x.dataset.auto.includes('Win') ? 'onWin' : 'onLoss';
        x.disabled = autoRunning || auto[k] !== 'increase';
      } else x.disabled = autoRunning;
    });
    advEl.querySelectorAll('input, select, button').forEach((x) => (x.disabled = autoRunning));
    root.querySelectorAll('.bp-mode .tab').forEach((t) => (t.disabled = busy || locked || autoRunning));
    if (mode === 'auto') {
      betBtn.textContent = autoRunning ? (autoStop ? 'Finishing Bet' : 'Stop Autobet') : 'Start Autobet';
      betBtn.disabled = autoStop || (!autoRunning && busy);
    }
  }

  function setMode(tab) {
    advanced = tab === 'advanced';
    const m = advanced ? 'auto' : tab;
    mode = m;
    root.querySelectorAll('.bp-mode .tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === tab));
    autoEl.style.display = m === 'auto' && !advanced ? '' : 'none';
    advEl.style.display = advanced ? '' : 'none';
    if (advanced) renderStrategies();
    for (const { node, spec } of Object.values(fieldEls)) {
      if (spec.mode) node.style.display = spec.mode === m && !spec.hidden ? '' : 'none';
    }
    betBtn.textContent = m === 'auto' ? 'Start Autobet' : opts.betLabel || 'Bet';
    applyDisabled();
    // Notify after re-enabling so games can re-lock the fields they control.
    for (const fn of listeners) fn('mode', m, values);
  }

  on(root, 'click', '.bp-mode .tab', (e, t) => !t.disabled && setMode(t.dataset.mode));

  // ---- betting ----
  function snapshot() {
    return { ...values, amount: roundDown(currency(), values.amount || 0) };
  }

  function checkBalance(amount) {
    if (!state.user) return true;
    if (amount > balanceOf() + 1e-12) {
      toast({ type: 'error', title: 'Insufficient balance', message: 'Deposit play money from the wallet to keep playing.' });
      return false;
    }
    return true;
  }

  async function manualBet() {
    if (busy || !opts.onBet) return;
    if (maxedAt != null && values.amount === maxedAt && values.amount > 0 && state.user?.settings?.maxBetWarning) {
      const { confirmDialog } = await import('./confirm.js');
      const code = currency();
      const r = await confirmDialog({ title: 'Max bet', message: `You are about to bet ${fmt.money(values.amount, code)} (your max bet). Continue?`, checkbox: "Don't show again" });
      if (r.checked) api.post('/api/account/settings', { maxBetWarning: false }).then(({ user }) => user && Object.assign(state.user.settings, user.settings)).catch(() => {});
      if (!r.ok) return;
      maxedAt = null;
    }
    try {
      await opts.onBet(snapshot());
    } catch (err) {
      toastError(err);
    }
  }

  async function runAuto() {
    if (!state.user) {
      ensureSession().catch(() => {});
      return;
    }
    if (advanced) return runAdvanced();
    autoRunning = true;
    autoStop = false;
    applyDisabled();
    const base = values.amount || 0;
    let current = base;
    let total = 0;
    let remaining = auto.bets;
    const infinite = !auto.bets;
    const betsInput = autoEl.querySelector('[data-auto=bets]');
    try {
      while (!autoStop && (infinite || remaining > 0)) {
        if (opts.auto.canRun && !opts.auto.canRun()) break;
        setValue('amount', current);
        const v = snapshot();
        if (!checkBalance(v.amount)) break;
        const r = await opts.auto.run(v);
        if (!r) break;
        total += r.profit;
        if (!infinite) {
          remaining--;
          betsInput.value = remaining;
        }
        if (r.win) current = auto.onWin === 'increase' ? current * (1 + auto.onWinPct / 100) : base;
        else if (r.profit < 0) current = auto.onLoss === 'increase' ? current * (1 + auto.onLossPct / 100) : base;
        if (auto.stopProfit > 0 && total >= auto.stopProfit) break;
        if (auto.stopLoss > 0 && -total >= auto.stopLoss) break;
        await sleep(opts.instant?.() ? Math.min(opts.auto.delay ?? 10, 10) : opts.auto.delay ?? (state.prefs.animations ? 120 : 30));
      }
    } catch (err) {
      toastError(err, 'Autobet stopped');
    } finally {
      if (!infinite) betsInput.value = auto.bets;
      autoRunning = false;
      autoStop = false;
      applyDisabled();
      for (const fn of listeners) fn('autoStopped', true, values);
    }
  }

  betBtn.addEventListener('click', () => {
    if (mode === 'auto') {
      if (autoRunning) {
        autoStop = true;
        applyDisabled();
      } else runAuto();
    } else manualBet();
  });

  // ---- advanced autobet ----
  const adv = { bets: 0, stopProfit: 0, stopLoss: 0 };
  const chanceApi = () => opts.chance || null;
  if (modes.includes('advanced')) {
    advEl.innerHTML = `
      <div class="bp-field"><div class="bp-label"><span>Strategy</span></div>
        <div class="bp-strategy"><select class="select" data-adv="strategy"></select>
          <button class="btn btn-secondary btn-sm" data-adv-act="edit" type="button">Edit</button></div>
        <button class="btn btn-ghost btn-sm bp-create" data-adv-act="create" type="button">${icon('plus', 14)} Create strategy</button></div>
      <div class="bp-field"><div class="bp-label"><span>Number of Bets</span></div>
        <div class="input-suffix"><input class="input" data-adv="bets" inputmode="numeric" value="0"><span class="suffix">∞</span></div></div>
      <div class="bp-field"><div class="bp-label"><span>Stop on Profit</span></div>
        <div class="input-suffix"><input class="input" data-adv="stopProfit" inputmode="decimal" value="0"><span class="suffix auto-coin">${coin(currency())}</span></div></div>
      <div class="bp-field"><div class="bp-label"><span>Stop on Loss</span></div>
        <div class="input-suffix"><input class="input" data-adv="stopLoss" inputmode="decimal" value="0"><span class="suffix auto-coin">${coin(currency())}</span></div></div>`;
    on(advEl, 'input', 'input[data-adv]', (e, input) => {
      adv[input.dataset.adv] = Number(input.value) || 0;
      if (input.dataset.adv === 'bets') input.nextElementSibling.textContent = adv.bets > 0 ? '' : '∞';
    });
    on(advEl, 'change', 'select[data-adv=strategy]', (e, s) => (strategyId = s.value));
    on(advEl, 'click', '[data-adv-act]', async (e, b) => {
      if (autoRunning) return;
      const { editStrategy, loadStrategies } = await import('./strategy.js');
      const caps = { chance: !!chanceApi(), overUnder: !!chanceApi()?.switchOverUnder };
      const current = loadStrategies().find((s) => s.id === strategyId);
      editStrategy(b.dataset.advAct === 'edit' ? current : null, {
        caps,
        onSaved: (id) => {
          strategyId = id || 'martingale';
          renderStrategies();
        },
      });
    });
  }

  async function renderStrategies() {
    const { loadStrategies } = await import('./strategy.js');
    const list = loadStrategies();
    if (!list.some((s) => s.id === strategyId)) strategyId = list[0].id;
    const sel = advEl.querySelector('select[data-adv=strategy]');
    if (!sel) return;
    sel.innerHTML = list.map((s) => `<option value="${esc(s.id)}" ${s.id === strategyId ? 'selected' : ''}>${esc(s.name)}${s.builtin ? '' : ' ★'}</option>`).join('');
    advEl.querySelector('[data-adv-act=edit]').textContent = list.find((s) => s.id === strategyId)?.builtin ? 'View' : 'Edit';
  }
  on(advEl, 'change', 'select[data-adv=strategy]', () => renderStrategies());

  async function runAdvanced() {
    const { loadStrategies } = await import('./strategy.js');
    const strategy = loadStrategies().find((s) => s.id === strategyId);
    if (!strategy) return;
    autoRunning = true;
    autoStop = false;
    applyDisabled();
    const ch = chanceApi();
    const base = values.amount || 0;
    const baseChance = ch ? ch.get() : null;
    const runner = createRunner(strategy, { amount: base, chance: baseChance });
    let current = base;
    let total = 0;
    let remaining = adv.bets;
    const infinite = !adv.bets;
    const betsInput = advEl.querySelector('[data-adv=bets]');
    toast({ title: 'Autobet started', message: strategy.name });
    try {
      while (!autoStop && (infinite || remaining > 0)) {
        if (opts.auto.canRun && !opts.auto.canRun()) break;
        setValue('amount', current);
        const v = snapshot();
        if (!checkBalance(v.amount)) break;
        const r = await opts.auto.run(v);
        if (!r) break;
        total += r.profit;
        if (!infinite) betsInput.value = --remaining;
        const next = runner.record({ profit: r.profit });
        current = next.amount;
        if (ch && next.chance != null) {
          const c = Math.min(ch.max ?? 98, Math.max(ch.min ?? 0.01, next.chance));
          if (Math.abs(c - ch.get()) > 1e-9) ch.set(c);
        }
        if (ch?.switchOverUnder && next.switchOverUnder) ch.switchOverUnder();
        if (next.stop) break;
        if (adv.stopProfit > 0 && total >= adv.stopProfit) break;
        if (adv.stopLoss > 0 && -total >= adv.stopLoss) break;
        await sleep(opts.instant?.() ? Math.min(opts.auto.delay ?? 10, 10) : opts.auto.delay ?? (state.prefs.animations ? 120 : 30));
      }
    } catch (err) {
      toastError(err, 'Autobet stopped');
    } finally {
      if (!infinite) betsInput.value = adv.bets;
      setValue('amount', base);
      if (ch && baseChance != null && Math.abs(ch.get() - baseChance) > 1e-9) ch.set(baseChance);
      autoRunning = false;
      autoStop = false;
      applyDisabled();
      toast({ title: 'Autobet ended', message: `${total >= 0 ? 'Profit' : 'Loss'} ${fmt.money(Math.abs(total), currency())}` });
      for (const fn of listeners) fn('autoStopped', true, values);
    }
  }

  // ---- hotkeys ----
  const onKey = (e) => {
    if (!state.prefs.hotkeys) return;
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (document.querySelector('.modal-backdrop')) return;
    const k = e.key.toLowerCase();
    if (k === ' ') {
      e.preventDefault();
      if (!betBtn.disabled) betBtn.click();
    } else if (k === 's') setValue('amount', (values.amount || 0) * 2);
    else if (k === 'a') setValue('amount', (values.amount || 0) / 2);
    else if (k === 'd') setValue('amount', 0);
    else if (opts.hotkeys?.[k]) opts.hotkeys[k](e);
  };
  document.addEventListener('keydown', onKey);
  cleanups.push(() => document.removeEventListener('keydown', onKey));

  // Reset the amount to the remembered value when the currency changes.
  cleanups.push(
    bus.on('currency', (code) => {
      for (const { node, spec } of Object.values(fieldEls)) {
        if (spec.type === 'amount') {
          node.querySelector('.suffix').innerHTML = coin(code);
          setValue(spec.key, recallAmount(code));
        }
        if (spec.type === 'profit') node.querySelector('.suffix').innerHTML = coin(code);
      }
      autoEl.querySelectorAll('.auto-coin').forEach((s) => (s.innerHTML = coin(code)));
      advEl.querySelectorAll('.auto-coin').forEach((s) => (s.innerHTML = coin(code)));
      refreshProfit();
    }),
  );

  const syncMax = () => root.querySelectorAll('[data-act=max]').forEach((b) => (b.hidden = !(opts.slug && state.prefs.maxBet?.[opts.slug])));
  cleanups.push(bus.on('prefs', syncMax));
  syncMax();

  updateAmountAux();
  setMode('manual');

  const panel = {
    root,
    button: betBtn,
    extra: extraEl,
    get mode() {
      return mode;
    },
    get autoRunning() {
      return autoRunning;
    },
    get advanced() {
      return advanced;
    },
    values: snapshot,
    get: (k) => values[k],
    set(k, v) {
      setValue(k, v);
      if (k !== 'amount') emit(k);
    },
    onChange(fn) {
      listeners.push(fn);
    },
    setProfit(multiplier) {
      profitMultiplier = multiplier;
      refreshProfit();
    },
    setBusy(b) {
      busy = b;
      if (mode === 'manual') betBtn.disabled = b;
      applyDisabled();
    },
    lock(b) {
      locked = b;
      applyDisabled();
    },
    setButton(label, { variant = 'primary', disabled = false } = {}) {
      betBtn.textContent = label;
      betBtn.className = `btn btn-${variant} btn-block bp-bet`;
      betBtn.disabled = disabled;
    },
    resetButton() {
      betBtn.className = 'btn btn-primary btn-block bp-bet';
      betBtn.textContent = mode === 'auto' ? 'Start Autobet' : opts.betLabel || 'Bet';
      betBtn.disabled = busy;
    },
    setLabel(k, text) {
      const lbl = fieldEls[k]?.node.querySelector('.bp-label span');
      if (lbl) lbl.textContent = text;
    },
    setAux(k, text) {
      const aux = fieldEls[k]?.node.querySelector('.aux');
      if (aux) aux.textContent = text;
    },
    show(k, visible) {
      const f = fieldEls[k];
      if (!f) return;
      f.spec.hidden = !visible;
      f.node.style.display = visible && (!f.spec.mode || f.spec.mode === mode) ? '' : 'none';
    },
    field: (k) => fieldEls[k]?.node,
    // Hotkey helper: move a select to its previous/next option, or nudge a
    // number field by a step that scales with its value. Ignored while locked.
    step(k, dir) {
      const f = fieldEls[k];
      const input = f?.node.querySelector('select, input');
      if (!f || !input || input.disabled || f.node.style.display === 'none') return false;
      if (f.spec.type === 'select') {
        const opts = f.spec.options.map((o) => o[0]);
        const next = opts[opts.findIndex((o) => String(o) === String(values[k])) + dir];
        if (next === undefined) return false;
        setValue(k, next);
      } else if (f.spec.type === 'number') {
        const v = Number(values[k]) || 0;
        const step = f.spec.step ? f.spec.step(v, dir) : stepFor(v, dir);
        let next = Math.round((v + dir * step) * 100) / 100;
        if (f.spec.min != null) next = Math.max(f.spec.min, next);
        if (f.spec.max != null) next = Math.min(f.spec.max, next);
        setValue(k, next);
      } else return false;
      emit(k);
      return true;
    },
    checkBalance,
    stopAuto() {
      if (autoRunning) autoStop = true;
      applyDisabled();
    },
    destroy() {
      autoStop = true;
      cleanups.forEach((fn) => fn());
      root.remove();
    },
  };
  return panel;
}

// Step for W/E nudges: 0.1 below 10, 1 below 100, then 10.
export function stepFor(v, dir = 1) {
  const x = dir < 0 ? v - 1e-9 : v;
  return x < 10 ? 0.1 : x < 100 ? 1 : 10;
}

export function toggleHotkeys(enabled) {
  savePrefs({ hotkeys: enabled });
}
