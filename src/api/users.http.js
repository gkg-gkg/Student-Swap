import { request } from './http.js';

/** GET /sellers/:id @param {string} id */
export const getSeller = (id) => request(`/sellers/${id}`);
/** POST /me/profile @param {{ displayName: string, universityId: string, avatar: { tone: string, initials: string }, ageConfirmed: boolean }} input */
export const completeProfile = (input) => request('/me/profile', { method: 'POST', body: input });
/** PATCH /me/profile @param {{ displayName?: string, universityId?: string, avatar?: { tone: string, initials: string } }} patch */
export const updateProfile = (patch) => request('/me/profile', { method: 'PATCH', body: patch });
/** GET /me: the signed-in user's StudentSwap profile (role, university, profileComplete, notification prefs, ...). Returns 401 when the token is missing/invalid. */
export const getMe = () => request('/me');
