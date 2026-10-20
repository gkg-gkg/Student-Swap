import { request } from './http.js';

/** GET /me/notifications */
export const listNotifications = () => request('/me/notifications');
/** POST /me/notifications/read @param {string[]} [ids] */
export const markRead = (ids) => request('/me/notifications/read', { method: 'POST', body: { ids } });
/** PATCH /me/notification-prefs @param {Record<string, boolean>} prefs */
export const updatePrefs = (prefs) => request('/me/notification-prefs', { method: 'PATCH', body: prefs });
