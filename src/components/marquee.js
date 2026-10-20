import { html } from '../lib/html.js';

/**
 * Auto-scrolling row. The second group is a decorative duplicate (aria-hidden + inert)
 * so the loop is seamless without doubling what screen readers or Tab hit.
 * @param {ReturnType<typeof html>[]} items
 * @param {string} [label]
 */
export function marquee(items, label = 'Tickets') {
  return html`<div class="marquee" role="region" aria-label="${label}" tabindex="0">
    <div class="marquee__track">
      <div class="marquee__group">${items}</div>
      <div class="marquee__group" aria-hidden="true" inert>${items}</div>
    </div>
  </div>`;
}
