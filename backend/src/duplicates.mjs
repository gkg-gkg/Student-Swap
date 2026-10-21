// Duplicate detection against everything already listed (handoff §9). Plain code, no AI. The comparison itself is
// src/lib/ticket-fingerprint.js (unit-tested, shared with the browser preflight); this file only feeds it from the DB.
import { compareFingerprint } from '../../src/lib/ticket-fingerprint.js';
import { features } from '../../src/config/features.js';

/**
 * Compare a fingerprint with the tickets of every listing that wasn't removed. Sold and expired listings still count:
 * a ticket that was sold once must not be sold again.
 * The image-hash part is a linear scan, fine at launch scale; past ~100k listings move to a BK-tree or multi-index hash.
 * @param {import('./db.mjs').Query} query @param {import('../../src/lib/ticket-fingerprint.js').Fingerprint} fp
 */
export async function compareWithListed(query, fp) {
  if (!features.duplicateDetection) return /** @type {const} */ ({ verdict: 'unique', matches: [] });
  const rows = await query(
    `select f.listing_id, f.file_hash, f.image_hash, f.codes
       from ticket_fingerprints f join listings l on l.id = f.listing_id
      where l.status <> 'removed' and (f.file_hash = $1 or f.codes && $2::text[] or f.image_hash is not null)`,
    [fp.fileHash, fp.codes],
  );
  return compareFingerprint(
    fp,
    rows.map((r) => ({
      listingId: r.listing_id,
      fileHash: r.file_hash,
      imageHash: r.image_hash,
      codes: r.codes ?? [],
    })),
  );
}

/** @param {{ verdict: string, matches: any[] }} dup @returns {import('../../src/types/index.js').ReviewReason | null} */
export function duplicateReason(dup) {
  if (dup.verdict === 'duplicate')
    return {
      source: 'duplicate',
      code: 'duplicate',
      message: 'Same ticket code or file as an existing listing.',
      detail: dup.matches[0],
    };
  if (dup.verdict === 'near_duplicate') {
    const sim = Math.round((1 - (dup.matches[0].distance ?? 0) / 64) * 100);
    return {
      source: 'duplicate',
      code: 'near_duplicate',
      message: `Visually ${sim}% similar to another listed ticket.`,
      detail: dup.matches[0],
    };
  }
  return null;
}

export const DUPLICATE_MESSAGE = 'This ticket has already been listed on StudentSwap.';
