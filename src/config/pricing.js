// Pricing and fee rules. Money is integer pence everywhere.
export const pricing = {
  // Max listing price = face value x this. 1.0 = hard cap at face value.
  // Single switch if the legal position changes (see docs/SPEC.md).
  maxPriceMultiplier: 1.0,
  // Fees in basis points (1 bp = 0.01%), so 500 = 5%.
  buyerFeeBps: 500,
  sellerFeeBps: 500,
  checkoutHoldSeconds: 120,
  offerCheckoutWindowHours: 12,
  payoutReleaseHoursAfterEvent: 24,
};
