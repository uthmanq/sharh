const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UsageRecordSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  stripeCustomerId: {
    type: String,
    required: true,
    index: true
  },
  subscriptionId: {
    type: String,
    required: true,
    index: true
  },
  billingPeriodStart: {
    type: Date,
    required: true
  },
  billingPeriodEnd: {
    type: Date,
    required: true
  },
  priceId: {
    type: String,
    required: true
  },
  tierCredits: {
    type: Number,
    required: true
  },
  pagesUsed: {
    type: Number,
    default: 0
  },
  overagePages: {
    type: Number,
    default: 0
  },
  overageChargedCents: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'closed'],
    default: 'active'
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
UsageRecordSchema.index({ userId: 1, billingPeriodStart: -1 });
UsageRecordSchema.index({ subscriptionId: 1, status: 1 });
UsageRecordSchema.index({ billingPeriodEnd: 1, status: 1 });

// Pre-save middleware to update timestamp
UsageRecordSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual for remaining credits
UsageRecordSchema.virtual('remainingCredits').get(function() {
  return Math.max(0, this.tierCredits - this.pagesUsed);
});

// Virtual to check if in overage
UsageRecordSchema.virtual('isInOverage').get(function() {
  return this.pagesUsed > this.tierCredits;
});

module.exports = mongoose.model('UsageRecord', UsageRecordSchema);
