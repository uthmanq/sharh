// server.js or your main server file
const express = require('express');
require('dotenv').config();
const stripeConfig = require('../config/stripeConfig')
const stripe = require('stripe')(stripeConfig.secretKey);
const authenticateToken = require('../middleware/authenticate');
const User = require('../models/User');
const UsageService = require('../services/UsageService');
const PageUsageLog = require('../models/PageUsageLog');
const router = express.Router();


router.post('/create-checkout-session', authenticateToken(['member', 'editor', 'admin']), async (req, res) => {
  const { priceId } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      customer: req.user.stripeCustomerId, // Use the stripeCustomerId from the authenticated user
      success_url: `${req.headers.origin}/profile`,
      cancel_url: `${req.headers.origin}/support`,
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error. Unable to complete request.');
  }
});

// Get current subscription status
router.get('/subscription', authenticateToken(['member', 'editor', 'admin']), async (req, res) => {
  try {
    // Get the customer's subscriptions from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: req.user.stripeCustomerId,
      status: 'all',
      expand: ['data.default_payment_method']
    });

    if (!subscriptions.data.length) {
      return res.json({ active: false });
    }

    // Return the active subscription details
    const subscription = subscriptions.data[0];
    
    res.json({
      active: subscription.status === 'active',
      status: subscription.status,
      current_period_end: new Date(subscription.current_period_end * 1000),
      cancel_at_period_end: subscription.cancel_at_period_end,
      subscription_id: subscription.id,
      plan: {
        id: subscription.items.data[0].price.id,
        name: subscription.items.data[0].price.nickname || 'Standard Plan',
        amount: subscription.items.data[0].price.unit_amount / 100, // Convert from cents
        currency: subscription.items.data[0].price.currency,
        interval: subscription.items.data[0].price.recurring.interval
      }
    });
  } catch (error) {
    console.error('Error retrieving subscription:', error);
    res.status(500).send('Failed to retrieve subscription information');
  }
});

// Cancel subscription (sets it to cancel at period end)
router.post('/subscription/cancel', authenticateToken(['member', 'editor', 'admin']), async (req, res) => {
  try {
    const { subscriptionId } = req.body;
    
    // Verify the subscription belongs to this user
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    if (subscription.customer !== req.user.stripeCustomerId) {
      return res.status(403).send('Unauthorized to cancel this subscription');
    }
    
    // Cancel the subscription at period end
    const canceledSubscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });
    
    res.json({
      success: true,
      canceled: true,
      current_period_end: new Date(canceledSubscription.current_period_end * 1000)
    });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    res.status(500).send('Failed to cancel subscription');
  }
});

// Reactivate a subscription that was set to cancel
router.post('/subscription/reactivate', authenticateToken(['member', 'editor', 'admin']), async (req, res) => {
  try {
    const { subscriptionId } = req.body;
    
    // Verify the subscription belongs to this user
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    if (subscription.customer !== req.user.stripeCustomerId) {
      return res.status(403).send('Unauthorized to reactivate this subscription');
    }
    
    // Reactivate subscription by setting cancel_at_period_end to false
    const reactivatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false
    });
    
    res.json({
      success: true,
      active: true,
      current_period_end: new Date(reactivatedSubscription.current_period_end * 1000)
    });
  } catch (error) {
    console.error('Error reactivating subscription:', error);
    res.status(500).send('Failed to reactivate subscription');
  }
});

// Update subscription plan
router.post('/subscription/update', authenticateToken(['member', 'editor', 'admin']), async (req, res) => {
  try {
    const { subscriptionId, newPriceId } = req.body;
    
    // Verify the subscription belongs to this user
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    if (subscription.customer !== req.user.stripeCustomerId) {
      return res.status(403).send('Unauthorized to update this subscription');
    }
    
    // Update the subscription with the new price
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      items: [{
        id: subscription.items.data[0].id,
        price: newPriceId,
      }],
    });
    
    res.json({
      success: true,
      updated: true,
      subscription_id: updatedSubscription.id
    });
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(500).send('Failed to update subscription');
  }
});

