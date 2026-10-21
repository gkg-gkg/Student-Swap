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
 * GET /uploads/check?key=... -> { result, message, reasons } (barcode decode + duplicate check), polled until not "checking".
 * The server decodes the stored file and recomputes hashes itself; the client fingerprint is only a UX hint and is not sent.
 * @param {string} key @param {unknown} [_fingerprint]
 */
export async function checkTicketFile(key, _fingerprint) {
  // The scan runs asynchronously after the upload lands in S3 (usually a few seconds). Poll for up to ~60s.
  for (let i = 0; i < 30; i++) {
    /** @type {{ result: import('../types/index.js').BarcodeCheck, message: string, reasons: import('../types/index.js').ReviewReason[] }} */
    const res = await request('/uploads/check', { query: { key } });
    if (res.result !== 'checking') return res;
    await new Promise((resolve) => setTimeout(resolve, i < 5 ? 1000 : 2000));
  }
  return {
    result: /** @type {const} */ ('needs_review'),
    message: 'Our checks are taking longer than usual, so a person will look at this ticket before it goes live.',
    reasons: [],
  };
}
