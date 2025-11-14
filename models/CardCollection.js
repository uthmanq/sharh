const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const cardCollectionSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    owner: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    cards: [{
        type: Schema.Types.ObjectId,
        ref: 'Card'
    }],
    settings: {
        // Daily review limit
        cardsPerDay: {
            type: Number,
            default: 20
        },
        // New cards per day
        newCardsPerDay: {
            type: Number,
            default: 10
        }
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
cardCollectionSchema.pre('save', function(next) {
    this.lastModified = Date.now();
    next();
});

// Method to get cards due for review
cardCollectionSchema.methods.getDueCards = async function(limit = null) {
    const Card = mongoose.model('Card');

    let query = Card.find({
        collection: this._id,
        nextReviewDate: { $lte: new Date() }
    }).sort({ nextReviewDate: 1 });

    if (limit) {
        query = query.limit(limit);
    }

    return query.exec();
};

// Method to get new cards (never reviewed)
cardCollectionSchema.methods.getNewCards = async function(limit = null) {
    const Card = mongoose.model('Card');

    let query = Card.find({
        collection: this._id,
        repetitions: 0,
        lastReviewDate: null
    }).sort({ createdAt: 1 });

    if (limit) {
        query = query.limit(limit);
    }

    return query.exec();
};

// Method to get collection stats
cardCollectionSchema.methods.getStats = async function() {
    const Card = mongoose.model('Card');

    const total = await Card.countDocuments({ collection: this._id });
    const due = await Card.countDocuments({
        collection: this._id,
        nextReviewDate: { $lte: new Date() }
    });
    const newCards = await Card.countDocuments({
        collection: this._id,
        repetitions: 0,
        lastReviewDate: null
    });
    const learning = await Card.countDocuments({
        collection: this._id,
        repetitions: { $gt: 0, $lt: 3 }
    });
    const mature = await Card.countDocuments({
        collection: this._id,
        repetitions: { $gte: 3 }
    });

    return {
        total,
        due,
        new: newCards,
        learning,
        mature
    };
};

const CardCollection = mongoose.model('CardCollection', cardCollectionSchema);
module.exports = CardCollection;
