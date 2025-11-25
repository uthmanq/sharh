const mongoose = require('mongoose');
const Schema = mongoose.Schema;

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

async function reindexPageAndParent(doc) {
  if (!doc) return;

  try {
    const {
      indexBookTextDocument,
      indexBookTextPageDocument
    } = require('../services/ElasticService');
    const BookText = mongoose.model('BookText');
    const bookText = await BookText.findById(doc.bookTextId);
    if (bookText) {
      await Promise.all([
        indexBookTextDocument(bookText),
        indexBookTextPageDocument(doc, bookText)
      ]);
    } else {
      await indexBookTextPageDocument(doc);
    }
  } catch (error) {
    console.error('Error re-indexing page and parent BookText:', error);
  }
}

async function removePageAndUpdateParent(doc) {
  if (!doc) return;

  try {
    const {
      indexBookTextDocument,
      removeBookTextPageDocument
    } = require('../services/ElasticService');
    const BookText = mongoose.model('BookText');
    const bookText = await BookText.findById(doc.bookTextId);
    if (bookText) {
      await indexBookTextDocument(bookText);
    }
    await removeBookTextPageDocument(doc._id);
  } catch (error) {
    console.error('Error removing page and re-indexing parent:', error);
  }
}

BookTextPageSchema.post('save', reindexPageAndParent);
BookTextPageSchema.post('findOneAndUpdate', reindexPageAndParent);
BookTextPageSchema.post('findOneAndDelete', removePageAndUpdateParent);
BookTextPageSchema.post('deleteOne', { document: true, query: false }, removePageAndUpdateParent);

module.exports = mongoose.model('BookTextPage', BookTextPageSchema);
