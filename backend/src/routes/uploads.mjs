// Handoff step 3, uploads. The browser asks for a presigned URL, PUTs the file straight to the private bucket, then
// polls GET /uploads/check while the ticket-scan Lambda (src/scan/handler.mjs) reads it.
import { randomUUID } from 'node:crypto';
import { badRequest, notFound } from '../http/errors.mjs';

export const MAX_BYTES = 10 * 1024 * 1024;
const EXT = /** @type {Record<string, string>} */ ({
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
});

/** @type {import('../http/router.mjs').Route[]} */
export const uploadRoutes = [
  /** POST /uploads/presign { fileName, contentType, size, purpose } -> { uploadUrl, key } */
  [
    'POST',
    '/uploads/presign',
    'user',
    async ({ db, storage, user, body }) => {
      const { fileName, contentType, size, purpose } = body;
      if (!['ticket', 'evidence'].includes(purpose)) throw badRequest('Unknown upload type.');
      if (!EXT[contentType]) throw badRequest('Use a PDF, PNG or JPG file.');
      if (!Number.isInteger(size) || size <= 0) throw badRequest('That file looks empty.');
      if (size > MAX_BYTES) throw badRequest('File is too large (10 MB max).');
      const name =
        String(fileName ?? 'ticket')
          .replace(/[^\w. -]/g, '_')
          .slice(0, 120) || 'ticket';
      // Namespaced by user so one account can never read or overwrite another's files.
      const key = `${purpose}s/${user.id}/${randomUUID()}.${EXT[contentType]}`;
      await db.query(
        `insert into uploads (key, owner_id, purpose, file_name, content_type, size_bytes) values ($1, $2, $3, $4, $5, $6)`,
        [key, user.id, purpose, name, contentType, size],
      );
      return { uploadUrl: await storage.presignPut({ key, contentType, size }), key };
    },
  ],

  /** GET /uploads/check?key= -> { result, message, reasons }. "checking" until the scan has finished; the UI polls. */
  [
    'GET',
    '/uploads/check',
    'user',
    async ({ db, user, query }) => {
      const row = await db.one('select status, message, reasons from uploads where key = $1 and owner_id = $2', [
        String(query.key ?? ''),
        user.id,
      ]);
      if (!row) throw notFound('Upload');
      return {
        result: row.status,
        message: row.message ?? (row.status === 'checking' ? 'Checking your ticket…' : ''),
        reasons: row.reasons ?? [],
      };
    },
  ],
];
