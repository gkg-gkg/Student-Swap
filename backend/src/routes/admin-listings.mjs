// Admin review queue for listings the automatic checks flagged. Pulled forward from step 5: without it, a flagged
// listing could never go live. Mirrors reviewQueue / reviewListing in src/api/admin.mock.js.
import { assertTransition, listingTransitions } from '../../../src/lib/status.js';
import { ApiError, badRequest, notFound } from '../http/errors.mjs';
import { loadListings } from '../queries.mjs';

/** @type {import('../http/router.mjs').Route[]} */
export const adminListingRoutes = [
  /** Oldest first, each with its review reasons and the file's name and size (never a public URL). */
  [
    'GET',
    '/admin/listings/review',
    'admin',
    async ({ db, viewer }) => {
      const list = await loadListings(db.query, `l.status = 'under_review' order by l.created_at`, [], viewer);
      const keys = list.map((l) => /** @type {any} */ (l).fileKey).filter(Boolean);
      const files = keys.length
        ? await db.query('select key, file_name, size_bytes from uploads where key = any($1)', [keys])
        : [];
      const byKey = new Map(files.map((f) => [f.key, { name: f.file_name, size: f.size_bytes }]));
      return list.map((l) => ({ ...l, file: byKey.get(/** @type {any} */ (l).fileKey) ?? null }));
    },
  ],

  /** POST /admin/listings/:id/review { decision, note? }. Rejecting needs a reason the seller can act on. */
  [
    'POST',
    '/admin/listings/:id/review',
    'admin',
    async ({ db, viewer, params, body }) => {
      const decision = body.decision;
      const note = String(body.note ?? '').trim();
      if (!['approve', 'reject'].includes(decision)) throw badRequest('Choose approve or reject.');
      if (decision === 'reject' && !note) throw badRequest('Add a reason so the seller knows what to fix.');
      await db.tx(async (tx) => {
        const l = await tx.one('select status from listings where id = $1 for update', [params.id]);
        if (!l) throw notFound('Listing');
        if (l.status !== 'under_review') throw new ApiError(409, 'This listing is not awaiting review.');
        const to = decision === 'approve' ? 'active' : 'removed';
        assertTransition(listingTransitions, l.status, to);
        await tx.query('update listings set status = $2, review_note = $3, updated_at = now() where id = $1', [
          params.id,
          to,
          note || null,
        ]);
        // Telling the seller (in-app + email) arrives with notifications in step 5.
      });
      const [l] = await loadListings(db.query, 'l.id = $1', [params.id], viewer);
      return l;
    },
  ],

  /** POST /admin/listings/:id/file-url -> { url, expiresInSeconds }: a fresh 60-second link to the private ticket file. */
  [
    'POST',
    '/admin/listings/:id/file-url',
    'admin',
    async ({ db, storage, params }) => {
      const row = await db.one(
        `select u.key, u.file_name from listings l join uploads u on u.key = l.file_key where l.id = $1`,
        [params.id],
      );
      if (!row) throw notFound('Ticket file');
      return {
        url: await storage.presignGet({ key: row.key, fileName: row.file_name, expiresIn: 60 }),
        expiresInSeconds: 60,
      };
    },
  ],
];
