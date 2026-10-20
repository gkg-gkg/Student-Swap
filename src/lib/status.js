// Explicit state machines. The backend must enforce the same tables; the frontend uses them
// to decide which actions to offer.

/** @type {Record<string, string[]>} */
export const listingTransitions = {
  draft: ['under_review', 'active', 'removed'],
  under_review: ['active', 'removed'],
  active: ['reserved', 'sold', 'expired', 'removed'],
  reserved: ['active', 'sold', 'expired'],
  sold: [],
  expired: [],
  removed: [],
};

/** @type {Record<string, string[]>} */
export const offerTransitions = {
  open: ['accepted', 'declined', 'expired'],
  accepted: ['expired'], // buyer ran out of time to check out
  declined: [],
  expired: [],
};

/** @type {Record<string, string[]>} */
export const orderTransitions = {
  pending_payment: ['paid', 'cancelled'],
  paid: ['delivered', 'reported', 'refunded'],
  delivered: ['reported', 'completed'],
  reported: ['refunded', 'completed'],
  refunded: [],
  completed: [],
  cancelled: [],
};

/** @type {Record<string, string[]>} */
export const payoutTransitions = {
  held: ['eligible', 'frozen'],
  eligible: ['released', 'frozen'],
  frozen: ['eligible'], // report denied: seller gets paid. A refund leaves it frozen (voided).
  released: [],
};

/** @param {Record<string, string[]>} machine @param {string} from @param {string} to */
export const canTransition = (machine, from, to) => machine[from]?.includes(to) ?? false;

/** @param {Record<string, string[]>} machine @param {string} from @param {string} to */
export function assertTransition(machine, from, to) {
  if (!canTransition(machine, from, to)) throw new Error(`Illegal transition: ${from} -> ${to}`);
}

/** Order states from which a buyer may still report a problem. */
export const reportableOrderStates = ['paid', 'delivered'];
