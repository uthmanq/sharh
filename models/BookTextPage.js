const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { indexBookTextDocument } = require('../services/ElasticService');

const BookTextPageSchema = new Schema({
  bookTextId: {
    type: Schema.Types.ObjectId,
    ref: 'BookText',
    required: true,
    index: true
  },
  jobId: {
    type: String,
    required: true,
    index: true
  },
  pageNumber: {
    type: Number,
    required: true,
    index: true
  },
  text: {
    type: String,
    default: ''
  },
  s3Key: {
    type: String
  },
  isAIGenerated: {
    type: Boolean,
    default: true
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

// Compound index for efficient queries
BookTextPageSchema.index({ bookTextId: 1, pageNumber: 1 }, { unique: true });
BookTextPageSchema.index({ jobId: 1, pageNumber: 1 });

// Pre-save middleware to update updatedAt
BookTextPageSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Post-save middleware to re-index parent BookText in Elasticsearch
BookTextPageSchema.post('save', async function(doc) {
  try {
    const BookText = mongoose.model('BookText');
    const bookText = await BookText.findById(doc.bookTextId);
    if (bookText) {
      await indexBookTextDocument(bookText);
    }
  } catch (error) {
    console.error('Error re-indexing BookText after page save:', error);
  }
});

// Post-update middleware to re-index parent BookText in Elasticsearch
BookTextPageSchema.post('findOneAndUpdate', async function(doc) {
  try {
    if (!doc) return;
    const BookText = mongoose.model('BookText');
    const bookText = await BookText.findById(doc.bookTextId);
    if (bookText) {
      await indexBookTextDocument(bookText);
    }
  } catch (error) {
    console.error('Error re-indexing BookText after page update:', error);
  }
});

// Post-delete middleware to re-index parent BookText in Elasticsearch
BookTextPageSchema.post('findOneAndDelete', async function(doc) {
  try {
    if (!doc) return;
    const BookText = mongoose.model('BookText');
    const bookText = await BookText.findById(doc.bookTextId);
    if (bookText) {
      await indexBookTextDocument(bookText);
    }
  } catch (error) {
    console.error('Error re-indexing BookText after page delete:', error);
  }
});

BookTextPageSchema.post('deleteOne', { document: true, query: false }, async function(doc) {
  try {
    const BookText = mongoose.model('BookText');
    const bookText = await BookText.findById(doc.bookTextId);
    if (bookText) {
      await indexBookTextDocument(bookText);
    }
  } catch (error) {
    console.error('Error re-indexing BookText after page delete:', error);
  }
});

module.exports = mongoose.model('BookTextPage', BookTextPageSchema);
