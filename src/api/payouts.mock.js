import { db, currentUserRecord } from './mock/db.js';
import { mockCall } from './mock/util.js';
import { eventSummary, findEvent } from './mock/helpers.js';

/**
 * GET /me/payouts
 * held = money in escrow until the release date; released = paid to the seller's Stripe account.
 * Frozen payouts (open report) are shown separately and excluded from totals.
 */
export function getPayoutSummary() {
  return mockCall(() => {
    const me = currentUserRecord();
    const items = db.payouts
      .filter((p) => p.sellerId === me.id)
      .map((p) => {
        const order = db.orders.find((o) => o.id === p.orderId);
        return {
          ...p,
          orderStatus: order?.status ?? null,
          event: order ? eventSummary(findEvent(order.eventId)) : null,
        };
      })
      .sort((a, b) => b.releaseAt.localeCompare(a.releaseAt));
    const sum = (/** @type {string[]} */ statuses) =>
      items
        .filter((p) => statuses.includes(p.status) && p.orderStatus !== 'refunded')
        .reduce((n, p) => n + p.amountPence, 0);
    return {
      totals: {
        heldPence: sum(['held']),
        eligiblePence: sum(['eligible']),
        releasedPence: sum(['released']),
        frozenPence: sum(['frozen']),
      },
      items,
    };
  });
}
