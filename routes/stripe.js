// server.js or your main server file
const express = require('express');
require('dotenv').config();
const stripeConfig = require('../config/stripeConfig')
const stripe = require('stripe')(stripeConfig.secretKey);
const authenticateToken = require('../middleware/authenticate');
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
      success_url: `${req.headers.origin}/success`,
      cancel_url: `${req.headers.origin}/cancel`,
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

module.exports = router;
