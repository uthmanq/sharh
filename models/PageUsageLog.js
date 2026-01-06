const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PageUsageLogSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  usageRecordId: {
    type: Schema.Types.ObjectId,
    ref: 'UsageRecord',
    required: true,
    index: true
  },
  jobId: {
    type: String,
    required: true,
    index: true
  },
  bookTextId: {
    type: Schema.Types.ObjectId,
    ref: 'BookText',
    required: true
  },
  pageCount: {
    type: Number,
    required: true
  },
  freePages: {
    type: Number,
    default: 0
  },
  overagePages: {
    type: Number,
    default: 0
  },
  overageChargeCents: {
    type: Number,
    default: 0
  },
  stripeInvoiceItemId: {
    type: String
  },
  stripeInvoiceId: {
    type: String
  },
  paymentStatus: {
    type: String,
    enum: ['not_required', 'success', 'failed', 'pending'],
    default: 'not_required'
  },
  paymentError: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

PageUsageLogSchema.index({ jobId: 1 });
PageUsageLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PageUsageLog', PageUsageLogSchema);
