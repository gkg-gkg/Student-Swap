// Opaque ids (handoff §2). A short readable prefix helps when reading logs; the rest is random.
import { randomUUID } from 'node:crypto';

/** @param {string} prefix e.g. "evt", "lst" */
export const newId = (prefix) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
