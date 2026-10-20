// Browser-side fingerprinting (UX preflight only; the backend recomputes and is authoritative).
// - SHA-256 of the file, via Web Crypto.
// - dHash of raster images, via canvas.
// - QR/barcode values via the BarcodeDetector API where the browser has it (Chromium); other browsers
//   simply return no codes here and rely on the server-side decoder.
// PDFs are not rasterised in the browser; the server renders page 1 and hashes/decodes that.
import { dHashFromGrayscale, normalizeTicketCode } from './ticket-fingerprint.js';

/** @param {ArrayBuffer} buf */
async function sha256Hex(buf) {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** @param {ImageBitmap} bmp @returns {string} */
function imageDHash(bmp) {
  const canvas = document.createElement('canvas');
  canvas.width = 9;
  canvas.height = 8;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }));
  ctx.drawImage(bmp, 0, 0, 9, 8);
  const { data } = ctx.getImageData(0, 0, 9, 8);
  const gray = [];
  for (let i = 0; i < data.length; i += 4) gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  return dHashFromGrayscale(gray);
}

/** @param {ImageBitmap} bmp @returns {Promise<string[]>} */
async function detectCodes(bmp) {
  const BD = /** @type {any} */ (window).BarcodeDetector;
  if (!BD) return [];
  try {
    const found = await new BD({
      formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'pdf417', 'aztec', 'data_matrix'],
    }).detect(bmp);
    return found.map((/** @type {{ rawValue: string }} */ f) => normalizeTicketCode(f.rawValue)).filter(Boolean);
  } catch {
    return [];
  }
}

/** @param {File} file @returns {Promise<import('./ticket-fingerprint.js').Fingerprint>} */
export async function fingerprintFile(file) {
  const fileHash = await sha256Hex(await file.arrayBuffer());
  let imageHash = null;
  /** @type {string[]} */ let codes = [];
  if (file.type.startsWith('image/')) {
    try {
      const bmp = await createImageBitmap(file);
      imageHash = imageDHash(bmp);
      codes = await detectCodes(bmp);
      bmp.close();
    } catch {
      /* unreadable image: fall back to the file hash alone */
    }
  }
  return { fileHash, imageHash, codes };
}
