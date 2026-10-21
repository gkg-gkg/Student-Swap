import {
  db,
  save,
  notify,
  requireAdmin,
  setListingStatus,
  setOrderStatus,
  setPayoutStatus,
  nextId,
  ApiError,
} from './mock/db.js';
import { mockCall } from './mock/util.js';
import { enrichListing, eventSummary, findEvent, publicUserById } from './mock/helpers.js';
import { universities, venues } from '../data/regions.js';

/** GET /admin/listings/review */
export function reviewQueue() {
  return mockCall(() => {
    requireAdmin();
    return db.listings
      .filter((l) => l.status === 'under_review')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((l) => ({
        ...enrichListing(l),
        file: l.fileKey ? (db.files[l.fileKey] ?? { name: l.fileName ?? 'ticket.pdf', size: 0 }) : null,
      }));
  });
}

/** POST /admin/listings/:id/review @param {string} id @param {{ decision: 'approve' | 'reject', note?: string }} input */
export function reviewListing(id, { decision, note }) {
  return mockCall(() => {
    requireAdmin();
    const l = db.listings.find((x) => x.id === id);
    if (!l) throw new ApiError(404, 'Listing not found.', 'not_found');
    if (l.status !== 'under_review') throw new ApiError(409, 'This listing is not awaiting review.');
    if (decision === 'reject' && !note?.trim())
      throw new ApiError(400, 'Add a reason so the seller knows what to fix.');
    setListingStatus(l, decision === 'approve' ? 'active' : 'removed');
    l.reviewNote = note;
    notify(
      l.sellerId,
      'system',
      decision === 'approve' ? 'Your listing is live' : 'Your listing was not approved',
      decision === 'approve' ? 'It passed review and is now on sale.' : `Reason: ${note}`,
      '#/account/listings',
    );
    save();
    return enrichListing(l);
  });
}

/**
 * POST /admin/listings/:id/file-url -> { url, expiresInSeconds }: a fresh 60-second link to the private ticket file.
 * The mock stores no file bytes, so there is nothing to open.
 * @param {string} id @returns {Promise<{ url: string | null, expiresInSeconds: number }>}
 */
export function ticketFileUrl(id) {
  return mockCall(
    () => {
      requireAdmin();
      if (!db.listings.some((l) => l.id === id)) throw new ApiError(404, 'Listing not found.', 'not_found');
      return { url: null, expiresInSeconds: 60 };
    },
    { ms: 150 },
  );
}

/** GET /admin/reports?status=open */
export function reportsQueue() {
  return mockCall(() => {
    requireAdmin();
    return db.reports
      .filter((r) => r.status === 'open')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((r) => {
        const order = db.orders.find((o) => o.id === r.orderId);
        return {
          ...r,
          order,
          event: order ? eventSummary(findEvent(order.eventId)) : null,
          buyer: publicUserById(r.reporterId),
          seller: order ? publicUserById(order.sellerId) : null,
        };
      });
  });
}

/** POST /admin/reports/:id/resolve @param {string} id @param {{ resolution: 'refund' | 'deny', note?: string }} input */
export function resolveReport(id, { resolution, note }) {
  return mockCall(() => {
    requireAdmin();
    const r = db.reports.find((x) => x.id === id);
    if (!r || r.status !== 'open') throw new ApiError(409, 'This report is not open.');
    const order = db.orders.find((o) => o.id === r.orderId);
    const payout = db.payouts.find((p) => p.orderId === r.orderId);
    if (!order) throw new ApiError(404, 'Order not found.');
    if (resolution === 'refund') {
      r.status = 'resolved_refund';
      setOrderStatus(order, 'refunded'); // payout stays frozen: voided, never released
    } else {
      r.status = 'resolved_denied';
      setOrderStatus(order, 'completed');
      if (payout) setPayoutStatus(payout, 'eligible'); // next sweep releases it
    }
    r.resolutionNote = note;
    notify(
      r.reporterId,
      'order',
      resolution === 'refund' ? 'Your refund was approved' : 'Your report was reviewed',
      note ||
        (resolution === 'refund'
          ? 'You will be refunded to your original payment method.'
          : 'We could not find grounds for a refund.'),
      `#/reports/${r.id}`,
    );
    save();
    return r;
  });
}

