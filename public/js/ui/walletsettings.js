import { el, esc, on } from '../dom.js';
import { api } from '../api.js';
import { state, bus, setUser } from '../state.js';
import { setQuery } from '../router.js';
import { DISPLAY_FIATS } from '../shared/currencies.js';
import { openModal } from './modal.js';
import { toastError } from './toast.js';

// Wallet display settings, opened from the balance dropdown (?modal=wallet-settings).
export function openWalletSettingsModal() {
  const modal = openModal({ title: 'Wallet Settings', iconName: 'wallet', onClose: () => setQuery({ modal: null }, { replace: true }) });
  const render = () => {
    const s = state.user.settings;
    const view = el(`<div class="wset">
      <label class="setting-row"><div><div class="t">Hide zero balances</div><div class="d">Your zero balances won’t appear in your wallet.</div></div>
        <input type="checkbox" class="toggle" data-k="hideZero" ${s.hideZero ? 'checked' : ''}></label>
      <label class="setting-row"><div><div class="t">Display crypto in fiat</div><div class="d">All bets and transactions are still settled in the crypto equivalent.</div></div>
        <input type="checkbox" class="toggle" data-k="displayFiat" ${s.displayFiat ? 'checked' : ''}></label>
      <div class="wset-grid ${s.displayFiat ? '' : 'off'}">${Object.entries(DISPLAY_FIATS)
        .map(
          ([code, f]) => `<label class="wset-fiat"><input type="radio" name="fiat" value="${code}" ${code === (s.displayFiatCurrency || 'USD') ? 'checked' : ''} ${s.displayFiat ? '' : 'disabled'}>
          <span class="sym">${esc(f.symbol)}</span><span><b>${code}</b><span class="dim">${esc(f.name)}</span></span></label>`,
        )
        .join('')}</div>
      <div class="muted" style="font-size:12px;margin-top:12px">Display rates are fixed play-money reference rates.</div></div>`);
    on(view, 'change', 'input', async (e, input) => {
      const patch = input.type === 'radio' ? { displayFiatCurrency: input.value } : { [input.dataset.k]: input.checked };
      try {
        const { user } = await api.post('/api/account/settings', patch);
        setUser(user);
        bus.emit('user-settings', user.settings);
        render();
      } catch (err) {
        toastError(err);
        render();
      }
    });
    modal.setBody(view);
  };
  render();
  return modal;
}