// Get payment methods
router.get('/payment-methods', authenticateToken(['member', 'editor', 'admin']), async (req, res) => {
  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: req.user.stripeCustomerId,
      type: 'card'
    });
    
    res.json({
      payment_methods: paymentMethods.data.map(method => ({
        id: method.id,
        brand: method.card.brand,
        last4: method.card.last4,
        exp_month: method.card.exp_month,
        exp_year: method.card.exp_year,
        is_default: method.metadata.is_default === 'true'
      }))
    });
  } catch (error) {
    console.error('Error retrieving payment methods:', error);
    res.status(500).send('Failed to retrieve payment methods');
  }
});

// Add payment method (returns a SetupIntent for the front-end to use)
router.post('/payment-methods/create-setup-intent', authenticateToken(['member', 'editor', 'admin']), async (req, res) => {
  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: req.user.stripeCustomerId,
      payment_method_types: ['card'],
    });
    
    res.json({
      clientSecret: setupIntent.client_secret
    });
  } catch (error) {
    console.error('Error creating setup intent:', error);
    res.status(500).send('Failed to create setup intent');
  }
});

// Get total number of active subscriptions (admin only)
router.get('/subscriptions/count',  async (req, res) => {
  try {
    // We need to paginate through all subscriptions to get an accurate count
    let hasMore = true;
    let startingAfter = null;
    let totalActiveSubscriptions = 0;
    const limit = 100; // Maximum allowed by Stripe API per request
    
    while (hasMore) {
      // Build query parameters
      const queryParams = {
        limit: limit,
        status: 'active', // Only count active subscriptions
      };
      
      // Add pagination parameter if we're past the first page
      if (startingAfter) {
        queryParams.starting_after = startingAfter;
      }
      
      // Fetch a page of subscriptions
      const subscriptionsPage = await stripe.subscriptions.list(queryParams);
      
      // Add this page's count to our total
      totalActiveSubscriptions += subscriptionsPage.data.length;
      
      // Check if there are more pages
      hasMore = subscriptionsPage.has_more;
      
      // If there are more pages, set the starting point for the next request
      if (hasMore && subscriptionsPage.data.length > 0) {
        // Get the ID of the last subscription in the current page
        startingAfter = subscriptionsPage.data[subscriptionsPage.data.length - 1].id;
      }
    }
    
    // Return the total count
    res.json({
      success: true,
      active_subscriptions: totalActiveSubscriptions
    });
  } catch (error) {
    console.error('Error counting subscriptions:', error);
    res.status(500).send('Failed to retrieve subscription count');
  }
});

// Update default payment method
router.post('/payment-methods/set-default', authenticateToken(['member', 'editor', 'admin']), async (req, res) => {
  try {
    const { paymentMethodId } = req.body;
    
    // Verify the payment method belongs to this user
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    
    if (paymentMethod.customer !== req.user.stripeCustomerId) {
      return res.status(403).send('Unauthorized to update this payment method');
    }
    
    // Update the customer's default payment method
    await stripe.customers.update(req.user.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId
      }
    });
    
    res.json({
      success: true
    });
  } catch (error) {
    console.error('Error setting default payment method:', error);
    res.status(500).send('Failed to set default payment method');
  }
});

// Delete payment method
router.delete('/payment-methods/:id', authenticateToken(['member', 'editor', 'admin']), async (req, res) => {
  try {
    const paymentMethodId = req.params.id;
    
    // Verify the payment method belongs to this user
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    
    if (paymentMethod.customer !== req.user.stripeCustomerId) {
      return res.status(403).send('Unauthorized to delete this payment method');
    }
    
    await stripe.paymentMethods.detach(paymentMethodId);
    
    res.json({
      success: true
    });
  } catch (error) {
    console.error('Error deleting payment method:', error);
    res.status(500).send('Failed to delete payment method');
  }
});

// Get billing history (invoices)
router.get('/billing-history', authenticateToken(['member', 'editor', 'admin']), async (req, res) => {
  try {
    const invoices = await stripe.invoices.list({
      customer: req.user.stripeCustomerId,
      limit: 10
    });

    res.json({
      invoices: invoices.data.map(invoice => ({
        id: invoice.id,
        amount_paid: invoice.amount_paid / 100,
        currency: invoice.currency,
        status: invoice.status,
        created: new Date(invoice.created * 1000),
        invoice_pdf: invoice.invoice_pdf,
        period_start: new Date(invoice.period_start * 1000),
        period_end: new Date(invoice.period_end * 1000)
      }))
    });
  } catch (error) {
    console.error('Error retrieving billing history:', error);
    res.status(500).send('Failed to retrieve billing history');
  }
});

