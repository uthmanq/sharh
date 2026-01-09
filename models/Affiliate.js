const mongoose = require('mongoose');
const crypto = require('crypto');
const Schema = mongoose.Schema;

const AffiliateSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  code: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  commissionRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  notes: {
    type: String,
    default: ''
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
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

// Pre-save middleware to update timestamp
AffiliateSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to generate a unique affiliate code
AffiliateSchema.statics.generateUniqueCode = async function(baseName) {
  const baseCode = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 8);

  let code = baseCode;
  let suffix = 1;

  while (await this.findOne({ code })) {
    code = `${baseCode}${suffix}`;
    suffix++;
  }

  return code;
};

// Virtual for full referral link
AffiliateSchema.virtual('referralLink').get(function() {
  const baseUrl = process.env.FRONTEND_URL || 'https://sharh.io';
  return `${baseUrl}?ref=${this.code}`;
});

// Ensure virtuals are included in JSON
AffiliateSchema.set('toJSON', { virtuals: true });
AffiliateSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Affiliate', AffiliateSchema);