/** GET /admin/stats: simple per-university numbers */
export function stats() {
  return mockCall(() => {
    requireAdmin();
    const rows = universities.map((u) => {
      const userIds = new Set(db.users.filter((x) => x.universityId === u.id).map((x) => x.id));
      const sold = db.orders.filter(
        (o) => userIds.has(o.sellerId) && ['paid', 'delivered', 'completed'].includes(o.status),
      );
      return {
        universityId: u.id,
        name: u.short,
        users: userIds.size,
        activeListings: db.listings.filter((l) => userIds.has(l.sellerId) && l.status === 'active').length,
        ordersCount: sold.length,
        volumePence: sold.reduce((n, o) => n + o.totalPence, 0),
      };
    });
    const totals = {
      users: db.users.length,
      activeListings: db.listings.filter((l) => l.status === 'active').length,
      openReports: db.reports.filter((r) => r.status === 'open').length,
      awaitingReview: db.listings.filter((l) => l.status === 'under_review').length,
      volumePence: rows.reduce((n, r) => n + r.volumePence, 0),
    };
    return { rows, totals };
  });
}

/** GET /admin/event-requests: events sellers asked for that we don't list yet. */
export function eventRequests() {
  return mockCall(() => {
    requireAdmin();
    return db.eventRequests
      .filter((r) => !r.dismissed)
      .map((r) => ({ ...r, requester: db.users.find((u) => u.id === r.userId)?.displayName ?? 'Unknown' }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
}

/** POST /admin/event-requests/:id/dismiss @param {string} id */
export function dismissEventRequest(id) {
  return mockCall(
    () => {
      requireAdmin();
      const r = db.eventRequests.find((x) => x.id === id);
      if (!r) throw new ApiError(404, 'Request not found.', 'not_found');
      r.dismissed = true;
      save();
      return { ok: true };
    },
    { ms: 150 },
  );
}

/** @typedef {{ title: string, venue: string, venueId?: string, cityId: string, type: string, startsAt: string, durationHours: number, description?: string, ageRestriction?: string, universityIds?: string[], tiers: { name: string, faceValuePence: number }[] }} CreateEventInput */

/**
 * POST /admin/events: events are admin-curated, so this is the only way an event is created.
 * @param {{ title: string, venue: string, venueId?: string, cityId: string, type: string, startsAt: string, durationHours: number, description?: string, ageRestriction?: string, universityIds?: string[], tiers: { name: string, faceValuePence: number }[] }} input
 */
export function createEvent(input) {
  return mockCall(() => {
    requireAdmin();
    if (!input.title?.trim() || !input.venue?.trim()) throw new ApiError(400, 'Title and venue are required.');
    const venue = input.venueId ? venues.find((v) => v.id === input.venueId) : undefined;
    if (input.venueId && (!venue || venue.cityId !== input.cityId))
      throw new ApiError(400, "That venue isn't in the chosen city.");
    if (
      !input.tiers?.length ||
      input.tiers.some((t) => !t.name?.trim() || !Number.isInteger(t.faceValuePence) || t.faceValuePence < 100)
    )
      throw new ApiError(400, 'Add at least one ticket type with an original price of £1 or more.');
    const start = new Date(input.startsAt).getTime();
    if (Number.isNaN(start) || start < Date.now()) throw new ApiError(400, 'Choose a start time in the future.');
    const id = `evt-${nextId('listing')}`;
    const tones = ['coral', 'blue', 'amber', 'mint', 'night'];
    const event = {
      id,
      title: input.title.trim(),
      description: input.description?.trim() || 'More details coming soon.',
      venue: venue ? venue.name : input.venue.trim(),
      venueId: venue?.id ?? null,
      cityId: input.cityId,
      universityIds: input.universityIds ?? [],
      type: /** @type {any} */ (input.type),
      startsAt: new Date(start).toISOString(),
      lastEntryAt: new Date(start + Math.min(2, input.durationHours - 1) * 3600000).toISOString(),
      endsAt: new Date(start + input.durationHours * 3600000).toISOString(),
      ageRestriction: input.ageRestriction || '18+',
      idRequirement: 'Photo ID and student card may be checked on the door.',
      tiers: input.tiers.map((t, i) => ({
        id: `${id}-t${i + 1}`,
        name: t.name.trim(),
        faceValuePence: t.faceValuePence,
      })),
      tone: /** @type {any} */ (tones[db.events.length % tones.length]),
    };
    db.events.push(event);
    save();
    return event;
  });
}
