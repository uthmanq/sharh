// Tier credits mapping - maps Stripe price IDs to monthly page credits
const tierCredits = {
  // Production price IDs
  'price_1PpFguId9CfEnWZpxaleTN3u': { credits: 1000, price: 5 },   // $5/month
  'price_1PpFh2Id9CfEnWZpVxMTmMJv': { credits: 2000, price: 10 },  // $10/month
  'price_1PpFh7Id9CfEnWZpB4p2Il7o': { credits: 10000, price: 50 }, // $50/month

  // Test/Development price IDs
  'price_1PZcpjId9CfEnWZp2Y4csYoV': { credits: 1000, price: 5 },   // $5/month test
  'price_1PZeHMId9CfEnWZpDJSmVezQ': { credits: 2000, price: 10 },  // $10/month test
  'price_1PZeIbId9CfEnWZp7888MnGN': { credits: 10000, price: 50 }  // $50/month test
};

// Overage pricing configuration
const overageConfig = {
  pricePerPageCents: 0.5,  // $0.005 per page = 0.5 cents
  minimumChargeCents: 1    // Stripe minimum charge is 1 cent ($0.01)
};

/**
 * Get the number of free page credits for a given price ID
 * @param {string} priceId - Stripe price ID
 * @returns {number} Number of free pages per billing period
 */
const getTierCredits = (priceId) => {
  return tierCredits[priceId]?.credits || 0;
};

/**
 * Get the subscription price for a given price ID
 * @param {string} priceId - Stripe price ID
 * @returns {number} Monthly subscription price in dollars
 */
const getTierPrice = (priceId) => {
  return tierCredits[priceId]?.price || 0;
};

/**
 * Calculate overage cost in cents for a given number of pages
 * @param {number} overagePages - Number of pages over the free limit
 * @returns {number} Cost in cents (minimum 1 cent)
 */
const calculateOverageCostCents = (overagePages) => {
  if (overagePages <= 0) return 0;
  const cost = Math.ceil(overagePages * overageConfig.pricePerPageCents);
  return Math.max(cost, overageConfig.minimumChargeCents);
};

module.exports = {
  tierCredits,
  overageConfig,
  getTierCredits,
  getTierPrice,
  calculateOverageCostCents
};
