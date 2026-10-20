import {
  db,
  save,
  nextId,
  nowIso,
  currentUserRecord,
  setOrderStatus,
  setPayoutStatus,
  notify,
  ApiError,
} from './mock/db.js';
import { mockCall } from './mock/util.js';
import { eventSummary, findEvent, publicUserById } from './mock/helpers.js';
import { reportableOrderStates } from '../lib/status.js';

const REASONS = ['not_valid', 'not_received', 'wrong_event', 'duplicate', 'other'];

/** @param {any} r */
function enrichReport(r) {
  const o = db.orders.find((x) => x.id === r.orderId);
  return {
    ...r,
    order: o ?? null,
    event: o ? eventSummary(findEvent(o.eventId)) : null,
    seller: o ? publicUserById(o.sellerId) : null,
  };
}

/**
 * POST /reports: freezes the payout and marks the order reported.
 * @param {{ orderId: string, reason: string, description: string, evidenceNames: string[] }} input
 */
export function createReport({ orderId, reason, description, evidenceNames }) {
  return mockCall(() => {
    const me = currentUserRecord();
    const o = db.orders.find((x) => x.id === orderId);
    if (!o || o.buyerId !== me.id) throw new ApiError(404, 'Order not found.', 'not_found');
    if (!reportableOrderStates.includes(o.status)) throw new ApiError(409, 'This order can no longer be reported.');
    if (new Date(o.payoutReleaseAt).getTime() <= Date.now())
      throw new ApiError(409, 'The reporting window for this order has closed.', 'window_closed');
    if (!REASONS.includes(reason)) throw new ApiError(400, 'Choose a reason.');
    if (description.trim().length < 20)
      throw new ApiError(400, 'Please describe the problem in at least 20 characters.');
    const report = {
      id: nextId('report'),
      orderId,
      reporterId: me.id,
      reason,
      description: description.trim(),
      evidenceNames,
      status: /** @type {const} */ ('open'),
      createdAt: nowIso(),
      resolutionNote: undefined,
    };
    db.reports.push(report);
    setOrderStatus(o, 'reported');
    o.reportId = report.id;
    const p = db.payouts.find((x) => x.orderId === o.id);
    if (p) setPayoutStatus(p, 'frozen');
    notify(
      o.sellerId,
      'order',
      'A buyer reported a problem',
      'Your payout is paused while we look into it.',
      '#/account/payouts',
    );
    save();
    return enrichReport(report);
  });
}

/** GET /reports/:id @param {string} id */
export function getReport(id) {
  return mockCall(() => {
    const me = currentUserRecord();
    const r = db.reports.find((x) => x.id === id);
    if (!r || (r.reporterId !== me.id && me.role !== 'admin'))
      throw new ApiError(404, 'Report not found.', 'not_found');
    return enrichReport(r);
  });
}

/** GET /me/reports */
export function myReports() {
  return mockCall(() => {
    const me = currentUserRecord();
    return db.reports
      .filter((r) => r.reporterId === me.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(enrichReport);
  });
}
