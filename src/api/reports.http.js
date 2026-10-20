import { request } from './http.js';

/** POST /reports @param {{ orderId: string, reason: string, description: string, evidenceNames: string[] }} input */
export const createReport = (input) => request('/reports', { method: 'POST', body: input });
/** GET /reports/:id @param {string} id */
export const getReport = (id) => request(`/reports/${id}`);
/** GET /me/reports */
export const myReports = () => request('/me/reports');
