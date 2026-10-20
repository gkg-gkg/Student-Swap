import { request } from './http.js';

/** POST /orders (reserves the listing, starts the hold) @param {{ listingId: string, offerId?: string }} input */
export const createOrder = (input) => request('/orders', { method: 'POST', body: input });
/** GET /orders/:id @param {string} id */
export const getOrder = (id) => request(`/orders/${id}`);
/** GET /me/orders */
export const myOrders = () => request('/me/orders');
/** GET /me/sales */
export const mySales = () => request('/me/sales');
/** POST /orders/:id/confirm-payment. The Stripe webhook is the source of truth; this just syncs the UI. @param {string} id @param {{ paymentRef: string }} input */
export const payOrder = (id, input) => request(`/orders/${id}/confirm-payment`, { method: 'POST', body: input });
/** POST /orders/:id/cancel @param {string} id */
export const cancelOrder = (id) => request(`/orders/${id}/cancel`, { method: 'POST' });
/** POST /orders/:id/mark-transferred (seller) @param {string} id */
export const markTransferred = (id) => request(`/orders/${id}/mark-transferred`, { method: 'POST' });
/** POST /orders/:id/download-url -> { url, fileName, expiresInSeconds } (presigned GET) @param {string} id */
export const getTicketDownload = (id) => request(`/orders/${id}/download-url`, { method: 'POST' });
