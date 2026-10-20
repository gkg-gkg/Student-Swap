// The one fee calculator. Every screen (cards, checkout, payout preview) uses these.
import { pricing } from '../config/pricing.js';
import { formatPence } from './money.js';

/** Percentage of pence, rounded half up. @param {number} pence @param {number} bps */
export const percentOf = (pence, bps) => Math.round((pence * bps) / 10000);

/**
 * What the buyer pays: the price plus our booking fee (a percentage, with a minimum per order).
 * @param {number} pricePence listing price (all tickets in the order)
 * @param {{ buyerFeeBps: number, buyerFeeMinPence: number }} [rules]
 */
export function buyerTotal(pricePence, rules = pricing) {
  const buyerFee = Math.max(percentOf(pricePence, rules.buyerFeeBps), rules.buyerFeeMinPence);
  return { price: pricePence, buyerFee, total: pricePence + buyerFee };
}

/**
 * What the seller receives: the price minus Stripe's card fee on the whole payment. StudentSwap takes nothing from
 * the seller. The card fee is an ESTIMATE at standard UK rates; the real one depends on the buyer's card.
 * @param {number} pricePence listing price
 * @param {{ buyerFeeBps: number, buyerFeeMinPence: number, cardFeeBps: number, cardFeeFixedPence: number }} [rules]
 */
export function sellerPayout(pricePence, rules = pricing) {
  const { total } = buyerTotal(pricePence, rules);
  const cardFee = percentOf(total, rules.cardFeeBps) + rules.cardFeeFixedPence;
  return { price: pricePence, cardFee, payout: pricePence - cardFee };
}

/** Small amounts read better as "49p" than "£0.49" in sentences. @param {number} pence */
const words = (pence) => (pence < 100 ? `${pence}p` : formatPence(pence));

/** "7% (min 49p)": the buyer fee in words, for copy. */
export const buyerFeeText = () => `${pricing.buyerFeeBps / 100}% (min ${words(pricing.buyerFeeMinPence)})`;

/** "1.5% + 20p": Stripe's standard card fee in words, for copy. */
export const cardFeeText = () => `${pricing.cardFeeBps / 100}% + ${words(pricing.cardFeeFixedPence)}`;
