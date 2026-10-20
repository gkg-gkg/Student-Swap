// Display labels for enums. Copy lives here, not scattered across pages.

export const eventTypeLabels = /** @type {Record<string, string>} */ ({
  club_night: 'Club night',
  ball: 'Ball',
  social: 'Social',
  gig: 'Gig',
});

export const reportReasonLabels = /** @type {Record<string, string>} */ ({
  not_valid: 'The ticket is not valid',
  not_received: "I didn't receive my ticket",
  wrong_event: "It's for the wrong event or date",
  duplicate: 'The ticket was already used or sold twice',
  other: 'Something else',
});

/** @type {Record<string, Record<string, [string, string]>>} kind -> status -> [label, badge tone] */
export const statusLabels = {
  listing: {
    draft: ['Draft', 'muted'],
    under_review: ['Under review', 'warn'],
    active: ['Live', 'ok'],
    reserved: ['In checkout', 'blue'],
    sold: ['Sold', 'muted'],
    expired: ['Expired', 'muted'],
    removed: ['Removed', 'muted'],
  },
  offer: {
    open: ['Open', 'blue'],
    accepted: ['Accepted', 'ok'],
    declined: ['Declined', 'muted'],
    expired: ['Expired', 'muted'],
  },
  order: {
    pending_payment: ['Awaiting payment', 'warn'],
    paid: ['Paid', 'blue'],
    delivered: ['Tickets delivered', 'ok'],
    reported: ['Problem reported', 'hot'],
    refunded: ['Refunded', 'muted'],
    completed: ['Completed', 'muted'],
    cancelled: ['Cancelled', 'muted'],
  },
  payout: {
    held: ['Held until after the event', 'blue'],
    eligible: ['Ready to release', 'ok'],
    released: ['Paid out', 'ok'],
    frozen: ['Paused: report open', 'hot'],
  },
  report: {
    open: ['In review', 'warn'],
    resolved_refund: ['Refund approved', 'ok'],
    resolved_denied: ['Closed: no refund', 'muted'],
  },
  barcode: {
    checking: ['Checking…', 'blue'],
    passed: ['Barcode verified', 'ok'],
    needs_review: ['Needs a human check', 'warn'],
    rejected: ['Rejected', 'hot'],
  },
};
