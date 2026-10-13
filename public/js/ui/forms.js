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

// Outstanding bonus wagering, shown on forms that move play money out.
export function wageringNotice(user, action = 'withdraw') {
  const w = user?.wagering;
  if (!(w?.remainingUsd > 0)) return '';
  const pct = w.requiredUsd ? Math.min(100, ((w.requiredUsd - w.remainingUsd) / w.requiredUsd) * 100) : 0;
  return `<div class="demo-notice warn wager-req"><div style="flex:1">
    <b>Wager $${w.remainingUsd.toFixed(2)} more to ${action}</b> — bonus wagering requirement ($${w.requiredUsd.toFixed(2)} in total). Every game counts.
    <div class="progress" style="margin-top:8px"><div style="width:${pct.toFixed(1)}%"></div></div></div></div>`;
}
