// Generated ticket files, so the tests don't need real (personal) tickets checked in.
import QRCode from 'qrcode';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import * as mupdf from 'mupdf';

/** A PNG ticket: some text and a QR code. @param {string} code @param {number} [width] */
export const qrPng = async (code, width = 320) => new Uint8Array(await QRCode.toBuffer(code, { width, margin: 4 }));

/** A one-page PDF ticket with a QR code, the way ticketing sites send them. @param {string} code */
export async function qrPdf(code) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([420, 595]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('FRESHERS FOAM PARTY  -  ROSIES, BIRMINGHAM', { x: 30, y: 540, size: 12, font });
  page.drawText('General release  -  £12.00', { x: 30, y: 520, size: 11, font });
  page.drawImage(await pdf.embedPng(await qrPng(code)), { x: 60, y: 160, width: 300, height: 300 });
  return pdf.save();
}

/**
 * A ticket-like image with NO barcode (e.g. a screenshot where the code is cut off), drawn at any size.
 * The same `seed` at two sizes looks the same to a person, so the perceptual hash should call it a near duplicate.
 * @param {number} w @param {number} h @param {number} seed
 */
export function patternPng(w, h, seed) {
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, w, h], false);
  const px = pix.getPixels();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const val = Math.floor(
        127 + 120 * Math.sin(seed * 3.1 * u + 5.3 * v * ((seed % 3) + 1)) * Math.cos(2.2 * u * seed),
      );
      const i = (y * w + x) * 3;
      px[i] = val;
      px[i + 1] = 255 - val;
      px[i + 2] = (val * 7) % 256;
    }
  return new Uint8Array(pix.asPNG());
}
