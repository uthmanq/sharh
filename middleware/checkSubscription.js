const UsageService = require('../services/UsageService');

/**
 * Middleware to require an active subscription for OCR services
 * Attaches usage status to req.usageStatus for downstream use
 */
async function requireActiveSubscription(req, res, next) {
  try {
    const canUse = await UsageService.canUseOCR(req.user.id);

    if (!canUse) {
      return res.status(403).json({
        error: 'SUBSCRIPTION_REQUIRED',
        message: 'An active subscription is required to use OCR services',
        subscriptionRequired: true
      });
    }

    // Attach usage status to request for downstream use
    req.usageStatus = await UsageService.getUsageStatus(req.user.id);
    next();
  } catch (error) {
    console.error('Error checking subscription:', error);
    res.status(500).json({ error: 'Failed to verify subscription status' });
  }
}

module.exports = { requireActiveSubscription };
