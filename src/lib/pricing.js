// Face-value cap validation lives here and nowhere else.
import { pricing } from '../config/pricing.js';

/** Highest allowed listing price in pence. @param {number} faceValuePence */
export const maxPrice = (faceValuePence, multiplier = pricing.maxPriceMultiplier) =>
  Math.floor(faceValuePence * multiplier);

/**
 * @param {number} pricePence
 * @param {number} faceValuePence
 * @returns {{ ok: true } | { ok: false, reason: 'not_integer' | 'too_low' | 'above_cap', max: number }}
 */
export function validateListingPrice(pricePence, faceValuePence, multiplier = pricing.maxPriceMultiplier) {
  const max = maxPrice(faceValuePence, multiplier);
  if (!Number.isInteger(pricePence)) return { ok: false, reason: 'not_integer', max };
  if (pricePence < 100) return { ok: false, reason: 'too_low', max };
  if (pricePence > max) return { ok: false, reason: 'above_cap', max };
  return { ok: true };
}
