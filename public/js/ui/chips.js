import { el, esc, on } from '../dom.js';
import { CURRENCIES, roundDown } from '../shared/currencies.js';

// Chip denominations for table games, scaled to the active currency so a chip
// is worth roughly the same in every currency.
const USD_CHIPS = [0.1, 1, 5, 25, 100, 500, 2500];
const COLORS = ['#7b8794', '#3b82f6', '#e0283c', '#22a35a', '#1b1b1b', '#8b5cf6', '#f5b83d'];

export function chipValues(code) {
  const c = CURRENCIES[code];
  return USD_CHIPS.map((usd, i) => ({ value: roundDown(code, usd / c.usd) || 10 ** -c.decimals, color: COLORS[i], usd }));
}

export function chipLabel(usd) {
  return usd >= 1000 ? `${usd / 1000}K` : usd < 1 ? `.${String(usd).split('.')[1]}` : String(usd);
}

export function chipColor(code, amount) {
  const values = chipValues(code);
  let color = values[0].color;
  for (const v of values) if (amount >= v.value - 1e-12) color = v.color;
  return color;
}

// Row of selectable chips. onSelect({ value, color, usd }).
export function chipRack(container, { code, onSelect, selected = 1 }) {
  const rack = el('<div class="chip-rack"></div>');
  container.appendChild(rack);
  let values = chipValues(code);
  let index = selected;
  const render = () => {
    rack.innerHTML = values
      .map((v, i) => `<button type="button" class="chip-btn ${i === index ? 'active' : ''}" style="--chip:${v.color}" data-i="${i}" data-tip="${esc(String(v.value))}">${chipLabel(v.usd)}</button>`)
      .join('');
  };
  render();
  on(rack, 'click', '[data-i]', (e, b) => {
    if (b.disabled) return;
    index = Number(b.dataset.i);
    render();
    onSelect?.(values[index]);
  });
  return {
    el: rack,
    get chip() {
      return values[index];
    },
    setCurrency(next) {
      values = chipValues(next);
      render();
    },
    setDisabled(d) {
      rack.querySelectorAll('button').forEach((b) => (b.disabled = d));
    },
  };
}
