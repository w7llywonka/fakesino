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
