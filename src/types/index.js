// Shared types as JSDoc typedefs (checked by `tsc --checkJs`). Money = integer pence; times = ISO UTC.

/** @typedef {{ id: string, name: string, live: boolean }} Region */
/** @typedef {{ id: string, regionId: string, name: string }} City */
/** @typedef {{ id: string, cityId: string, name: string, short: string, emailDomains: string[] }} University */

/** @typedef {'club_night' | 'ball' | 'social' | 'gig'} EventType */
/** @typedef {'coral' | 'blue' | 'amber' | 'mint' | 'night'} ArtTone */

/** @typedef {{ id: string, name: string, faceValuePence: number }} TicketTier */

/**
 * Event as stored. Admin-curated.
 * @typedef {object} EventRecord
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string} venue
 * @property {string} cityId
 * @property {string[]} universityIds
 * @property {EventType} type
 * @property {string} startsAt ISO UTC (doors)
 * @property {string} lastEntryAt ISO UTC
 * @property {string} endsAt ISO UTC
 * @property {string} ageRestriction e.g. "18+"
 * @property {string} idRequirement
 * @property {TicketTier[]} tiers
 * @property {ArtTone} tone
 */

/**
 * Event with live market stats (what the list endpoint returns).
 * @typedef {EventRecord & { faceValuePence: number, lowestPricePence: number, ticketsAvailable: number, sellingFast: boolean }} AppEvent
 */

/** @typedef {'user' | 'admin'} Role */
/** @typedef {{ tone: ArtTone, initials: string }} Avatar */

/**
 * @typedef {object} User
 * @property {string} id
 * @property {string} email
 * @property {string} displayName
 * @property {string} universityId
 * @property {Avatar} avatar
 * @property {Role} role
 * @property {string} createdAt
 * @property {boolean} profileComplete
 * @property {number} ratingAvg 0-5
 * @property {number} ratingCount
 * @property {number} completedSales
 * @property {{ offers: boolean, orders: boolean, alerts: boolean, marketing: boolean }} notificationPrefs
 */

/** Public, non-sensitive view of a seller. @typedef {Pick<User, 'id' | 'displayName' | 'universityId' | 'avatar' | 'ratingAvg' | 'ratingCount' | 'completedSales' | 'createdAt'>} SellerSummary */

/** @typedef {'pdf' | 'transfer'} DeliveryMethod */
/** @typedef {'checking' | 'passed' | 'needs_review' | 'rejected'} BarcodeCheck */
/** @typedef {'draft' | 'under_review' | 'active' | 'reserved' | 'sold' | 'expired' | 'removed'} ListingStatusValue */

/**
 * @typedef {object} Listing
 * @property {string} id
 * @property {string} eventId
 * @property {string} tierId
 * @property {string} sellerId
 * @property {number} quantity tickets sold together as one bundle
 * @property {number} pricePence per ticket
 * @property {number} faceValuePence per ticket
 * @property {DeliveryMethod} delivery
 * @property {string} [transferPlatform]
 * @property {string} [fileKey] private S3 key (never public)
 * @property {string} [fileName]
 * @property {BarcodeCheck} [barcodeCheck]
 * @property {ListingStatusValue} status
 * @property {string} [reviewNote]
 * @property {ReviewReason[]} [reviewReasons] automatic checks that sent this listing to review
 * @property {boolean} [aiAssisted] the seller used AI autofill (and confirmed the details)
 * @property {string} createdAt
 */

/**
 * Why a listing is waiting for a person instead of going live.
 * @typedef {object} ReviewReason
 * @property {'barcode' | 'duplicate' | 'ai'} source
 * @property {string} code e.g. needs_review, near_duplicate, details_mismatch, date_passed, looks_edited
 * @property {'low' | 'medium' | 'high'} [severity]
 * @property {string} message plain-English explanation shown to admins
 * @property {unknown} [detail] e.g. the matching listing id and hash distance
 */

