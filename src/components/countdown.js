// One shared 1s interval keeps every [data-countdown] element up to date.
// Elements fire a bubbling "countdown:done" event when they reach zero.
let timer = 0;

/** @param {number} ms @param {string} mode */
function format(ms, mode) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (mode === 'clock' || (d === 0 && h === 0))
    return `${String(h * 60 + m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h ${m}m`;
}

function tick() {
  for (const el of /** @type {NodeListOf<HTMLElement>} */ (
    document.querySelectorAll('[data-countdown]:not(.is-done)')
  )) {
    const left = new Date(/** @type {string} */ (el.dataset.countdown)).getTime() - Date.now();
    if (left <= 0) {
      el.textContent = el.dataset.doneText ?? 'Expired';
      el.classList.add('is-done');
      el.dispatchEvent(new CustomEvent('countdown:done', { bubbles: true }));
    } else {
      el.textContent = format(left, el.dataset.format ?? 'auto');
    }
  }
}

/** Call after rendering a page. */
export function startCountdowns() {
  stopCountdowns();
  tick();
  timer = window.setInterval(tick, 1000);
}

/** Call before navigating away. */
export function stopCountdowns() {
  if (timer) window.clearInterval(timer);
  timer = 0;
}
