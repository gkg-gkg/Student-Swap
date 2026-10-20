// Small form helpers shared by every page with a form.

/** Text values of every named field (file inputs excluded). @param {HTMLFormElement} form @returns {Record<string, string>} */
export const values = (form) => /** @type {Record<string, string>} */ (Object.fromEntries(new FormData(form)));

/** Show or clear a field-level error (announced via role="alert"). @param {HTMLFormElement} form @param {string} name @param {string} [message] */
export function setFieldError(form, name, message) {
  const input = /** @type {HTMLInputElement | undefined} */ (form.elements.namedItem(name) ?? undefined);
  const wrap = input?.closest('.field');
  if (!input || !wrap) return;
  wrap.classList.toggle('field--error', !!message);
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  const err = wrap.querySelector('.field__error');
  if (err) err.textContent = message ?? '';
}

/** @param {HTMLFormElement} form */
export function clearFieldErrors(form) {
  form.querySelectorAll('.field--error').forEach((w) => {
    w.classList.remove('field--error');
    const e = w.querySelector('.field__error');
    if (e) e.textContent = '';
  });
  const top = form.querySelector('.form-error');
  if (top) top.textContent = '';
}

/** @param {HTMLFormElement} form @param {string} message */
export function setFormError(form, message) {
  const el = form.querySelector('.form-error');
  if (el) el.textContent = message;
}

/** Focus the first invalid field so keyboard users land on the problem. @param {HTMLFormElement} form */
export function focusFirstError(form) {
  /** @type {HTMLElement | null} */ (
    form.querySelector('.field--error input, .field--error select, .field--error textarea')
  )?.focus();
}

/** Disable a button and show a spinner while an async action runs. @param {HTMLButtonElement} btn @param {boolean} on @param {string} [text] */
export function busy(btn, on, text = 'Please wait…') {
  btn.dataset.label ??= btn.innerHTML;
  btn.disabled = on;
  btn.innerHTML = on ? `<span class="spinner" aria-hidden="true"></span> ${text}` : btn.dataset.label;
}