// Get all subscriptions with user data (admin only)
router.get('/subscriptions/all-with-users', authenticateToken(['admin']), async (req, res) => {
  try {
    // Fetch all users from the database
    const users = await User.find({}, 'username email stripeCustomerId').lean();

    // Create a map of stripeCustomerId to user data for quick lookup
    const userMap = {};
    users.forEach(user => {
      userMap[user.stripeCustomerId] = {
        userId: user._id,
        username: user.username,
        email: user.email
      };
    });

    // Fetch all subscriptions from Stripe with pagination
    let hasMore = true;
    let startingAfter = null;
    const allSubscriptions = [];
    const limit = 100; // Maximum allowed by Stripe API per request

    while (hasMore) {
      const queryParams = {
        limit: limit,
        status: 'all', // Get all subscription statuses
        expand: ['data.default_payment_method', 'data.items.data.price']
      };

      if (startingAfter) {
        queryParams.starting_after = startingAfter;
      }

      const subscriptionsPage = await stripe.subscriptions.list(queryParams);
      allSubscriptions.push(...subscriptionsPage.data);

      hasMore = subscriptionsPage.has_more;

      if (hasMore && subscriptionsPage.data.length > 0) {
        startingAfter = subscriptionsPage.data[subscriptionsPage.data.length - 1].id;
      }
    }

    // Map subscriptions to include user data
    const subscriptionsWithUsers = allSubscriptions.map(subscription => {
      const userData = userMap[subscription.customer] || null;

      return {
        subscription_id: subscription.id,
        status: subscription.status,
        created: new Date(subscription.created * 1000),
        current_period_start: new Date(subscription.current_period_start * 1000),
        current_period_end: new Date(subscription.current_period_end * 1000),
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
        stripe_customer_id: subscription.customer,
        plan: subscription.items.data[0] ? {
          id: subscription.items.data[0].price.id,
          name: subscription.items.data[0].price.nickname || 'Standard Plan',
          amount: subscription.items.data[0].price.unit_amount / 100,
          currency: subscription.items.data[0].price.currency,
          interval: subscription.items.data[0].price.recurring?.interval
        } : null,
        user: userData,
        metadata: subscription.metadata
      };
    });

    // Sort by creation date (newest first)
    subscriptionsWithUsers.sort((a, b) => b.created - a.created);

    res.json({
      success: true,
      total_subscriptions: subscriptionsWithUsers.length,
      active_subscriptions: subscriptionsWithUsers.filter(s => s.status === 'active').length,
      subscriptions: subscriptionsWithUsers
    });
  } catch (error) {
    console.error('Error fetching all subscriptions with users:', error);
    res.status(500).send('Failed to retrieve subscriptions with user data');
  }
});

// ============================================
// USAGE TRACKING ENDPOINTS
// ============================================

// Get current usage status
router.get('/usage', authenticateToken(['member', 'editor', 'admin']), async (req, res) => {
  try {
    const status = await UsageService.getUsageStatus(req.user.id);

    // Also get failed payments info
    const failedPayments = await UsageService.getFailedPayments(req.user.id);

    res.json({
      ...status,
      hasFailedPayments: failedPayments.hasFailedPayments,
      failedPaymentCount: failedPayments.failedPaymentCount,
      totalUnpaidCents: failedPayments.totalUnpaidCents
    });
  } catch (error) {
    console.error('Error retrieving usage status:', error);
    res.status(500).send('Failed to retrieve usage information');
  }
});

// Estimate cost for a given page count
router.post('/usage/estimate', authenticateToken(['member', 'editor', 'admin']), async (req, res) => {
  try {
    const { pageCount } = req.body;

    if (!pageCount || pageCount < 1) {
      return res.status(400).json({ error: 'Invalid page count' });
    }

    const estimate = await UsageService.estimateCost(req.user.id, pageCount);
    res.json(estimate);
  } catch (error) {
    console.error('Error estimating cost:', error);
    res.status(500).send('Failed to estimate cost');
  }
});

