import { request } from './http.js';

/** POST /offers @param {{ listingId: string, amountPence: number }} input */
export const createOffer = (input) => request('/offers', { method: 'POST', body: input });
/** GET /me/offers -> { made, received } */
export const myOffers = () => request('/me/offers');
/** POST /offers/:id/respond @param {string} id @param {{ action: 'accept' | 'decline' | 'counter', counterPence?: number }} input */
export const respondToOffer = (id, input) => request(`/offers/${id}/respond`, { method: 'POST', body: input });
