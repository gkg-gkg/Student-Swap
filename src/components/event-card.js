import { html } from '../lib/html.js';
import { formatPence } from '../lib/money.js';
import { dayLabel, formatTime } from '../lib/time.js';
import { cities } from '../data/regions.js';

/**
 * Marquee/browse card for an event. Shows lowest price, face value and stock.
 * @param {import('../types/index.js').AppEvent} e
 * @param {{ link?: boolean, fastTag?: boolean }} [opts] link:false renders a decorative, non-focusable copy; fastTag:false hides the "Selling fast" sticker
 */
export function eventCard(e, { link = true, fastTag = true } = {}) {
  const city = cities.find((c) => c.id === e.cityId)?.name ?? '';
  const day = dayLabel(e.startsAt);
  const inner = html`
    <div class="ticket__art art--${e.tone}">
      <span class="sticker ${day === 'Tonight' ? 'sticker--paper' : ''}">${day}</span>
      ${fastTag && e.sellingFast ? html`<span class="sticker sticker--coral">Selling fast</span>` : ''}
    </div>
    <div class="ticket__body">
      <h3 class="ticket__title">${e.title}</h3>
      <p class="ticket__meta">${e.venue} · ${city} · ${formatTime(e.startsAt)}</p>
      <div class="ticket__price-row">
        ${
          e.ticketsAvailable > 0
            ? html`<span class="ticket__price">${formatPence(e.lowestPricePence)}</span><span class="ticket__face">original ${formatPence(e.faceValuePence)}</span><span class="ticket__left">${e.ticketsAvailable} left</span>`
            : html`<span class="ticket__price ticket__price--none">No tickets yet</span><span class="ticket__face">original ${formatPence(e.faceValuePence)}</span>`
        }
      </div>
    </div>`;
  return link
    ? html`<a class="ticket" href="#/event/${e.id}">${inner}</a>`
    : html`<div class="ticket" aria-hidden="true">${inner}</div>`;
}
