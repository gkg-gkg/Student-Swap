import { db, save, nextId, currentUserRecord, ApiError } from './mock/db.js';
import { mockCall, delay } from './mock/util.js';
import { compareFingerprint } from '../lib/ticket-fingerprint.js';
import { features } from '../config/features.js';

const MAX_BYTES = 10 * 1024 * 1024;
const TICKET_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

/**
 * Step 1 of an upload. POST /uploads/presign -> { uploadUrl, key }.
 * The real API returns a presigned S3 PUT URL for a PRIVATE bucket.
 * @param {{ fileName: string, contentType: string, size: number, purpose: 'ticket' | 'evidence' }} input
 */
export function requestUploadUrl({ fileName, contentType, size, purpose }) {
  return mockCall(
    () => {
      currentUserRecord();
      if (size > MAX_BYTES) throw new ApiError(400, 'File is too large (10 MB max).');
      if (!TICKET_TYPES.includes(contentType)) throw new ApiError(400, 'Use a PDF, PNG or JPG file.');
      const key = `${purpose}s/${nextId('listing')}-${fileName.replace(/[^\w.-]/g, '_')}`;
      return { uploadUrl: `mock://s3-presigned/${key}`, key };
    },
    { ms: 150 },
  );
}

/**
 * Step 2: PUT the bytes to the presigned URL. Mocked: only metadata is kept.
 * @param {string} uploadUrl @param {File} file @param {string} key
 */
export async function putFile(uploadUrl, file, key) {
  await delay(500);
  db.files[key] = { name: file.name, size: file.size };
  save();
  return { ok: true };
}

/**
 * Barcode check + duplicate detection on an uploaded ticket.
 *  - exact duplicate (same file bytes, or same QR/barcode/reference)  -> "rejected"
 *  - near duplicate (perceptual hash within threshold)                 -> "needs_review"
 *  - otherwise the simulated barcode read
 * The real backend decodes the stored file itself and recomputes the fingerprint (client values can be faked).
 * Try file names containing "review" or "reject" to see the other states.
 * @param {string} key @param {import('../lib/ticket-fingerprint.js').Fingerprint} [fingerprint]
 * @returns {Promise<{ result: import('../types/index.js').BarcodeCheck, message: string, reasons: import('../types/index.js').ReviewReason[] }>}
 */
export async function checkTicketFile(key, fingerprint) {
  await delay(1400);
  const name = (db.files[key]?.name ?? key).toLowerCase();
  if (features.duplicateDetection && fingerprint) {
    const registry = db.ticketFingerprints.filter(
      (r) => db.listings.find((l) => l.id === r.listingId)?.status !== 'removed',
    );
    const dup = compareFingerprint(fingerprint, registry);
    if (dup.verdict === 'duplicate') {
      return {
        result: 'rejected',
        message: 'This ticket has already been listed on StudentSwap.',
        reasons: [
          {
            source: 'duplicate',
            code: 'duplicate',
            message: 'Same ticket code or file as an existing listing.',
            detail: dup.matches[0],
          },
        ],
      };
    }
    if (dup.verdict === 'near_duplicate') {
      const sim = Math.round((1 - (dup.matches[0].distance ?? 0) / 64) * 100);
      return {
        result: 'needs_review',
        message:
          'This looks very similar to a ticket that is already listed, so a person will check it before it goes live.',
        reasons: [
          {
            source: 'duplicate',
            code: 'near_duplicate',
            message: `Visually ${sim}% similar to another listed ticket.`,
            detail: dup.matches[0],
          },
        ],
      };
    }
  }
  if (/reject|fake|duplicate/.test(name))
    return {
      result: 'rejected',
      message: 'We could not find a valid barcode, or this ticket is already listed.',
      reasons: [{ source: 'barcode', code: 'rejected', message: 'No valid barcode found.' }],
    };
  if (/review|screenshot|blurry/.test(name))
    return {
      result: 'needs_review',
      message: 'We could not read the barcode automatically. A person will check it before it goes live.',
      reasons: [{ source: 'barcode', code: 'needs_review', message: 'Barcode could not be read automatically.' }],
    };
  return { result: 'passed', message: 'Barcode found and looks valid.', reasons: [] };
}
