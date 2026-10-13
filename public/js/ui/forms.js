// Show an API error next to the field it names (err.field ↔ [data-field]),
// or in the form's general .form-error slot.
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

// Two-factor code input for money-moving forms, shown when 2FA is on.
export function twoFactorField(user) {
  if (!user?.twoFactor) return '';
  return `<div class="field" data-field="code"><div class="field-label"><span>Two Factor Code</span><span class="dim" style="font-size:12px">From your authenticator app</span></div>
    <input class="input mono" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"><div class="field-error"></div></div>`;
}
