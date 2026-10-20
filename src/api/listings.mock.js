import {
  db,
  save,
  nextId,
  nowIso,
  currentUserRecord,
  setListingStatus,
  setOfferStatus,
  notify,
  ApiError,
} from './mock/db.js';
import { mockCall } from './mock/util.js';
import { enrichListing, findEvent } from './mock/helpers.js';
import { validateListingPrice } from '../lib/pricing.js';
import { compareFingerprint } from '../lib/ticket-fingerprint.js';
import { features } from '../config/features.js';
import { verifySync } from './ticket-ai.mock.js';

/**
 * @typedef {object} CreateListingInput
 * @property {string} eventId
 * @property {string} tierId
 * @property {number} quantity 1-6, sold together
 * @property {number} pricePence per ticket, capped at face value
 * @property {'pdf' | 'transfer'} delivery
 * @property {string} [transferPlatform]
 * @property {string} [fileKey]
 * @property {string} [fileName]
 * @property {import('../types/index.js').BarcodeCheck} [barcodeCheck]
 * @property {boolean} declarationsAccepted
 * @property {import('../lib/ticket-fingerprint.js').Fingerprint} [fingerprint] client hint; the real backend recomputes from the stored file
 * @property {import('../lib/ticket-match.js').ExtractedTicket} [extraction] set when the seller used AI autofill and confirmed the details
 */

/** GET /listings/:id @param {string} id */
export function getListing(id) {
  return mockCall(() => {
    const l = db.listings.find((x) => x.id === id);
    if (!l) throw new ApiError(404, 'Listing not found.', 'not_found');
    return enrichListing(l);
  });
}

/** POST /listings @param {CreateListingInput} input */
export function createListing(input) {
  return mockCall(() => {
    const me = currentUserRecord();
    const event = findEvent(input.eventId);
    const tier = event.tiers.find((t) => t.id === input.tierId);
    if (!tier) throw new ApiError(400, 'Choose a ticket type.');
    if (new Date(event.endsAt).getTime() <= Date.now()) throw new ApiError(400, 'That event has already finished.');
    if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 6)
      throw new ApiError(400, 'Quantity must be 1 to 6.');
    if (!input.declarationsAccepted) throw new ApiError(400, 'Please accept the declarations.');
    const price = validateListingPrice(input.pricePence, tier.faceValuePence);
    if (!price.ok)
      throw new ApiError(
        400,
        price.reason === 'above_cap' ? 'Price cannot be above face value.' : 'Enter a valid price.',
        price.reason,
      );
    if (input.delivery === 'pdf') {
      if (!input.fileKey) throw new ApiError(400, 'Upload your ticket first.');
      if (input.barcodeCheck === 'rejected') throw new ApiError(400, 'That ticket file failed our checks.');
    }
    // Authoritative checks run here, at publish time, not just at upload: an exact duplicate is blocked outright,
    // anything suspicious is routed to a person. Checks can only ever send a listing to review; they never approve one.
    /** @type {import('../types/index.js').ReviewReason[]} */
    const reasons = [];
    if (input.delivery === 'pdf') {
      if (input.barcodeCheck && input.barcodeCheck !== 'passed')
        reasons.push({
          source: 'barcode',
          code: input.barcodeCheck,
          message: 'Barcode could not be read automatically.',
        });
      if (features.duplicateDetection && input.fingerprint) {
        const registry = db.ticketFingerprints.filter(
          (r) => db.listings.find((l) => l.id === r.listingId)?.status !== 'removed',
        );
        const dup = compareFingerprint(input.fingerprint, registry);
        if (dup.verdict === 'duplicate')
          throw new ApiError(409, 'This ticket has already been listed on StudentSwap.', 'duplicate_ticket');
        if (dup.verdict === 'near_duplicate') {
          const sim = Math.round((1 - (dup.matches[0].distance ?? 0) / 64) * 100);
          reasons.push({
            source: 'duplicate',
            code: 'near_duplicate',
            message: `Visually ${sim}% similar to another listed ticket.`,
            detail: dup.matches[0],
          });
        }
      }
      if (features.aiTicketChecks) {
        const { flags } = verifySync({
          fileName: input.fileKey ? db.files[input.fileKey]?.name : input.fileName,
          event,
          tier,
          extracted: input.extraction,
        });
        for (const f of flags) reasons.push({ source: 'ai', code: f.code, severity: f.severity, message: f.message });
      }
    }
    const status =
      input.delivery === 'pdf' && (input.barcodeCheck !== 'passed' || reasons.length) ? 'under_review' : 'active';
    const listing = {
      id: nextId('listing'),
      eventId: event.id,
      tierId: tier.id,
      sellerId: me.id,
      quantity: input.quantity,
      pricePence: input.pricePence,
      faceValuePence: tier.faceValuePence,
      delivery: input.delivery,
      transferPlatform: input.transferPlatform,
      fileKey: input.fileKey,
      fileName: input.fileName,
      barcodeCheck: input.barcodeCheck,
      reviewReasons: reasons,
      aiAssisted: !!input.extraction,
      status: /** @type {any} */ ('draft'),
      createdAt: nowIso(),
    };
    db.listings.push(listing);
    setListingStatus(listing, status);
    if (input.fingerprint) db.ticketFingerprints.push({ listingId: listing.id, ...input.fingerprint });
    // Tell anyone waiting for tickets to this event.
    if (status === 'active') {
      for (const a of db.alerts.filter((x) => x.eventId === event.id && x.userId !== me.id)) {
        notify(
          a.userId,
          'alert',
          'Tickets just dropped',
          `New tickets for ${event.title} are on sale.`,
          `#/event/${event.id}`,
        );
      }
    }
    save();
    return enrichListing(listing);
  });
}

/** GET /me/listings */
export function myListings() {
  return mockCall(() => {
    const me = currentUserRecord();
    return db.listings
      .filter((l) => l.sellerId === me.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(enrichListing);
  });
}

/** PATCH /listings/:id @param {string} id @param {{ pricePence: number }} patch */
export function updateListing(id, patch) {
  return mockCall(() => {
    const me = currentUserRecord();
    const l = db.listings.find((x) => x.id === id);
    if (!l || l.sellerId !== me.id) throw new ApiError(404, 'Listing not found.', 'not_found');
    if (!['active', 'under_review'].includes(l.status))
      throw new ApiError(409, 'This listing can no longer be edited.');
    const price = validateListingPrice(patch.pricePence, l.faceValuePence);
    if (!price.ok)
      throw new ApiError(
        400,
        price.reason === 'above_cap' ? 'Price cannot be above face value.' : 'Enter a valid price.',
        price.reason,
      );
    l.pricePence = patch.pricePence;
    save();
    return enrichListing(l);
  });
}

/** DELETE /listings/:id (delist) @param {string} id */
export function delistListing(id) {
  return mockCall(() => {
    const me = currentUserRecord();
    const l = db.listings.find((x) => x.id === id);
    if (!l || l.sellerId !== me.id) throw new ApiError(404, 'Listing not found.', 'not_found');
    if (!['active', 'under_review'].includes(l.status))
      throw new ApiError(409, 'This listing can no longer be removed.');
    setListingStatus(l, 'removed');
    // Offers on a delisted ticket can't be fulfilled; tell the buyers.
    for (const o of db.offers.filter((x) => x.listingId === l.id && ['open', 'accepted'].includes(x.status))) {
      setOfferStatus(o, 'expired');
      notify(
        o.buyerId,
        'offer',
        'Tickets no longer available',
        'The seller removed the tickets you made an offer on.',
        '#/account/offers',
      );
    }
    save();
    return enrichListing(l);
  });
}
