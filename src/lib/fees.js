// The one fee calculator. Every screen (cards, checkout, payout preview) uses these.
import { pricing } from '../config/pricing.js';

/** Percentage of pence, rounded half up. @param {number} pence @param {number} bps */
export const percentOf = (pence, bps) => Math.round((pence * bps) / 10000);

/**
 * What the buyer pays.
 * @param {number} pricePence listing price
 * @param {{ buyerFeeBps: number }} [rules]
 */
export function buyerTotal(pricePence, rules = pricing) {
  const buyerFee = percentOf(pricePence, rules.buyerFeeBps);
  return { price: pricePence, buyerFee, total: pricePence + buyerFee };
}

/**
 * What the seller receives.
 * @param {number} pricePence listing price
 * @param {{ sellerFeeBps: number }} [rules]
 */
export function sellerPayout(pricePence, rules = pricing) {
  const sellerFee = percentOf(pricePence, rules.sellerFeeBps);
  return { price: pricePence, sellerFee, payout: pricePence - sellerFee };
}
