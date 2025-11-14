const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const cardSchema = new mongoose.Schema({
    front: {
        type: String,
        required: true
    },
    back: {
        type: String,
        required: true
    },
    // Spaced repetition fields using SM-2 algorithm
    easeFactor: {
        type: Number,
        default: 2.5,
        min: 1.3
    },
    interval: {
        type: Number,
        default: 0 // Days until next review
    },
    repetitions: {
        type: Number,
        default: 0
    },
    nextReviewDate: {
        type: Date,
        default: Date.now
    },
    lastReviewDate: {
        type: Date,
        default: null
    },
    // Additional metadata
    collection: {
        type: Schema.Types.ObjectId,
        ref: 'CardCollection',
        required: true
    },
    owner: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    tags: {
        type: [String],
        default: []
    },
    notes: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastModified: {
        type: Date,
        default: Date.now
    }
});

// Middleware to update 'lastModified' before each save
cardSchema.pre('save', function(next) {
    this.lastModified = Date.now();
    next();
});

// Method to update card based on review performance (SM-2 algorithm)
// quality: 0-5 (0 = complete blackout, 5 = perfect response)
cardSchema.methods.recordReview = function(quality) {
    this.lastReviewDate = Date.now();

    if (quality < 3) {
        // Failed recall - reset
        this.repetitions = 0;
        this.interval = 1;
    } else {
        // Successful recall
        if (this.repetitions === 0) {
            this.interval = 1;
        } else if (this.repetitions === 1) {
            this.interval = 6;
        } else {
            this.interval = Math.round(this.interval * this.easeFactor);
        }
        this.repetitions += 1;
    }

    // Update ease factor
    this.easeFactor = Math.max(
        1.3,
        this.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    );

    // Set next review date
    this.nextReviewDate = new Date(Date.now() + this.interval * 24 * 60 * 60 * 1000);

    return this.save();
};

const Card = mongoose.model('Card', cardSchema);
module.exports = Card;
