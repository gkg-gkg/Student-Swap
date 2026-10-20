import { request } from './http.js';

/**
 * POST /ai/extract-ticket. Backend loads the PRIVATE S3 object (or uses the pasted text), asks Claude to read it
 * with a JSON schema, and returns ExtractedTicket (every field nullable + per-field confidence).
 * Reference implementation: backend-reference/ai-ticket-handler.mjs
 * @param {{ fileKey?: string, text?: string }} input
 */
export const extractTicket = (input) => request('/ai/extract-ticket', { method: 'POST', body: input });

/**
 * POST /ai/verify-ticket. Claude flags details that don't match, passed dates and signs of editing.
 * Flags only: it can never approve a listing. The backend also runs this automatically when a listing is created.
 * @param {{ fileKey?: string, text?: string, eventId: string, tierId?: string }} input
 */
export const verifyTicket = (input) => request('/ai/verify-ticket', { method: 'POST', body: input });
