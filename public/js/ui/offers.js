import { el, esc } from '../dom.js';
import { coin } from '../icons.js';
import { api } from '../api.js';
import { state, setBalance, setUser } from '../state.js';
import { CURRENCY_CODES, CURRENCIES } from '../shared/currencies.js';
import { openModal } from './modal.js';
import { toastSuccess } from './toast.js';
import { showFieldErrors } from './forms.js';
import * as fmt from '../format.js';

// Redeem a promo / bonus-drop code: pick the currency to receive it in.
export function openRedeem(code = '', { onDone } = {}) {
  const body = el(`<form novalidate>
    <div class="field" data-field="code"><div class="field-label">Code</div><input class="input mono" name="code" value="${esc(code)}" autocomplete="off" placeholder="Enter your code"><div class="field-error"></div></div>
    <div class="field" data-field="currency"><div class="field-label">Receive in</div>
      <div class="rd-grid">${CURRENCY_CODES.map((c) => `<label class="rd-cur"><input type="radio" name="currency" value="${c}" ${c === (state.user?.currency || 'USD') ? 'checked' : ''}>${coin(c, 18)}<span>${c}</span></label>`).join('')}</div><div class="field-error"></div></div>
    <div class="field-error form-error" style="margin-bottom:10px"></div>
    <button class="btn btn-primary btn-block btn-lg" type="submit">Redeem</button></form>`);
  const modal = openModal({ title: 'Redeem bonus', iconName: 'gift', body });
  body.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currency = body.querySelector('[name=currency]:checked')?.value || 'USD';
    try {
      const r = await api.post('/api/offers/redeem', { code: body.code.value.trim(), currency });
      setBalance(r.balance.currency, r.balance.amount);
      if (r.user) setUser(r.user);
      toastSuccess('Bonus redeemed', `${fmt.money(r.amount, r.currency)}${CURRENCIES[r.currency].type === 'crypto' ? ` ${r.currency}` : ''} added to your wallet.`);
      modal.close();
      onDone?.(r);
    } catch (err) {
      showFieldErrors(body, err);
    }
  });
  if (!code) body.code.focus();
  return modal;
}
