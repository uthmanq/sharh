const UsageRecord = require('../models/UsageRecord');
const PageUsageLog = require('../models/PageUsageLog');
const User = require('../models/User');
const { getTierCredits, overageConfig, calculateOverageCostCents } = require('../config/billingConfig');
const stripeConfig = require('../config/stripeConfig');
const stripe = require('stripe')(stripeConfig.secretKey);

class UsageService {
  /**
   * Get or create the active usage record for a user's current billing period
   * @param {string} userId - MongoDB user ID
   * @returns {Promise<UsageRecord|null>} Active usage record or null if no subscription
   */
  static async getActiveUsageRecord(userId) {
    const user = await User.findById(userId);
    if (!user || !user.stripeCustomerId) {
      throw new Error('User not found or no Stripe customer ID');
    }

    // Check for existing active record
    let usageRecord = await UsageRecord.findOne({
      userId: userId,
      status: 'active'
    });

    if (usageRecord) {
      // Check if billing period has ended
      if (new Date() > usageRecord.billingPeriodEnd) {
        // Close old record
        usageRecord.status = 'closed';
        await usageRecord.save();
        usageRecord = null;
      }
    }

    if (!usageRecord) {
      // Fetch subscription from Stripe to create new record
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        status: 'active',
        limit: 1
      });

