import { el, on } from '../dom.js';
import { icon } from '../icons.js';
import { api } from '../api.js';
import { setUser } from '../state.js';
import { setQuery } from '../router.js';
import { openModal } from './modal.js';
import { toastSuccess } from './toast.js';

export function showFieldErrors(form, err) {
  form.querySelectorAll('.field.invalid').forEach((f) => f.classList.remove('invalid'));
  const field = err?.field && form.querySelector(`[data-field="${err.field}"]`);
  if (field) {
    field.classList.add('invalid');
    field.querySelector('.field-error').textContent = err.message;
    return true;
  }
  const general = form.querySelector('.form-error');
  if (general) {
    general.textContent = err?.message || 'Something went wrong';
    general.style.display = 'block';
  }
  return false;
}

function passwordField(name, label, autocomplete) {
  return `<div class="field" data-field="${name}"><label class="field-label">${label}<span class="req">*</span></label>
    <div class="input-suffix"><input class="input" name="${name}" type="password" autocomplete="${autocomplete}" required>
    <button type="button" class="suffix" data-act="peek" style="pointer-events:auto;color:var(--text-2)">${icon('eye', 18)}</button></div>
    <div class="field-error"></div></div>`;
}

export function openAuthModal(tab = 'register') {
  const modal = openModal({
    title: tab === 'login' ? 'Sign In' : 'Create an Account',
    size: 'narrow',
    onClose: () => setQuery({ modal: null, tab: null }, { replace: true }),
  });
  render(tab);

  function render(t) {
    modal.setTitle(t === 'login' ? 'Sign In' : 'Create an Account');
    const form =
      t === 'login'
        ? el(`<form novalidate>
          <div class="field" data-field="login"><label class="field-label">Email or Username<span class="req">*</span></label>
            <input class="input" name="login" autocomplete="username" required><div class="field-error"></div></div>
          ${passwordField('password', 'Password', 'current-password')}
          <div class="field-error form-error" style="margin-bottom:10px"></div>
          <button class="btn btn-blue btn-block btn-lg" type="submit">Sign In</button>
        </form>`)
        : el(`<form novalidate>
          <div class="field" data-field="email"><label class="field-label">Email<span class="req">*</span></label>
            <input class="input" name="email" type="email" autocomplete="email" required><div class="field-error"></div></div>
          <div class="field" data-field="username"><label class="field-label">Username<span class="req">*</span></label>
            <input class="input" name="username" autocomplete="username" maxlength="14" required>
            <div class="dim" style="font-size:12px">3–14 characters. Letters, numbers and underscores.</div><div class="field-error"></div></div>
          ${passwordField('password', 'Password', 'new-password')}
          <div class="field" data-field="terms"><label class="checkbox"><input type="checkbox" name="terms">
            <span>I am at least 18 years old and accept the <a class="link" href="/terms" target="_blank">Terms</a>. I understand Fakesino is play money only and nothing has real value.</span></label>
            <div class="field-error"></div></div>
          <div class="field-error form-error" style="margin-bottom:10px"></div>
          <button class="btn btn-blue btn-block btn-lg" type="submit">Play Now</button>
        </form>`);
    modal.setBody(form);
    modal.setFoot(
      t === 'login'
        ? `Don't have an account? <a class="link" data-switch="register">Register an Account</a>`
        : `Already have an account? <a class="link" data-switch="login">Sign In</a>`,
    );
    modal.el.querySelector('.modal-foot [data-switch]').addEventListener('click', (e) => {
      setQuery({ modal: 'auth', tab: e.target.dataset.switch }, { replace: true });
      render(e.target.dataset.switch);
    });
    on(form, 'click', '[data-act=peek]', (e, b) => {
      const input = b.parentElement.querySelector('input');
      input.type = input.type === 'password' ? 'text' : 'password';
      b.innerHTML = icon(input.type === 'password' ? 'eye' : 'eyeOff', 18);
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      const data = Object.fromEntries(new FormData(form));
      data.terms = !!form.querySelector('[name=terms]')?.checked;
      btn.classList.add('loading');
      btn.disabled = true;
      try {
        const { user } = await api.post(t === 'login' ? '/api/auth/login' : '/api/auth/register', data);
        setUser(user);
        if (t === 'register') {
          toastSuccess(`Welcome, ${user.username}!`, 'Make your first play-money deposit to start playing.');
          setQuery({ modal: 'wallet', tab: 'deposit' }, { replace: true });
        } else {
          toastSuccess('Signed in', `Welcome back, ${user.username}.`);
          modal.onClose = null;
          modal.close();
          setQuery({ modal: null, tab: null }, { replace: true });
        }
      } catch (err) {
        showFieldErrors(form, err);
      } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    });
    setTimeout(() => form.querySelector('input')?.focus(), 30);
  }
  return modal;
}