/** @typedef {'open' | 'accepted' | 'declined' | 'expired'} OfferStatusValue */
/**
 * @typedef {object} Offer
 * @property {string} id
 * @property {string} listingId
 * @property {string} buyerId
 * @property {string} sellerId
 * @property {number} amountPence per ticket; current figure on the table
 * @property {'buyer' | 'seller'} lastActor who set the current amount
 * @property {OfferStatusValue} status
 * @property {string} createdAt
 * @property {string} expiresAt open offers lapse after this
 * @property {string} [checkoutDeadline] set when accepted
 * @property {{ actor: 'buyer' | 'seller', amountPence: number, at: string }[]} history
 */

/** @typedef {'pending_payment' | 'paid' | 'delivered' | 'reported' | 'refunded' | 'completed' | 'cancelled'} OrderStatusValue */
/**
 * @typedef {object} Order
 * @property {string} id
 * @property {string} listingId
 * @property {string} eventId
 * @property {string} buyerId
 * @property {string} sellerId
 * @property {number} quantity
 * @property {number} unitPence
 * @property {number} buyerFeePence
 * @property {number} totalPence
 * @property {OrderStatusValue} status
 * @property {DeliveryMethod} delivery
 * @property {string} [transferPlatform]
 * @property {string} createdAt
 * @property {string} [holdExpiresAt] pending_payment only
 * @property {string} [paidAt]
 * @property {string} [deliveredAt]
 * @property {string} payoutReleaseAt reports must be filed before this
 * @property {string} [reportId]
 */

/** @typedef {'held' | 'eligible' | 'released' | 'frozen'} PayoutStatusValue */
/**
 * @typedef {object} Payout
 * @property {string} id
 * @property {string} orderId
 * @property {string} sellerId
 * @property {number} grossPence
 * @property {number} cardFeePence Stripe's card fee, paid from the sale
 * @property {number} amountPence what the seller receives
 * @property {PayoutStatusValue} status
 * @property {string} releaseAt
 * @property {string} [releasedAt]
 */

/** @typedef {'not_valid' | 'not_received' | 'wrong_event' | 'duplicate' | 'other'} ReportReason */
/** @typedef {'open' | 'resolved_refund' | 'resolved_denied'} ReportStatusValue */
/**
 * @typedef {object} Report
 * @property {string} id
 * @property {string} orderId
 * @property {string} reporterId
 * @property {ReportReason} reason
 * @property {string} description
 * @property {string[]} evidenceNames
 * @property {ReportStatusValue} status
 * @property {string} createdAt
 * @property {string} [resolutionNote]
 */

/**
 * @typedef {object} Notification
 * @property {string} id
 * @property {string} userId
 * @property {'offer' | 'order' | 'alert' | 'system'} kind
 * @property {string} title
 * @property {string} body
 * @property {string} createdAt
 * @property {boolean} read
 * @property {string} [href]
 */

// Status enums (frozen objects double as runtime values and type sources).
export const ListingStatus = Object.freeze({
  DRAFT: 'draft',
  UNDER_REVIEW: 'under_review',
  ACTIVE: 'active',
  RESERVED: 'reserved',
  SOLD: 'sold',
  EXPIRED: 'expired',
  REMOVED: 'removed',
});
export const OfferStatus = Object.freeze({
  OPEN: 'open',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  EXPIRED: 'expired',
});
export const OrderStatus = Object.freeze({
  PENDING_PAYMENT: 'pending_payment',
  PAID: 'paid',
  DELIVERED: 'delivered',
  REPORTED: 'reported',
  REFUNDED: 'refunded',
  COMPLETED: 'completed',
  // Not in the original brief: a lapsed checkout hold needs somewhere to go.
  CANCELLED: 'cancelled',
});
export const PayoutStatus = Object.freeze({
  HELD: 'held',
  ELIGIBLE: 'eligible',
  RELEASED: 'released',
  FROZEN: 'frozen',
});
