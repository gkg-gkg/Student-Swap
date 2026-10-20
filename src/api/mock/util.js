// Mock helpers: simulated latency, and opt-in failures for exercising error states.
import { sweep } from './db.js';

/** @param {number} [ms] */
export const delay = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

/** Add `?fail=1` (before the #) to force mock errors while testing error UI. */
export const shouldFail = () => new URLSearchParams(location.search).has('fail');

/**
 * Wrap every mock call: latency, housekeeping sweep, optional forced failure.
 * @template T @param {() => T} fn @param {{ ms?: number }} [opts] @returns {Promise<T>}
 */
export async function mockCall(fn, { ms = 300 } = {}) {
  await delay(ms);
  if (shouldFail()) throw new Error('Mock failure (remove ?fail from the URL)');
  sweep();
  return fn();
}