      if (!subscriptions.data.length) {
        // Also check for subscriptions that are canceled but still in their period
        const canceledSubs = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          status: 'canceled',
          limit: 1
        });

        // Check if any canceled subscription is still within its period
        const validCanceledSub = canceledSubs.data.find(sub =>
          new Date(sub.current_period_end * 1000) > new Date()
        );

        if (!validCanceledSub) {
          return null; // No active or valid canceled subscription
        }

        // Use the canceled subscription that's still within period
        const subscription = validCanceledSub;
        const priceId = subscription.items.data[0].price.id;

        usageRecord = new UsageRecord({
          userId: userId,
          stripeCustomerId: user.stripeCustomerId,
          subscriptionId: subscription.id,
          billingPeriodStart: new Date(subscription.current_period_start * 1000),
          billingPeriodEnd: new Date(subscription.current_period_end * 1000),
          priceId: priceId,
          tierCredits: getTierCredits(priceId),
          pagesUsed: 0,
          overagePages: 0,
          overageChargedCents: 0,
          status: 'active'
        });

        await usageRecord.save();
        return usageRecord;
      }

      const subscription = subscriptions.data[0];
      const priceId = subscription.items.data[0].price.id;

      usageRecord = new UsageRecord({
        userId: userId,
        stripeCustomerId: user.stripeCustomerId,
        subscriptionId: subscription.id,
        billingPeriodStart: new Date(subscription.current_period_start * 1000),
        billingPeriodEnd: new Date(subscription.current_period_end * 1000),
        priceId: priceId,
        tierCredits: getTierCredits(priceId),
        pagesUsed: 0,
        overagePages: 0,
        overageChargedCents: 0,
        status: 'active'
      });

      await usageRecord.save();
    }

    return usageRecord;
  }

  /**
   * Check if user can use OCR (has active subscription)
   * @param {string} userId - MongoDB user ID
   * @returns {Promise<boolean>}
   */
  static async canUseOCR(userId) {
    try {
      const usageRecord = await this.getActiveUsageRecord(userId);
      return usageRecord !== null;
    } catch (error) {
      console.error('Error checking OCR access:', error);
      return false;
    }
  }

  /**
   * Get current usage status for a user
   * @param {string} userId - MongoDB user ID
   * @returns {Promise<Object>} Usage status object
   */
  static async getUsageStatus(userId) {
    const usageRecord = await this.getActiveUsageRecord(userId);

    if (!usageRecord) {
      return {
        hasSubscription: false,
        tierCredits: 0,
        pagesUsed: 0,
        remainingCredits: 0,
        isInOverage: false,
        overagePages: 0,
        overageChargedCents: 0,
        billingPeriodStart: null,
        billingPeriodEnd: null,
        priceId: null
      };
    }

    const remainingCredits = Math.max(0, usageRecord.tierCredits - usageRecord.pagesUsed);
    const isInOverage = usageRecord.pagesUsed > usageRecord.tierCredits;

    return {
      hasSubscription: true,
      tierCredits: usageRecord.tierCredits,
      pagesUsed: usageRecord.pagesUsed,
      remainingCredits: remainingCredits,
      isInOverage: isInOverage,
      overagePages: usageRecord.overagePages,
      overageChargedCents: usageRecord.overageChargedCents,
      billingPeriodStart: usageRecord.billingPeriodStart,
      billingPeriodEnd: usageRecord.billingPeriodEnd,
      priceId: usageRecord.priceId
    };
  }

  /**
   * Record page usage and charge for overage if needed
   * @param {string} userId - MongoDB user ID
   * @param {string} jobId - OCR job ID
   * @param {string} bookTextId - BookText MongoDB ID
   * @param {number} pageCount - Number of pages processed
   * @returns {Promise<Object>} Usage result with free/overage breakdown
   */
  static async recordPageUsage(userId, jobId, bookTextId, pageCount) {
    const usageRecord = await this.getActiveUsageRecord(userId);

    if (!usageRecord) {
      throw new Error('No active subscription found');
    }

    const previouslyUsed = usageRecord.pagesUsed;
    const tierCredits = usageRecord.tierCredits;

    // Calculate how many pages are free vs overage
    let freePages = 0;
    let overagePages = 0;

    if (previouslyUsed < tierCredits) {
      // Some or all pages can be covered by free credits
      const availableCredits = tierCredits - previouslyUsed;
      freePages = Math.min(pageCount, availableCredits);
      overagePages = pageCount - freePages;
    } else {
      // All pages are overage
      overagePages = pageCount;
    }

    // Use atomic update to prevent race conditions
    const updatedRecord = await UsageRecord.findByIdAndUpdate(
      usageRecord._id,
      {
        $inc: {
          pagesUsed: pageCount,
          overagePages: overagePages
        },
        $set: { updatedAt: Date.now() }
      },
      { new: true }
    );

    let stripeInvoiceItemId = null;
    let overageChargeCents = 0;

    // Charge for overage immediately if any
    if (overagePages > 0) {
      overageChargeCents = calculateOverageCostCents(overagePages);

      try {
        // Create invoice item for immediate billing
        const invoiceItem = await stripe.invoiceItems.create({
          customer: usageRecord.stripeCustomerId,
          amount: overageChargeCents,
          currency: 'usd',
          description: `OCR Overage: ${overagePages} page(s) at $0.005/page`,
          metadata: {
            type: 'ocr_overage',
            jobId: jobId,
            pageCount: overagePages.toString(),
            userId: userId.toString()
          }
        });

        stripeInvoiceItemId = invoiceItem.id;

        // Update the charged amount in the record
        await UsageRecord.findByIdAndUpdate(
          usageRecord._id,
          { $inc: { overageChargedCents: overageChargeCents } }
        );

        // Create and finalize invoice immediately
        const invoice = await stripe.invoices.create({
          customer: usageRecord.stripeCustomerId,
          auto_advance: true,
          collection_method: 'charge_automatically',
          metadata: {
            type: 'ocr_overage_immediate',
            jobId: jobId
          }
        });

        // Finalize and pay the invoice
        await stripe.invoices.finalizeInvoice(invoice.id);
        await stripe.invoices.pay(invoice.id);

        console.log(`Overage charge successful: ${overageChargeCents} cents for job ${jobId}`);
      } catch (stripeError) {
        console.error('Error charging overage:', stripeError);
        // Log but don't fail the OCR job - we can retry billing later
      }
    }

    // Create usage log entry
    const usageLog = new PageUsageLog({
      userId: userId,
      usageRecordId: usageRecord._id,
      jobId: jobId,
      bookTextId: bookTextId,
      pageCount: pageCount,
      freePages: freePages,
      overagePages: overagePages,
      overageChargeCents: overageChargeCents,
      stripeInvoiceItemId: stripeInvoiceItemId
    });

    await usageLog.save();

    return {
      freePages,
      overagePages,
      overageChargeCents,
      totalPagesUsed: updatedRecord.pagesUsed,
      remainingCredits: Math.max(0, tierCredits - updatedRecord.pagesUsed)
    };
  }

  /**
   * Estimate cost for a given page count
   * @param {string} userId - MongoDB user ID
   * @param {number} pageCount - Estimated number of pages
   * @returns {Promise<Object>} Cost estimate
   */
  static async estimateCost(userId, pageCount) {
    const status = await this.getUsageStatus(userId);

    if (!status.hasSubscription) {
      return {
        canProcess: false,
        reason: 'No active subscription',
        estimatedCostCents: 0
      };
    }

    const remainingCredits = status.remainingCredits;
    const overagePages = Math.max(0, pageCount - remainingCredits);
    const overageCostCents = calculateOverageCostCents(overagePages);

    return {
      canProcess: true,
      pageCount: pageCount,
      freePages: Math.min(pageCount, remainingCredits),
      overagePages: overagePages,
      estimatedCostCents: overageCostCents,
      remainingCreditsAfter: Math.max(0, remainingCredits - pageCount)
    };
  }

  /**
   * Reset credits for a new billing period (called by webhook)
   * @param {string} subscriptionId - Stripe subscription ID
   * @param {number} newPeriodStart - Unix timestamp
   * @param {number} newPeriodEnd - Unix timestamp
   * @param {string} priceId - Stripe price ID
   * @returns {Promise<UsageRecord|null>}
   */
  static async resetCreditsForNewPeriod(subscriptionId, newPeriodStart, newPeriodEnd, priceId) {
    // Close any existing active records for this subscription
    await UsageRecord.updateMany(
      { subscriptionId: subscriptionId, status: 'active' },
      { status: 'closed', updatedAt: Date.now() }
    );

    // Find user by looking up an existing record for this subscription
    const existingRecord = await UsageRecord.findOne({ subscriptionId: subscriptionId });
    if (!existingRecord) {
      console.log(`No existing usage record for subscription ${subscriptionId}`);
      return null;
    }

    // Create new usage record for the new period
    const newRecord = new UsageRecord({
      userId: existingRecord.userId,
      stripeCustomerId: existingRecord.stripeCustomerId,
      subscriptionId: subscriptionId,
      billingPeriodStart: new Date(newPeriodStart * 1000),
      billingPeriodEnd: new Date(newPeriodEnd * 1000),
      priceId: priceId,
      tierCredits: getTierCredits(priceId),
      pagesUsed: 0,
      overagePages: 0,
      overageChargedCents: 0,
      status: 'active'
    });

    await newRecord.save();
    console.log(`Credits reset for subscription ${subscriptionId}: ${newRecord.tierCredits} pages`);
    return newRecord;
  }

  /**
   * Handle subscription cancellation (user keeps credits until period ends)
   * @param {string} subscriptionId - Stripe subscription ID
   */
  static async handleSubscriptionCancellation(subscriptionId) {
    // Don't close the usage record - user keeps credits until period ends
    console.log(`Subscription ${subscriptionId} cancelled - credits remain until period end`);
  }

  /**
   * Handle subscription deletion (immediate termination)
   * @param {string} subscriptionId - Stripe subscription ID
   */
  static async handleSubscriptionDeletion(subscriptionId) {
    await UsageRecord.updateMany(
      { subscriptionId: subscriptionId, status: 'active' },
      { status: 'closed', updatedAt: Date.now() }
    );
    console.log(`Subscription ${subscriptionId} deleted - usage records closed`);
  }

  /**
   * Handle plan upgrade/downgrade
   * @param {string} subscriptionId - Stripe subscription ID
   * @param {string} newPriceId - New Stripe price ID
   * @returns {Promise<UsageRecord|null>}
   */
  static async handlePlanChange(subscriptionId, newPriceId) {
    const usageRecord = await UsageRecord.findOne({
      subscriptionId: subscriptionId,
      status: 'active'
    });

    if (!usageRecord) {
      return null;
    }

    // Update tier credits for new plan (generous: give them the higher amount)
    const newCredits = getTierCredits(newPriceId);
    usageRecord.priceId = newPriceId;
    usageRecord.tierCredits = newCredits;
    usageRecord.updatedAt = Date.now();
    await usageRecord.save();

    console.log(`Plan changed for subscription ${subscriptionId}: now ${newCredits} pages`);
    return usageRecord;
  }

  /**
   * Get usage history for a user (paginated)
   * @param {string} userId - MongoDB user ID
   * @param {number} limit - Number of records to return
   * @param {number} offset - Number of records to skip
   * @returns {Promise<Object>} Usage history with total count
   */
  static async getUsageHistory(userId, limit = 10, offset = 0) {
    const logs = await PageUsageLog.find({ userId: userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset);

    const total = await PageUsageLog.countDocuments({ userId: userId });

    return {
      total,
      logs: logs.map(log => ({
        jobId: log.jobId,
        pageCount: log.pageCount,
        freePages: log.freePages,
        overagePages: log.overagePages,
        overageChargeCents: log.overageChargeCents,
        createdAt: log.createdAt
      }))
    };
  }
}

module.exports = UsageService;
