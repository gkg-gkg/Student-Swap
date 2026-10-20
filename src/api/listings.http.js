import { request } from './http.js';

/** GET /listings/:id @param {string} id */
export const getListing = (id) => request(`/listings/${id}`);
/** POST /listings @param {import('./listings.mock.js').CreateListingInput} input */
export const createListing = (input) => request('/listings', { method: 'POST', body: input });
/** GET /me/listings */
export const myListings = () => request('/me/listings');
/** PATCH /listings/:id @param {string} id @param {{ pricePence: number }} patch */
export const updateListing = (id, patch) => request(`/listings/${id}`, { method: 'PATCH', body: patch });
/** DELETE /listings/:id @param {string} id */
export const delistListing = (id) => request(`/listings/${id}`, { method: 'DELETE' });
