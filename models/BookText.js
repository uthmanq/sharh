const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const BookTextSchema = new Schema({
  fileId: {
    type: Schema.Types.ObjectId,
    ref: 'File',
    required: true,
    index: true
  },
  jobId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  extractedText: {
    type: String,
    default: ''
  },
  language: {
    type: String,
    default: 'ar'
  },
  pageCount: {
    type: Number
  },
  pages: [{
    pageNumber: Number,
    text: String,
    s3Key: String,
    isAIGenerated: {
      type: Boolean,
      default: true
    }
  }],
  metadata: {
    type: Object,
    default: {}
  },
  visibility: {
    type: String,
    enum: ['public', 'private'],
    default: 'private'
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'submission_failed'],
    default: 'pending',
    required: true
  },
  error: {
    type: String
  },
  processingTime: {
    type: Number // Time in milliseconds
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  }
});

// Create index for faster queries
BookTextSchema.index({ fileId: 1, status: 1 });
BookTextSchema.index({ userId: 1, createdAt: -1 });

// Pre-save middleware to update updatedAt
BookTextSchema.pre('save', function(next) {
  this.updatedAt = Date.now();

  // Set completedAt when status changes to completed
  if (this.isModified('status') && this.status === 'completed') {
    this.completedAt = Date.now();
  }

  next();
});

module.exports = mongoose.model('BookText', BookTextSchema);
