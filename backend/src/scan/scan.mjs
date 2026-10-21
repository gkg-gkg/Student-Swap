// The ticket check behind GET /uploads/check (handoff §9). Outcomes, in the words the sell page shows:
//   rejected      can't be opened, doesn't match its declared type, a virus, or an exact duplicate of a listed ticket
//   needs_review  visually near-identical to a listed ticket, or no barcode could be read: a person checks it
//   passed        a barcode was read and nothing matched
// "passed" only means "readable and not a known duplicate". Nothing here can tell whether the ticket is still valid with
// the organiser; that protection comes from holding the money until after the event.
import { fingerprintTicket } from './fingerprint.mjs';
import { compareWithListed, duplicateReason, DUPLICATE_MESSAGE } from '../duplicates.mjs';
import { MAX_BYTES } from '../routes/uploads.mjs';

/**
 * @typedef {{ status: 'passed' | 'needs_review' | 'rejected', message: string, reasons: import('../../../src/types/index.js').ReviewReason[] }} ScanResult
 */

/** @param {string} message @returns {ScanResult} */
const rejected = (message, reasons = /** @type {any[]} */ ([])) => ({ status: 'rejected', message, reasons });

/**
 * Scan one uploaded ticket and store the result on its uploads row. Safe to repeat (SQS can deliver twice).
 * @param {{ db: import('../db.mjs').Db, storage: import('../s3.mjs').Storage }} deps
 * @param {string} key
 * @param {{ malware?: 'clean' | 'infected' | 'unscanned' }} [opts] result of the GuardDuty scan, when enabled
 */
export async function scanUpload({ db, storage }, key, opts = {}) {
  const upload = await db.one('select key, purpose, content_type, size_bytes, status from uploads where key = $1', [
    key,
  ]);
  if (!upload || upload.purpose !== 'ticket' || upload.status !== 'checking') return null;

  /** @type {ScanResult} */
  let result;
  /** @type {import('../../../src/lib/ticket-fingerprint.js').Fingerprint | null} */
  let fingerprint = null;

  if (opts.malware === 'infected') {
    await storage.remove(key);
    result = rejected('This file failed our security check. Please upload the original ticket.', [
      { source: 'barcode', code: 'malware', message: 'The virus scan flagged this file; it was deleted.' },
    ]);
  } else {
    const { bytes } = await storage.get(key);
    if (bytes.byteLength > MAX_BYTES) {
      result = rejected('That file is over 10 MB.');
    } else {
      try {
        const out = await fingerprintTicket(bytes);
        if (out.type !== upload.content_type) throw new Error('type mismatch');
        fingerprint = out.fingerprint;
        result = await judge(db.query, fingerprint);
        if (opts.malware === 'unscanned' && result.status === 'passed')
          result = {
            status: 'needs_review',
            message: 'We could not finish every check automatically, so a person will look before it goes live.',
            reasons: [
              { source: 'barcode', code: 'unscanned', message: 'The virus scan could not complete for this file.' },
            ],
          };
      } catch {
        result = rejected("We couldn't open that file. Upload the original PDF, or a clear screenshot of the ticket.");
      }
    }
  }

  await db.query(
    `update uploads set status = $2, message = $3, reasons = $4, file_hash = $5, image_hash = $6, codes = $7,
       scanned_at = now() where key = $1 and status = 'checking'`,
    [
      key,
      result.status,
      result.message,
      JSON.stringify(result.reasons),
      fingerprint?.fileHash ?? null,
      fingerprint?.imageHash ?? null,
      fingerprint?.codes ?? [],
    ],
  );
  return result;
}

/** @param {import('../db.mjs').Query} query @param {import('../../../src/lib/ticket-fingerprint.js').Fingerprint} fp @returns {Promise<ScanResult>} */
async function judge(query, fp) {
  const dup = await compareWithListed(query, fp);
  const reason = duplicateReason(dup);
  if (dup.verdict === 'duplicate') return rejected(DUPLICATE_MESSAGE, reason ? [reason] : []);
  if (dup.verdict === 'near_duplicate')
    return {
      status: 'needs_review',
      message:
        'This looks very similar to a ticket that is already listed, so a person will check it before it goes live.',
      reasons: reason ? [reason] : [],
    };
  if (!fp.codes.length)
    return {
      status: 'needs_review',
      message: 'We could not read the barcode automatically. A person will check it before it goes live.',
      reasons: [{ source: 'barcode', code: 'needs_review', message: 'Barcode could not be read automatically.' }],
    };
  return { status: 'passed', message: 'Barcode found and readable.', reasons: [] };
}
