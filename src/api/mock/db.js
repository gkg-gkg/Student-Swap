// In-memory mock database, persisted to localStorage so demo flows survive a refresh.
// Mirrors what the real backend (Lambda + DB) will own: all rules live here, not in pages.
import { buildSeed, DB_VERSION } from '../../data/seed.js';
import { pricing } from '../../config/pricing.js';
import {
  assertTransition,
  listingTransitions,
  offerTransitions,
  orderTransitions,
  payoutTransitions,
} from '../../lib/status.js';

const DB_KEY = 'ss.mockdb';
const SESSION_KEY = 'ss.session';

export class ApiError extends Error {
  /** @param {number} status @param {string} message @param {string} [code] */
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const store = {
  /** @param {string} k */ get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  /** @param {string} k @param {string | null} v */ set(k, v) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* storage blocked: demo state just won't persist */
    }
  },
};

function load() {
  const raw = store.get(DB_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.version === DB_VERSION) return parsed;
    } catch {
      /* fall through to a fresh seed */
    }
  }
  return buildSeed();
}

/** @type {ReturnType<typeof buildSeed>} */
export let db = load();

export const save = () => store.set(DB_KEY, JSON.stringify(db));
if (!store.get(DB_KEY)) save(); // persist the fresh seed straight away so reloads see the same data

export function resetDb() {
  db = buildSeed();
  store.set(SESSION_KEY, null);
  save();
}

// ----- session (stands in for the Cognito token) -----
export const getSessionUserId = () => store.get(SESSION_KEY);
export const setSessionUserId = (/** @type {string | null} */ id) => store.set(SESSION_KEY, id);

/** @returns {any} the signed-in user record (with private fields) */
export function currentUserRecord() {
  const id = getSessionUserId();
  const u = id && db.users.find((x) => x.id === id);
  if (!u) throw new ApiError(401, 'Please sign in.', 'unauthenticated');
  return u;
}

export function requireAdmin() {
  const u = currentUserRecord();
  if (u.role !== 'admin') throw new ApiError(403, 'Admins only.', 'forbidden');
  return u;
}

/** Strip private fields (password, email) for other users to see. @param {any} u */
export const sellerSummary = (u) => ({
  id: u.id,
  displayName: u.displayName,
  universityId: u.universityId,
  avatar: u.avatar,
  ratingAvg: u.ratingAvg,
  ratingCount: u.ratingCount,
  completedSales: u.completedSales,
  createdAt: u.createdAt,
});

/** The signed-in user's own view. @param {any} u */
export const privateUser = (u) => {
  const { password: _pw, confirmed: _c, ...rest } = u;
  return rest;
};

/** @param {keyof typeof db.counters} kind */
export const nextId = (kind) => {
  db.counters[kind] += 1;
  return `${kind[0]}-${db.counters[kind]}`;
};

export const nowIso = () => new Date().toISOString();
export const addHours = (/** @type {string | number} */ from, /** @type {number} */ h) =>
  new Date(new Date(from).getTime() + h * 3600000).toISOString();

// ----- state changes go through these so every transition is validated -----
/** @param {any} l @param {string} to */
export function setListingStatus(l, to) {
  assertTransition(listingTransitions, l.status, to);
  l.status = to;
}
/** @param {any} o @param {string} to */
export function setOfferStatus(o, to) {
  assertTransition(offerTransitions, o.status, to);
  o.status = to;
}
/** @param {any} o @param {string} to */
export function setOrderStatus(o, to) {
  assertTransition(orderTransitions, o.status, to);
  o.status = to;
}
/** @param {any} p @param {string} to */
export function setPayoutStatus(p, to) {
  assertTransition(payoutTransitions, p.status, to);
  p.status = to;
}

/** @param {string} userId @param {'offer'|'order'|'alert'|'system'} kind @param {string} title @param {string} body @param {string} [href] */
export function notify(userId, kind, title, body, href) {
  db.notifications.unshift({
    id: nextId('notification'),
    userId,
    kind,
    title,
    body,
    createdAt: nowIso(),
    read: false,
    href,
  });
}

/**
 * Stands in for scheduled jobs (EventBridge Scheduler in AWS): lapse holds and offers,
 * expire listings for finished events, release payouts. Runs at the start of every mock call.
 */
export function sweep() {
  const now = Date.now();
  let changed = false;

  for (const o of db.orders) {
    if (o.status === 'pending_payment' && o.holdExpiresAt && new Date(o.holdExpiresAt).getTime() <= now) {
      setOrderStatus(o, 'cancelled');
      const l = db.listings.find((x) => x.id === o.listingId);
      if (l && l.status === 'reserved') setListingStatus(l, 'active');
      changed = true;
    }
  }
  for (const of of db.offers) {
    if (of.status === 'open' && new Date(of.expiresAt).getTime() <= now) {
      setOfferStatus(of, 'expired');
      changed = true;
    }
    if (of.status === 'accepted' && of.checkoutDeadline && new Date(of.checkoutDeadline).getTime() <= now) {
      setOfferStatus(of, 'expired');
      changed = true;
    }
  }
  for (const l of db.listings) {
    const e = db.events.find((x) => x.id === l.eventId);
    if (e && ['active', 'under_review', 'draft'].includes(l.status) && new Date(e.endsAt).getTime() <= now) {
      setListingStatus(l, l.status === 'active' ? 'expired' : 'removed');
      changed = true;
    }
  }
  for (const p of db.payouts) {
    if (p.status === 'held' && new Date(p.releaseAt).getTime() <= now) {
      setPayoutStatus(p, 'eligible');
      changed = true;
    }
    if (p.status === 'eligible') {
      setPayoutStatus(p, 'released');
      p.releasedAt = nowIso();
      const seller = db.users.find((u) => u.id === p.sellerId);
      if (seller) seller.completedSales += 1;
      const o = db.orders.find((x) => x.id === p.orderId);
      if (o && o.status === 'delivered') setOrderStatus(o, 'completed');
      changed = true;
    }
  }
  if (changed) save();
}

export const HOLD_SECONDS = pricing.checkoutHoldSeconds;
