import { request } from './http.js';

/** GET /admin/listings/review */
export const reviewQueue = () => request('/admin/listings/review');
/** POST /admin/listings/:id/review @param {string} id @param {{ decision: 'approve' | 'reject', note?: string }} input */
export const reviewListing = (id, input) => request(`/admin/listings/${id}/review`, { method: 'POST', body: input });
/** POST /admin/listings/:id/file-url -> { url, expiresInSeconds } (presigned GET, 60s) @param {string} id */
export const ticketFileUrl = (id) => request(`/admin/listings/${id}/file-url`, { method: 'POST' });
/** GET /admin/reports?status=open */
export const reportsQueue = () => request('/admin/reports', { query: { status: 'open' } });
/** POST /admin/reports/:id/resolve @param {string} id @param {{ resolution: 'refund' | 'deny', note?: string }} input */
export const resolveReport = (id, input) => request(`/admin/reports/${id}/resolve`, { method: 'POST', body: input });
/** GET /admin/stats */
export const stats = () => request('/admin/stats');
/** GET /admin/event-requests */
export const eventRequests = () => request('/admin/event-requests');
/** POST /admin/event-requests/:id/dismiss @param {string} id */
export const dismissEventRequest = (id) => request(`/admin/event-requests/${id}/dismiss`, { method: 'POST' });
/** POST /admin/events @param {import('./admin.mock.js').CreateEventInput} input */
export const createEvent = (input) => request('/admin/events', { method: 'POST', body: input });
