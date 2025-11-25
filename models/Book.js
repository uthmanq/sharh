const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { 
    indexBookDocument, 
    removeBookDocument 
} = require('../services/ElasticService');

const bookSchema = new mongoose.Schema({
    title: String,
    author: String,
    metadata: Object,
    lines: [{
        Arabic: String,
        English: String,
        commentary: String,
        rootwords: String
    }],
    owner: { 
        type: Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    contributors: [{ 
        type: Schema.Types.ObjectId, 
        ref: 'User' 
    }],
    visibility: { 
        type: String, 
        enum: ['private', 'public'], 
        default: 'private' 
    },
    lastUpdated: { 
        type: Date, 
        default: Date.now 
    },
    category: {
        type: String,
        default: 'Uncategorized'
    },
    translator: {
        type: String,
        default: 'Unknown'
    },
    description: {
        type: String,
        default: ''
    },
    progress: {
        type: String,
        enum: ['In Progress', 'Near Complete', 'Complete'],
        default: 'In Progress',
      },
    difficulty: {
        type: String,
        enum: ['Beginner', 'Intermediate', 'Advanced'],
        default: 'Beginner',
      },
      prerequisites: [{
        type: Schema.Types.ObjectId,
        ref: 'Book'
    }]
});

// Middleware to update 'lastUpdated' before each save
bookSchema.pre('save', function(next) {
    this.lastUpdated = Date.now();
    next();
});

bookSchema.post('save', function(doc) {
    indexBookDocument(doc);
});

bookSchema.post('findOneAndUpdate', function(doc) {
    if (doc) {
        indexBookDocument(doc);
    }
});

bookSchema.post('findOneAndDelete', function(doc) {
    if (doc && doc._id) {
        removeBookDocument(doc._id);
    }
});

bookSchema.post('deleteOne', { document: true, query: false }, function(doc) {
    if (doc && doc._id) {
        removeBookDocument(doc._id);
    }
});

const Book = mongoose.model('Book', bookSchema);
module.exports = Book;
