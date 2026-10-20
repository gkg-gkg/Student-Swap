import { request } from './http.js';

/** GET /me/payouts -> { totals, items } */
export const getPayoutSummary = () => request('/me/payouts');
