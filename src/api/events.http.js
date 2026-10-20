import { request } from './http.js';

/** GET /events (query: q, when, from, to, cityId, uniId, venue, type, maxPricePence, sort) @param {import('./events.mock.js').EventQuery} [q] */
export const listEvents = (q = {}) => request('/events', { query: /** @type {any} */ (q) });
/** GET /events/filters */
export const getFilterOptions = () => request('/events/filters');
/** GET /events/:id -> { event, listings, alertOn } @param {string} id */
export const getEvent = (id) => request(`/events/${id}`);
/** PUT /events/:id/alert @param {string} eventId @param {boolean} on */
export const setAlert = (eventId, on) => request(`/events/${eventId}/alert`, { method: 'PUT', body: { on } });
/** POST /event-requests @param {{ name: string, venue: string, date: string, note?: string }} input */
export const requestEvent = (input) => request('/event-requests', { method: 'POST', body: input });
