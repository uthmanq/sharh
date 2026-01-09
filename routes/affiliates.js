const express = require('express');
const router = express.Router();
const Affiliate = require('../models/Affiliate');
const Referral = require('../models/Referral');
const User = require('../models/User');
const authenticateToken  = require('../middleware/authenticate');

// GET all affiliates (Admin Only)
router.get('/', authenticateToken(['admin']), async (req, res) => {
  try {
    const affiliates = await Affiliate.find()
      .populate('createdBy', 'username email')
      .sort({ createdAt: -1 });
    res.json(affiliates);
  } catch (error) {
    console.error('Error fetching affiliates:', error);
    res.status(500).json({ error: 'Failed to fetch affiliates' });
  }
});

// GET my affiliate stats (for logged-in affiliates)
// IMPORTANT: This route must be before /:id to avoid matching "my-stats" as an ID
router.get('/my-stats', authenticateToken(['member', 'editor', 'admin']), async (req, res) => {
  const stripeConfig = require('../config/stripeConfig');
  const stripe = require('stripe')(stripeConfig.secretKey);

  try {
    // Find affiliate by user's email
    const affiliate = await Affiliate.findOne({ email: req.user.email });

    if (!affiliate) {
      return res.status(404).json({ isAffiliate: false });
    }

    // Get referral stats
    const referrals = await Referral.find({ affiliateId: affiliate._id })
      .populate('userId', 'username email createdAt');

    const totalReferrals = referrals.length;
    const activeSubscriptions = referrals.filter(r => r.subscriptionStatus === 'active').length;
    const totalRevenueCents = referrals.reduce((sum, r) => sum + (r.totalPaymentsCents || 0), 0);
    const totalCommissionCents = Math.round(totalRevenueCents * affiliate.commissionRate / 100);

    // Calculate current month's earnings
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const startTimestamp = Math.floor(startOfMonth.getTime() / 1000);
    const endTimestamp = Math.floor(endOfMonth.getTime() / 1000);

    // Build a set of customer IDs for quick lookup
    const customerIdSet = new Set();
    for (const ref of referrals) {
      if (ref.userId) {
        const user = await User.findById(ref.userId._id || ref.userId);
        if (user?.stripeCustomerId) {
          customerIdSet.add(user.stripeCustomerId);
        }
      }
    }

    // Fetch this month's invoices from Stripe
    let monthlyRevenueCents = 0;
    let hasMore = true;
    let startingAfter = null;

    while (hasMore) {
      const invoiceParams = {
        status: 'paid',
        created: { gte: startTimestamp, lte: endTimestamp },
        limit: 100
      };
      if (startingAfter) {
        invoiceParams.starting_after = startingAfter;
      }

      const invoices = await stripe.invoices.list(invoiceParams);

      for (const invoice of invoices.data) {
        if (customerIdSet.has(invoice.customer) && invoice.subscription && invoice.amount_paid > 0) {
          monthlyRevenueCents += invoice.amount_paid;
        }
      }

      hasMore = invoices.has_more;
      if (hasMore && invoices.data.length > 0) {
        startingAfter = invoices.data[invoices.data.length - 1].id;
      }
    }

    const monthlyCommissionCents = Math.round(monthlyRevenueCents * affiliate.commissionRate / 100);

    res.json({
      isAffiliate: true,
      affiliate: {
        name: affiliate.name,
        code: affiliate.code,
        referralLink: affiliate.referralLink,
        commissionRate: affiliate.commissionRate,
        isActive: affiliate.isActive,
        createdAt: affiliate.createdAt
      },
      stats: {
        totalReferrals,
        activeSubscriptions,
        totalRevenueCents,
        totalCommissionCents,
        monthlyRevenueCents,
        monthlyCommissionCents,
        currentMonth: {
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          monthName: now.toLocaleString('default', { month: 'long' })
        }
      },
      referrals: referrals.map(r => ({
        id: r._id,
        username: r.userId?.username || 'Unknown',
        subscriptionStatus: r.subscriptionStatus,
        createdAt: r.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching affiliate stats:', error);
    res.status(500).json({ error: 'Failed to fetch affiliate stats' });
  }
});

// GET single affiliate with stats (Admin Only)
router.get('/:id', authenticateToken(['admin']), async (req, res) => {
  try {
    const affiliate = await Affiliate.findById(req.params.id)
      .populate('createdBy', 'username email');

    if (!affiliate) {
      return res.status(404).json({ error: 'Affiliate not found' });
    }

    // Get referral count and subscription stats
    const referralStats = await Referral.aggregate([
      { $match: { affiliateId: affiliate._id } },
      {
        $group: {
          _id: null,
          totalReferrals: { $sum: 1 },
          activeSubscriptions: {
            $sum: { $cond: [{ $eq: ['$subscriptionStatus', 'active'] }, 1, 0] }
          },
          totalRevenueCents: { $sum: '$totalPaymentsCents' }
        }
      }
    ]);

    const stats = referralStats[0] || {
      totalReferrals: 0,
      activeSubscriptions: 0,
      totalRevenueCents: 0
    };

    res.json({
      ...affiliate.toObject(),
      stats
    });
  } catch (error) {
    console.error('Error fetching affiliate:', error);
    res.status(500).json({ error: 'Failed to fetch affiliate' });
  }
});

// CREATE new affiliate (Admin Only)
router.post('/', authenticateToken(['admin']), async (req, res) => {
  try {
    const { name, email, code, commissionRate, notes } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    // Check if email already exists
    const existingAffiliate = await Affiliate.findOne({ email });
    if (existingAffiliate) {
      return res.status(400).json({ error: 'An affiliate with this email already exists' });
    }

    // Generate unique code if not provided
    const affiliateCode = code || await Affiliate.generateUniqueCode(name);

    // Check if code already exists
    const existingCode = await Affiliate.findOne({ code: affiliateCode });
    if (existingCode) {
      return res.status(400).json({ error: 'This affiliate code is already in use' });
    }

    const affiliate = new Affiliate({
      name,
      email,
      code: affiliateCode,
      commissionRate: commissionRate || 0,
      notes: notes || '',
      createdBy: req.user._id
    });

    await affiliate.save();
    res.status(201).json(affiliate);
  } catch (error) {
    console.error('Error creating affiliate:', error);
    res.status(500).json({ error: 'Failed to create affiliate' });
  }
});

// UPDATE affiliate (Admin Only)
router.put('/:id', authenticateToken(['admin']), async (req, res) => {
  try {
    const { name, email, code, isActive, commissionRate, notes } = req.body;

    const affiliate = await Affiliate.findById(req.params.id);
    if (!affiliate) {
      return res.status(404).json({ error: 'Affiliate not found' });
    }

    // Check for duplicate email if changed
    if (email && email !== affiliate.email) {
      const existingEmail = await Affiliate.findOne({ email, _id: { $ne: affiliate._id } });
      if (existingEmail) {
        return res.status(400).json({ error: 'An affiliate with this email already exists' });
      }
    }

    // Check for duplicate code if changed
    if (code && code !== affiliate.code) {
      const existingCode = await Affiliate.findOne({ code, _id: { $ne: affiliate._id } });
      if (existingCode) {
        return res.status(400).json({ error: 'This affiliate code is already in use' });
      }
    }

    if (name !== undefined) affiliate.name = name;
    if (email !== undefined) affiliate.email = email;
    if (code !== undefined) affiliate.code = code;
    if (isActive !== undefined) affiliate.isActive = isActive;
    if (commissionRate !== undefined) affiliate.commissionRate = commissionRate;
    if (notes !== undefined) affiliate.notes = notes;

    await affiliate.save();
    res.json(affiliate);
  } catch (error) {
    console.error('Error updating affiliate:', error);
    res.status(500).json({ error: 'Failed to update affiliate' });
  }
});

// DELETE affiliate (Admin Only)
router.delete('/:id', authenticateToken(['admin']), async (req, res) => {
  try {
    const affiliate = await Affiliate.findById(req.params.id);
    if (!affiliate) {
      return res.status(404).json({ error: 'Affiliate not found' });
    }

    // Check if affiliate has referrals
    const referralCount = await Referral.countDocuments({ affiliateId: affiliate._id });
    if (referralCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete affiliate with existing referrals. Deactivate instead.',
        referralCount
      });
    }

    await affiliate.deleteOne();
    res.json({ message: 'Affiliate deleted successfully' });
  } catch (error) {
    console.error('Error deleting affiliate:', error);
    res.status(500).json({ error: 'Failed to delete affiliate' });
  }
});

// GET monthly stats for all affiliates (Admin Only)
router.get('/stats/monthly', authenticateToken(['admin']), async (req, res) => {
  try {
    const { year, month } = req.query;
    const now = new Date();
    const statsYear = parseInt(year) || now.getFullYear();
    const statsMonth = parseInt(month) || now.getMonth() + 1;

    const stats = await Referral.getAllAffiliatesMonthlyStats(statsYear, statsMonth);

    res.json({
      year: statsYear,
      month: statsMonth,
      affiliates: stats[0]?.byAffiliate || [],
      totals: stats[0]?.totals[0] || {
        totalReferrals: 0,
        totalActiveSubscriptions: 0,
        totalNewReferralsThisMonth: 0,
        totalNewSubscriptionsThisMonth: 0,
        totalRevenueCents: 0
      }
    });
  } catch (error) {
    console.error('Error fetching monthly stats:', error);
    res.status(500).json({ error: 'Failed to fetch monthly stats' });
  }
});

// GET monthly earnings from Stripe invoices (Admin Only)
// This calculates actual revenue and commission for a specific month
router.get('/stats/monthly-earnings', authenticateToken(['admin']), async (req, res) => {
  const stripeConfig = require('../config/stripeConfig');
  const stripe = require('stripe')(stripeConfig.secretKey);

  try {
    const { year, month } = req.query;
    const now = new Date();
    const statsYear = parseInt(year) || now.getFullYear();
    const statsMonth = parseInt(month) || now.getMonth() + 1;

    // Calculate date range for the month
    const startOfMonth = new Date(statsYear, statsMonth - 1, 1);
    const endOfMonth = new Date(statsYear, statsMonth, 0, 23, 59, 59, 999);
    const startTimestamp = Math.floor(startOfMonth.getTime() / 1000);
    const endTimestamp = Math.floor(endOfMonth.getTime() / 1000);

    // Get all referrals with their users and affiliates
    const referrals = await Referral.find()
      .populate('userId', 'stripeCustomerId')
      .populate('affiliateId', 'name email code commissionRate isActive');

    // Build a map of stripeCustomerId -> referral data
    const customerToReferral = {};
    for (const ref of referrals) {
      if (ref.userId?.stripeCustomerId && ref.affiliateId) {
        customerToReferral[ref.userId.stripeCustomerId] = {
          referralId: ref._id,
          affiliateId: ref.affiliateId._id,
          affiliateName: ref.affiliateId.name,
          affiliateEmail: ref.affiliateId.email,
          affiliateCode: ref.affiliateId.code,
          commissionRate: ref.affiliateId.commissionRate || 0,
          isActive: ref.affiliateId.isActive
        };
      }
    }

    // Get all paid invoices for the month from Stripe
    const affiliateEarnings = {};
    let totalMonthlyRevenue = 0;
    let totalMonthlyCommission = 0;
    let hasMore = true;
    let startingAfter = null;

    while (hasMore) {
      const invoiceParams = {
        status: 'paid',
        created: {
          gte: startTimestamp,
          lte: endTimestamp
        },
        limit: 100
      };
      if (startingAfter) {
        invoiceParams.starting_after = startingAfter;
      }

      const invoices = await stripe.invoices.list(invoiceParams);

      for (const invoice of invoices.data) {
        // Check if this invoice belongs to a referred customer
        const referralData = customerToReferral[invoice.customer];
        if (referralData && invoice.subscription && invoice.amount_paid > 0) {
          const affiliateIdStr = referralData.affiliateId.toString();

          if (!affiliateEarnings[affiliateIdStr]) {
            affiliateEarnings[affiliateIdStr] = {
              affiliateId: referralData.affiliateId,
              affiliateName: referralData.affiliateName,
              affiliateEmail: referralData.affiliateEmail,
              affiliateCode: referralData.affiliateCode,
              commissionRate: referralData.commissionRate,
              isActive: referralData.isActive,
              monthlyRevenueCents: 0,
              monthlyCommissionCents: 0,
              invoiceCount: 0
            };
          }

          affiliateEarnings[affiliateIdStr].monthlyRevenueCents += invoice.amount_paid;
          affiliateEarnings[affiliateIdStr].invoiceCount += 1;

          totalMonthlyRevenue += invoice.amount_paid;
        }
      }

      hasMore = invoices.has_more;
      if (hasMore && invoices.data.length > 0) {
        startingAfter = invoices.data[invoices.data.length - 1].id;
      }
    }

    // Calculate commissions for each affiliate
    const affiliateResults = Object.values(affiliateEarnings).map(aff => {
      const commission = Math.round(aff.monthlyRevenueCents * aff.commissionRate / 100);
      aff.monthlyCommissionCents = commission;
      totalMonthlyCommission += commission;
      return aff;
    });

    // Sort by revenue descending
    affiliateResults.sort((a, b) => b.monthlyRevenueCents - a.monthlyRevenueCents);

    res.json({
      success: true,
      year: statsYear,
      month: statsMonth,
      affiliates: affiliateResults,
      totals: {
        totalMonthlyRevenueCents: totalMonthlyRevenue,
        totalMonthlyCommissionCents: totalMonthlyCommission,
        affiliatesWithEarnings: affiliateResults.length
      }
    });
  } catch (error) {
    console.error('Error fetching monthly earnings:', error);
    res.status(500).json({ error: 'Failed to fetch monthly earnings' });
  }
});

// GET referrals for a specific affiliate (Admin Only)
router.get('/:id/referrals', authenticateToken(['admin']), async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const affiliate = await Affiliate.findById(req.params.id);
    if (!affiliate) {
      return res.status(404).json({ error: 'Affiliate not found' });
    }

    const referrals = await Referral.find({ affiliateId: affiliate._id })
      .populate('userId', 'username email createdAt')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    const total = await Referral.countDocuments({ affiliateId: affiliate._id });

    res.json({
      referrals,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching affiliate referrals:', error);
    res.status(500).json({ error: 'Failed to fetch referrals' });
  }
});

// PUBLIC: Validate affiliate code (for signup flow)
router.get('/validate/:code', async (req, res) => {
  try {
    const affiliate = await Affiliate.findOne({
      code: req.params.code,
      isActive: true
    });

    if (!affiliate) {
      return res.status(404).json({ valid: false });
    }

    res.json({
      valid: true,
      affiliateName: affiliate.name
    });
  } catch (error) {
    console.error('Error validating affiliate code:', error);
    res.status(500).json({ error: 'Failed to validate code' });
  }
});

// Record a referral (called during user signup)
router.post('/referral', async (req, res) => {
  try {
    const { affiliateCode, userId } = req.body;

    if (!affiliateCode || !userId) {
      return res.status(400).json({ error: 'Affiliate code and user ID are required' });
    }

    // Find the affiliate
    const affiliate = await Affiliate.findOne({ code: affiliateCode, isActive: true });
    if (!affiliate) {
      return res.status(404).json({ error: 'Invalid or inactive affiliate code' });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if referral already exists for this user
    const existingReferral = await Referral.findOne({ userId });
    if (existingReferral) {
      return res.status(400).json({ error: 'User already has a referral recorded' });
    }

    const referral = new Referral({
      affiliateId: affiliate._id,
      userId: user._id
    });

    await referral.save();
    res.status(201).json({ message: 'Referral recorded successfully' });
  } catch (error) {
    console.error('Error recording referral:', error);
    res.status(500).json({ error: 'Failed to record referral' });
  }
});

// SYNC referral subscription statuses and payment totals from Stripe (Admin Only)
// This updates all referrals with current subscription data and payment history from Stripe
router.post('/sync-subscriptions', authenticateToken(['admin']), async (_req, res) => {
  const stripeConfig = require('../config/stripeConfig');
  const stripe = require('stripe')(stripeConfig.secretKey);

  try {
    // Get all referrals with their users
    const referrals = await Referral.find().populate('userId', 'stripeCustomerId');

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const referral of referrals) {
      try {
        // Skip if user doesn't exist or has no Stripe customer ID
        if (!referral.userId || !referral.userId.stripeCustomerId) {
          skipped++;
          continue;
        }

        const customerId = referral.userId.stripeCustomerId;
        let needsUpdate = false;

        // Get subscriptions from Stripe for this customer
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: 'all',
          limit: 1,
          expand: ['data.items.data.price']
        });

        // Get all paid invoices for this customer to calculate total payments
        let totalPaidCents = 0;
        let firstPaidDate = null;
        let lastPaidDate = null;
        let hasMoreInvoices = true;
        let invoiceStartingAfter = null;

        while (hasMoreInvoices) {
          const invoiceParams = {
            customer: customerId,
            status: 'paid',
            limit: 100
          };
          if (invoiceStartingAfter) {
            invoiceParams.starting_after = invoiceStartingAfter;
          }

          const invoices = await stripe.invoices.list(invoiceParams);

          for (const invoice of invoices.data) {
            // Only count subscription invoices (not one-time payments)
            if (invoice.subscription && invoice.amount_paid > 0) {
              totalPaidCents += invoice.amount_paid;

              const invoiceDate = new Date(invoice.created * 1000);
              if (!firstPaidDate || invoiceDate < firstPaidDate) {
                firstPaidDate = invoiceDate;
              }
              if (!lastPaidDate || invoiceDate > lastPaidDate) {
                lastPaidDate = invoiceDate;
              }
            }
          }

          hasMoreInvoices = invoices.has_more;
          if (hasMoreInvoices && invoices.data.length > 0) {
            invoiceStartingAfter = invoices.data[invoices.data.length - 1].id;
          }
        }

        // Update payment tracking
        if (referral.totalPaymentsCents !== totalPaidCents) {
          referral.totalPaymentsCents = totalPaidCents;
          needsUpdate = true;
        }
        if (lastPaidDate && (!referral.lastPaymentAt || referral.lastPaymentAt.getTime() !== lastPaidDate.getTime())) {
          referral.lastPaymentAt = lastPaidDate;
          needsUpdate = true;
        }

        if (subscriptions.data.length === 0) {
          // No subscription - set to 'none'
          if (referral.subscriptionStatus !== 'none') {
            referral.subscriptionStatus = 'none';
            referral.stripeSubscriptionId = null;
            referral.subscriptionPriceId = null;
            needsUpdate = true;
          }
        } else {
          const subscription = subscriptions.data[0];
          const status = subscription.status === 'active' ? 'active' :
                         subscription.status === 'past_due' ? 'past_due' :
                         subscription.status === 'trialing' ? 'trialing' :
                         subscription.status === 'canceled' ? 'canceled' : 'none';

          const priceId = subscription.items.data[0]?.price?.id || null;

          if (referral.subscriptionStatus !== status) {
            referral.subscriptionStatus = status;
            needsUpdate = true;
          }
          if (referral.stripeSubscriptionId !== subscription.id) {
            referral.stripeSubscriptionId = subscription.id;
            needsUpdate = true;
          }
          if (referral.subscriptionPriceId !== priceId) {
            referral.subscriptionPriceId = priceId;
            needsUpdate = true;
          }

          // Set first subscribed date from first paid invoice or subscription created date
          if (!referral.firstSubscribedAt) {
            referral.firstSubscribedAt = firstPaidDate || new Date(subscription.created * 1000);
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          await referral.save();
          updated++;
        } else {
          skipped++;
        }
      } catch (err) {
        console.error(`Error syncing referral ${referral._id}:`, err.message);
        errors++;
      }
    }

    res.json({
      success: true,
      message: 'Subscription sync completed',
      total: referrals.length,
      updated,
      skipped,
      errors
    });
  } catch (error) {
    console.error('Error syncing referral subscriptions:', error);
    res.status(500).json({ error: 'Failed to sync subscriptions' });
  }
});

module.exports = router;
