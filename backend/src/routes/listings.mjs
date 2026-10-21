// Handoff step 3, listings. Every rule is enforced here, whatever the browser sent (handoff §6, §12): the face-value cap,
// the listing window, payouts being set up, the uploaded file belonging to the seller and passing its scan, and the
// duplicate check, re-run at publish time because other tickets may have been listed since the upload was scanned.
import { validateListingPrice, listingWindow } from '../../../src/lib/pricing.js';
import { assertTransition, listingTransitions } from '../../../src/lib/status.js';
import { ApiError, badRequest, notFound } from '../http/errors.mjs';
import { loadEvent, loadListings } from '../queries.mjs';
import { compareWithListed, duplicateReason, DUPLICATE_MESSAGE } from '../duplicates.mjs';
import { newId } from '../ids.mjs';

const priceError = (/** @type {{ reason: string }} */ p) =>
  badRequest(p.reason === 'above_cap' ? 'Price cannot be above face value.' : 'Enter a valid price.', p.reason);

/**
 * Hook for the Claude ticket checks (handoff step 7, backend-reference/ai-ticket-handler.mjs). Until then it adds no
 * flags. When wired up it can only ADD reasons (sending a listing to review); it can never approve one.
 * @type {(input: { fileKey: string, event: any, tier: any }) => Promise<import('../../../src/types/index.js').ReviewReason[]>}
 */
const aiChecks = async () => [];