// Get usage history (paginated)
router.get('/usage/history', authenticateToken(['member', 'editor', 'admin']), async (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.query;

    const result = await UsageService.getUsageHistory(
      req.user.id,
      parseInt(limit),
      parseInt(offset)
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error retrieving usage history:', error);
    res.status(500).send('Failed to retrieve usage history');
  }
});

// Get failed payments
router.get('/usage/failed-payments', authenticateToken(['member', 'editor', 'admin']), async (req, res) => {
  try {
    const failedPayments = await UsageService.getFailedPayments(req.user.id);
    res.json({
      success: true,
      ...failedPayments
    });
  } catch (error) {
    console.error('Error retrieving failed payments:', error);
    res.status(500).send('Failed to retrieve failed payments');
  }
});

// Retry a failed payment
router.post('/usage/retry-payment/:logId', authenticateToken(['member', 'editor', 'admin']), async (req, res) => {
  try {
    const { logId } = req.params;

    // Verify the log belongs to this user
    const log = await PageUsageLog.findById(logId);
    if (!log) {
      return res.status(404).json({ error: 'Payment record not found' });
    }
    if (log.userId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const result = await UsageService.retryFailedPayment(logId);
    res.json(result);
  } catch (error) {
    console.error('Error retrying payment:', error);
    res.status(500).json({ success: false, message: 'Failed to retry payment' });
  }
});

// Check upload eligibility (subscription + payment status)
router.get('/usage/can-upload', authenticateToken(['member', 'editor', 'admin']), async (req, res) => {
  try {
    const result = await UsageService.canUploadWithPaymentCheck(req.user.id);
    res.json(result);
  } catch (error) {
    console.error('Error checking upload eligibility:', error);
    res.status(500).send('Failed to check upload eligibility');
  }
});

// ============================================
// STRIPE WEBHOOK HANDLER
// ============================================

// Webhook endpoint - Note: raw body parsing is configured in app.js
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  // Use test or live webhook secret based on STRIPE_ENV
  const endpointSecret = process.env.STRIPE_ENV === 'test'
    ? process.env.STRIPE_WEBHOOK_SECRET_TEST
    : process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'invoice.paid':
        // Subscription renewed - reset credits
        await handleInvoicePaid(event.data.object);
        break;

      case 'customer.subscription.updated':
        // Plan change or other subscription update
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        // Subscription terminated
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_failed':
        // Payment failed - log for monitoring
        await handlePaymentFailed(event.data.object);
        break;

      default:
        console.log(`Unhandled webhook event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Webhook event handlers
async function handleInvoicePaid(invoice) {
  // Only process subscription invoices
  if (!invoice.subscription) return;

  try {
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
    const priceId = subscription.items.data[0].price.id;

    // Reset credits for new billing period
    await UsageService.resetCreditsForNewPeriod(
      subscription.id,
      subscription.current_period_start,
      subscription.current_period_end,
      priceId
    );

    console.log(`Credits reset for subscription ${subscription.id}`);
  } catch (error) {
    console.error('Error handling invoice.paid:', error);
  }
}

async function handleSubscriptionUpdated(subscription) {
  try {
    const priceId = subscription.items.data[0].price.id;

    if (subscription.cancel_at_period_end) {
      // Subscription set to cancel - user keeps credits until period end
      await UsageService.handleSubscriptionCancellation(subscription.id);
    } else {
      // Plan change or reactivation
      await UsageService.handlePlanChange(subscription.id, priceId);
    }
  } catch (error) {
    console.error('Error handling subscription.updated:', error);
  }
}

async function handleSubscriptionDeleted(subscription) {
  try {
    await UsageService.handleSubscriptionDeletion(subscription.id);
    console.log(`Subscription ${subscription.id} deleted - usage records closed`);
  } catch (error) {
    console.error('Error handling subscription.deleted:', error);
  }
}

async function handlePaymentFailed(invoice) {
  console.error(`Payment failed for invoice ${invoice.id}, customer ${invoice.customer}`);
  // Could send notification to user here
}

module.exports = router;
