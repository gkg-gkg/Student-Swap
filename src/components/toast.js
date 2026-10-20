// Toasts live in a polite aria-live region so screen readers announce them.
/** @param {string} message @param {'ok' | 'error' | 'info'} [tone] */
export function toast(message, tone = 'ok') {
  let region = document.getElementById('toasts');
  if (!region) {
    region = document.createElement('div');
    region.id = 'toasts';
    region.className = 'toasts';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  el.textContent = message;
  region.appendChild(el);
  window.setTimeout(() => el.remove(), 4500);
}