/** @type {import('../http/router.mjs').Route[]} */
export const listingRoutes = [
  [
    'GET',
    '/listings/:id',
    'optional',
    async ({ db, params, viewer }) => {
      const [l] = await loadListings(db.query, 'l.id = $1', [params.id], viewer);
      if (!l) throw notFound('Listing');
      return l;
    },
  ],

  [
    'GET',
    '/me/listings',
    'user',
    async ({ db, viewer }) =>
      loadListings(db.query, 'l.seller_id = $1 order by l.created_at desc', [viewer?.id], viewer),
  ],

  /** POST /listings -> EnrichedListing, `active` or `under_review`. 409 duplicate_ticket for an exact duplicate. */
  [
    'POST',
    '/listings',
    'user',
    async ({ db, user, viewer, body, now, config }) => {
      const at = now();
      const id = newId('lst');
      await db.tx(async (tx) => {
        const event = await loadEvent(tx.query, String(body.eventId ?? ''));
        const tier = event.tiers.find((t) => t.id === body.tierId);
        if (!tier) throw badRequest('Choose a ticket type.');
        if (new Date(event.endsAt) <= at) throw badRequest('That event has already finished.');
        // Stripe holds the seller's money until after the event, so they must be able to get paid first.
        if (config.requirePayouts && user.connect_status !== 'complete')
          throw new ApiError(403, 'Set up payouts before you list a ticket.', 'payouts_required');
        if (!listingWindow(event.startsAt, at).ok)
          throw badRequest('You can only list tickets for events in the next few months.', 'too_early');
        if (!Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 6)
          throw badRequest('Quantity must be 1 to 6.');
        if (body.declarationsAccepted !== true) throw badRequest('Please accept the declarations.');
        const price = validateListingPrice(body.pricePence, tier.faceValuePence);
        if (!price.ok) throw priceError(price);
        if (!['pdf', 'transfer'].includes(body.delivery)) throw badRequest('Choose how you will deliver the tickets.');
        const platform = String(body.transferPlatform ?? '')
          .trim()
          .slice(0, 60);
        if (body.delivery === 'transfer' && !platform)
          throw badRequest('Choose the ticketing app you will transfer with.');

        /** @type {import('../../../src/types/index.js').ReviewReason[]} */
        let reasons = [];
        /** @type {any} */
        let upload = null;
        if (body.delivery === 'pdf') {
          if (!body.fileKey) throw badRequest('Upload your ticket first.');
          upload = await tx.one(
            `select key, owner_id, purpose, file_name, status, reasons, file_hash, image_hash, codes
               from uploads where key = $1 for update`,
            [String(body.fileKey)],
          );
          if (!upload || upload.owner_id !== user.id || upload.purpose !== 'ticket')
            throw badRequest('Upload your ticket first.');
          if (upload.status === 'checking' || !upload.file_hash)
            throw new ApiError(409, "We're still checking your ticket. Try again in a moment.", 'scan_pending');
          if (upload.status === 'rejected') throw badRequest('That ticket file failed our checks.');
          if (await tx.one(`select 1 from listings where file_key = $1 and status <> 'removed'`, [upload.key]))
            throw new ApiError(409, DUPLICATE_MESSAGE, 'duplicate_ticket');

          // Serialise publishes of the same ticket, so two listings of one file can't both slip through.
          const lockKeys = [upload.file_hash, ...(upload.codes ?? [])].sort();
          for (const k of lockKeys) await tx.query('select pg_advisory_xact_lock(hashtext($1))', [k]);

          const fingerprint = { fileHash: upload.file_hash, imageHash: upload.image_hash, codes: upload.codes ?? [] };
          const dup = await compareWithListed(tx.query, fingerprint);
          if (dup.verdict === 'duplicate') throw new ApiError(409, DUPLICATE_MESSAGE, 'duplicate_ticket');
          // The scan's own reasons (barcode unreadable, ...), with the duplicate part recomputed just now.
          reasons = (upload.reasons ?? []).filter((/** @type {any} */ r) => r.source !== 'duplicate');
          const near = duplicateReason(dup);
          if (near) reasons.push(near);
          reasons.push(...(await aiChecks({ fileKey: upload.key, event, tier })));
        }

        const status =
          body.delivery === 'pdf' && (upload.status !== 'passed' || reasons.length) ? 'under_review' : 'active';
        assertTransition(listingTransitions, 'draft', status);
        await tx.query(
          `insert into listings (id, event_id, tier_id, seller_id, quantity, price_pence, face_value_pence, delivery,
             transfer_platform, file_key, file_name, barcode_check, status, review_reasons, ai_assisted)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            id,
            event.id,
            tier.id,
            user.id,
            body.quantity,
            body.pricePence,
            tier.faceValuePence,
            body.delivery,
            body.delivery === 'transfer' ? platform : null,
            upload?.key ?? null,
            upload?.file_name ?? null,
            upload?.status ?? null,
            status,
            JSON.stringify(reasons),
            !!body.extraction,
          ],
        );
        if (upload)
          await tx.query(
            'insert into ticket_fingerprints (listing_id, file_hash, image_hash, codes) values ($1, $2, $3, $4)',
            [id, upload.file_hash, upload.image_hash, upload.codes ?? []],
          );
        // "Tickets just dropped" alerts to event_alerts subscribers arrive with notifications (step 5).
      });
      const [created] = await loadListings(db.query, 'l.id = $1', [id], viewer);
      return created;
    },
  ],

  /** PATCH /listings/:id { pricePence }: re-checks the cap; only while active or under review. */
  [
    'PATCH',
    '/listings/:id',
    'user',
    async ({ db, user, viewer, params, body }) => {
      await db.tx(async (tx) => {
        const l = await tx.one('select seller_id, status, face_value_pence from listings where id = $1 for update', [
          params.id,
        ]);
        if (!l || l.seller_id !== user.id) throw notFound('Listing');
        if (!['active', 'under_review'].includes(l.status))
          throw new ApiError(409, 'This listing can no longer be edited.');
        const price = validateListingPrice(body.pricePence, l.face_value_pence);
        if (!price.ok) throw priceError(price);
        await tx.query('update listings set price_pence = $2, updated_at = now() where id = $1', [
          params.id,
          body.pricePence,
        ]);
      });
      const [l] = await loadListings(db.query, 'l.id = $1', [params.id], viewer);
      return l;
    },
  ],

  /** DELETE /listings/:id: delist. (Expiring offers on it arrives with offers in step 5.) */
  [
    'DELETE',
    '/listings/:id',
    'user',
    async ({ db, user, viewer, params }) => {
      await db.tx(async (tx) => {
        const l = await tx.one('select seller_id, status from listings where id = $1 for update', [params.id]);
        if (!l || l.seller_id !== user.id) throw notFound('Listing');
        if (!['active', 'under_review'].includes(l.status))
          throw new ApiError(409, 'This listing can no longer be removed.');
        assertTransition(listingTransitions, l.status, 'removed');
        await tx.query(`update listings set status = 'removed', updated_at = now() where id = $1`, [params.id]);
      });
      const [l] = await loadListings(db.query, 'l.id = $1', [params.id], viewer);
      return l;
    },
  ],
];
