import { request } from './http.js';

/** POST /uploads/presign -> { uploadUrl, key } @param {{ fileName: string, contentType: string, size: number, purpose: 'ticket' | 'evidence' }} input */
export const requestUploadUrl = (input) => request('/uploads/presign', { method: 'POST', body: input });
/** PUT the bytes straight to the presigned S3 URL (no auth header: the URL is the credential). @param {string} uploadUrl @param {File} file */
export async function putFile(uploadUrl, file) {
  const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!res.ok) throw new Error('Upload failed. Please try again.');
  return { ok: true };
}
/**
 * GET /uploads/check?key=... -> { result, message, reasons } (barcode decode + duplicate check; poll until not "checking").
 * The server decodes the stored file and recomputes hashes itself; the client fingerprint is only a UX hint and is not sent.
 * @param {string} key @param {unknown} [_fingerprint]
 */
export const checkTicketFile = (key, _fingerprint) => request('/uploads/check', { query: { key } });
