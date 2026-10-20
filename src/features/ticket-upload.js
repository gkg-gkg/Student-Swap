// Shared "upload a ticket file" pipeline for the sell wizard: validate -> fingerprint (browser preflight)
// -> presigned upload -> server check (barcode + duplicate detection). Used by both the delivery step and AI autofill.
import { uploads } from '../api/index.js';
import { features } from '../config/features.js';
import { fingerprintFile } from '../lib/ticket-fingerprint.browser.js';

export const MAX_FILE = 10 * 1024 * 1024;
export const FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

/**
 * @typedef {object} TicketFile
 * @property {string} name
 * @property {'uploading' | 'checking' | 'done'} status
 * @property {string} [key] private storage key
 * @property {import('../types/index.js').BarcodeCheck} [check]
 * @property {string} [message]
 * @property {import('../types/index.js').ReviewReason[]} [reasons]
 * @property {import('../lib/ticket-fingerprint.js').Fingerprint} [fingerprint]
 */

/**
 * @param {File} file
 * @param {(state: TicketFile) => void} onState called as the file moves through uploading -> checking -> done
 * @returns {Promise<TicketFile>}
 */
export async function processTicketFile(file, onState) {
  if (!FILE_TYPES.includes(file.type))
    return { name: file.name, status: 'done', check: 'rejected', message: 'Please use a PDF, PNG or JPG file.' };
  if (file.size > MAX_FILE)
    return { name: file.name, status: 'done', check: 'rejected', message: 'That file is over 10 MB.' };
  onState({ name: file.name, status: 'uploading' });
  try {
    const fingerprint = features.duplicateDetection ? await fingerprintFile(file).catch(() => undefined) : undefined;
    const { uploadUrl, key } = await uploads.requestUploadUrl({
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      purpose: 'ticket',
    });
    await uploads.putFile(uploadUrl, file, key);
    onState({ name: file.name, key, status: 'checking', fingerprint });
    const res = await uploads.checkTicketFile(key, fingerprint);
    return {
      name: file.name,
      key,
      status: 'done',
      check: res.result,
      message: res.message,
      reasons: res.reasons,
      fingerprint,
    };
  } catch (err) {
    return {
      name: file.name,
      status: 'done',
      check: 'rejected',
      message: err instanceof Error ? err.message : 'Upload failed.',
    };
  }
}
