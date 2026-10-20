// Plain-code duplicate detection (no AI). Pure functions so they are unit-tested and can be ported
// to the backend unchanged: the server recomputes fingerprints from the stored file, because a
// browser-side check can always be bypassed.
import { ticketSafety } from '../config/features.js';

/**
 * @typedef {object} Fingerprint
 * @property {string} fileHash SHA-256 of the exact file bytes (hex)
 * @property {string | null} imageHash 64-bit perceptual dHash (16 hex chars), null when the file is not a raster image
 * @property {string[]} codes normalised QR/barcode/ticket-reference values found in the file
 */

/** Uppercase alphanumerics only; very short strings are noise, not ticket references. @param {string} raw */
export function normalizeTicketCode(raw) {
  const s = String(raw)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return s.length >= 6 ? s : '';
}

/**
 * Difference hash: for a 9x8 grayscale thumbnail (72 values, row-major), each bit says whether a pixel is
 * brighter than its right-hand neighbour. Robust to resizing, re-compression and small edits.
 * @param {ArrayLike<number>} gray
 */
export function dHashFromGrayscale(gray) {
  if (gray.length !== 72) throw new Error('dHash needs a 9x8 grayscale thumbnail (72 values)');
  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) bits += gray[y * 9 + x] > gray[y * 9 + x + 1] ? '1' : '0';
  }
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

/** Number of differing bits between two equal-length hex hashes. @param {string} a @param {string} b */
export function hammingDistance(a, b) {
  if (a.length !== b.length) throw new Error('Hashes must be the same length');
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/**
 * @typedef {{ listingId: string } & Fingerprint} RegistryEntry
 * @typedef {{ listingId: string, kind: 'file_hash' | 'code' | 'image_hash', distance?: number, code?: string }} DuplicateMatch
 */

/**
 * Compare a new ticket against everything already listed.
 *  - 'duplicate'      : identical file bytes, or the same QR/barcode/reference -> block the listing
 *  - 'near_duplicate' : visually near-identical (cropped / re-saved / lightly edited) -> admin review
 *  - 'unique'         : nothing similar
 * @param {Fingerprint} fp @param {RegistryEntry[]} registry @param {number} [maxDistance]
 * @returns {{ verdict: 'unique' | 'duplicate' | 'near_duplicate', matches: DuplicateMatch[] }}
 */
export function compareFingerprint(fp, registry, maxDistance = ticketSafety.nearDuplicateMaxDistance) {
  /** @type {DuplicateMatch[]} */ const exact = [];
  /** @type {DuplicateMatch[]} */ const near = [];
  for (const r of registry) {
    if (r.fileHash && r.fileHash === fp.fileHash) {
      exact.push({ listingId: r.listingId, kind: 'file_hash' });
      continue;
    }
    const sharedCode = fp.codes.find((c) => r.codes?.includes(c));
    if (sharedCode) {
      exact.push({ listingId: r.listingId, kind: 'code', code: sharedCode });
      continue;
    }
    if (fp.imageHash && r.imageHash) {
      const distance = hammingDistance(fp.imageHash, r.imageHash);
      if (distance <= maxDistance) near.push({ listingId: r.listingId, kind: 'image_hash', distance });
    }
  }
  if (exact.length) return { verdict: 'duplicate', matches: exact };
  if (near.length)
    return { verdict: 'near_duplicate', matches: near.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0)) };
  return { verdict: 'unique', matches: [] };
}
