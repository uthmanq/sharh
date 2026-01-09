const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ReferralSchema = new Schema({
  affiliateId: {
    type: Schema.Types.ObjectId,
    ref: 'Affiliate',
    required: true,
    index: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  stripeSubscriptionId: {
    type: String,
    default: null,
    index: true
  },
  subscriptionStatus: {
    type: String,
    enum: ['none', 'active', 'canceled', 'past_due', 'trialing'],
    default: 'none'
  },
  subscriptionPriceId: {
    type: String,
    default: null
  },
  firstSubscribedAt: {
    type: Date,
    default: null
  },
  lastPaymentAt: {
    type: Date,
    default: null
  },
  totalPaymentsCents: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound indexes for efficient lookups
ReferralSchema.index({ affiliateId: 1, createdAt: -1 });
ReferralSchema.index({ affiliateId: 1, subscriptionStatus: 1 });
ReferralSchema.index({ createdAt: 1 });

// Pre-save middleware to update timestamp
ReferralSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to get monthly stats for an affiliate
ReferralSchema.statics.getMonthlyStats = async function(affiliateId, year, month) {
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  const stats = await this.aggregate([
    {
      $match: {
        affiliateId: new mongoose.Types.ObjectId(affiliateId),
        createdAt: { $lte: endOfMonth }
      }
    },
    {
      $facet: {
        newReferrals: [
          {
            $match: {
              createdAt: { $gte: startOfMonth, $lte: endOfMonth }
            }
          },
          { $count: 'count' }
        ],
        totalReferrals: [
          { $count: 'count' }
        ],
        activeSubscriptions: [
          {
            $match: {
              subscriptionStatus: 'active'
            }
          },
          { $count: 'count' }
        ],
        newSubscriptions: [
          {
            $match: {
              firstSubscribedAt: { $gte: startOfMonth, $lte: endOfMonth }
            }
          },
          { $count: 'count' }
        ]
      }
    }
  ]);

  const result = stats[0];
  return {
    newReferrals: result.newReferrals[0]?.count || 0,
    totalReferrals: result.totalReferrals[0]?.count || 0,
    activeSubscriptions: result.activeSubscriptions[0]?.count || 0,
    newSubscriptions: result.newSubscriptions[0]?.count || 0
  };
};

// Static method to get all affiliates' monthly stats
ReferralSchema.statics.getAllAffiliatesMonthlyStats = async function(year, month) {
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  return this.aggregate([
    {
      $facet: {
        byAffiliate: [
          {
            $group: {
              _id: '$affiliateId',
              totalReferrals: { $sum: 1 },
              activeSubscriptions: {
                $sum: { $cond: [{ $eq: ['$subscriptionStatus', 'active'] }, 1, 0] }
              },
              newReferralsThisMonth: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $gte: ['$createdAt', startOfMonth] },
                        { $lte: ['$createdAt', endOfMonth] }
                      ]
                    },
                    1,
                    0
                  ]
                }
              },
              newSubscriptionsThisMonth: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $gte: ['$firstSubscribedAt', startOfMonth] },
                        { $lte: ['$firstSubscribedAt', endOfMonth] }
                      ]
                    },
                    1,
                    0
                  ]
                }
              },
              totalRevenueCents: { $sum: '$totalPaymentsCents' }
            }
          },
          {
            $lookup: {
              from: 'affiliates',
              localField: '_id',
              foreignField: '_id',
              as: 'affiliate'
            }
          },
          { $unwind: '$affiliate' },
          {
            $project: {
              _id: 1,
              affiliateName: '$affiliate.name',
              affiliateEmail: '$affiliate.email',
              affiliateCode: '$affiliate.code',
              isActive: '$affiliate.isActive',
              commissionRate: '$affiliate.commissionRate',
              totalReferrals: 1,
              activeSubscriptions: 1,
              newReferralsThisMonth: 1,
              newSubscriptionsThisMonth: 1,
              totalRevenueCents: 1
            }
          },
          { $sort: { activeSubscriptions: -1 } }
        ],
        totals: [
          {
            $group: {
              _id: null,
              totalReferrals: { $sum: 1 },
              totalActiveSubscriptions: {
                $sum: { $cond: [{ $eq: ['$subscriptionStatus', 'active'] }, 1, 0] }
              },
              totalNewReferralsThisMonth: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $gte: ['$createdAt', startOfMonth] },
                        { $lte: ['$createdAt', endOfMonth] }
                      ]
                    },
                    1,
                    0
                  ]
                }
              },
              totalNewSubscriptionsThisMonth: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $gte: ['$firstSubscribedAt', startOfMonth] },
                        { $lte: ['$firstSubscribedAt', endOfMonth] }
                      ]
                    },
                    1,
                    0
                  ]
                }
              },
              totalRevenueCents: { $sum: '$totalPaymentsCents' }
            }
          }
        ]
      }
    }
  ]);
};

module.exports = mongoose.model('Referral', ReferralSchema);
