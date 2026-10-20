// Bits reused across account tabs.
import { html } from '../../lib/html.js';
import { cities } from '../../data/regions.js';
import { dayLabel, formatTime } from '../../lib/time.js';

/** "Fri 24 Oct · 10:30 pm · Venue, City" @param {any} e event */
export const eventLine = (e) =>
  `${dayLabel(e.startsAt)} · ${formatTime(e.startsAt)} · ${e.venue}, ${cities.find((c) => c.id === e.cityId)?.name ?? ''}`;

/** Compact header for a list section. @param {string} title @param {number} [count] */
export const sectionHead = (title, count) =>
  html`<div class="section-title"><h2>${title}</h2>${count !== undefined ? html`<span class="muted small">${count}</span>` : ''}</div>`;

/** @param {any} e @returns {boolean} */
export const isPast = (e) => new Date(e.endsAt).getTime() < Date.now();
