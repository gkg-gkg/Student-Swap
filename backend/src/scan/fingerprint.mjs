// Fingerprint a ticket file on the server, from the stored bytes (the browser's own fingerprint is never trusted).
//  - fileHash: SHA-256 of the exact bytes
//  - imageHash: 64-bit dHash of the rendered ticket (page 1 for PDFs), via dHashFromGrayscale in src/lib
//  - codes: QR / barcode values, normalised with normalizeTicketCode
// Pure WebAssembly (MuPDF to open PDFs and images, ZXing to read codes), so it runs on Lambda without native builds.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as mupdf from 'mupdf';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import { dHashFromGrayscale, normalizeTicketCode } from '../../../src/lib/ticket-fingerprint.js';

// Load ZXing's .wasm from disk: the default would fetch it from a CDN, and the scan Lambda has no internet access.
const require = createRequire(import.meta.url);
const wasm = readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm'));
prepareZXingModule({
  overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) },
});

const FORMATS = /** @type {const} */ (['QRCode', 'Code128', 'Code39', 'EAN13', 'PDF417', 'Aztec', 'DataMatrix']);
const MAX_SIDE = 2400; // rendering bigger than this doesn't help decoding and costs memory

/** What the bytes really are, whatever the upload claimed. @param {Uint8Array} b */
export function sniffType(b) {
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf'; // %PDF
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  return null;
}

/**
 * @param {Uint8Array} bytes
 * @returns {Promise<{ type: string, fingerprint: import('../../../src/lib/ticket-fingerprint.js').Fingerprint }>}
 * Throws if the file can't be opened as a PDF or image.
 */
export async function fingerprintTicket(bytes) {
  const type = sniffType(bytes);
  if (!type) throw new Error('unsupported file type');
  const fileHash = createHash('sha256').update(bytes).digest('hex');

  const doc = mupdf.Document.openDocument(bytes, type);
  try {
    if (doc.countPages() < 1) throw new Error('no pages');
    const page = doc.loadPage(0);
    const [x0, y0, x1, y1] = page.getBounds();
    // PDFs are vector: render at ~144 dpi so small QR codes decode. Images: native size, capped.
    const want = type === 'application/pdf' ? 2 : 1;
    const scale = Math.min(want, MAX_SIDE / Math.max(x1 - x0, y1 - y0, 1));
    const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
    const imageHash = dHashFromGrayscale(
      grayThumb(pix.getPixels(), pix.getWidth(), pix.getHeight(), pix.getNumberOfComponents()),
    );
    const found = await readBarcodes(pix.asPNG(), { tryHarder: true, formats: [...FORMATS], maxNumberOfSymbols: 8 });
    const codes = [...new Set(found.map((r) => normalizeTicketCode(r.text)).filter(Boolean))];
    return { type, fingerprint: { fileHash, imageHash, codes } };
  } finally {
    doc.destroy?.();
  }
}

/**
 * Area-average an RGB(A) image down to the 9x8 grayscale thumbnail dHash needs (72 values, row-major).
 * @param {Uint8Array | Uint8ClampedArray} px @param {number} w @param {number} h @param {number} n components per pixel
 */
export function grayThumb(px, w, h, n) {
  const out = new Array(72).fill(0);
  for (let ty = 0; ty < 8; ty++) {
    const ya = Math.floor((ty * h) / 8);
    const yb = Math.max(ya + 1, Math.floor(((ty + 1) * h) / 8));
    for (let tx = 0; tx < 9; tx++) {
      const xa = Math.floor((tx * w) / 9);
      const xb = Math.max(xa + 1, Math.floor(((tx + 1) * w) / 9));
      let sum = 0;
      let count = 0;
      for (let y = ya; y < yb; y++)
        for (let x = xa; x < xb; x++) {
          const i = (y * w + x) * n;
          sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          count++;
        }
      out[ty * 9 + tx] = sum / count;
    }
  }
  return out;
}
