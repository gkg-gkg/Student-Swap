// Pricing and fee rules. Money is integer pence everywhere.
export const pricing = {
  // Max listing price = face value x this. 1.0 = hard cap at face value.
  // Single switch if the legal position changes (see docs/SPEC.md).
  maxPriceMultiplier: 1.0,
  // Buyer booking fee in basis points (1 bp = 0.01%, so 700 = 7%), with a minimum per order.
  buyerFeeBps: 700,
  buyerFeeMinPence: 49,
  // Selling is free: StudentSwap takes no seller fee. The seller's sale does pay Stripe's card fee (Stripe collects it
  // from the seller's account). These are Stripe's standard UK card rates, used for the payout ESTIMATE only:
  // premium/non-UK cards cost a little more, so screens label it "est.".
  cardFeeBps: 150,
  cardFeeFixedPence: 20,
  checkoutHoldSeconds: 120,
  offerCheckoutWindowHours: 12,
  payoutReleaseHoursAfterEvent: 24,
  // Stripe can hold a seller's money for at most 90 days from payment to payout. Payout happens 24h after the event
  // ENDS, so listings are only allowed for events starting within this many days (leaves a safety margin).
  maxListingLeadDays: 85,
};
