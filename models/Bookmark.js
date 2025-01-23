const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const bookmarkSchema = new mongoose.Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    book: {
        type: Schema.Types.ObjectId,
        ref: 'Book',
        required: true
    },
    lineId: {
        type: Number,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    notes: {
        type: String,
        default: ''
    }
});

// Create compound index for unique bookmarks per user/book/line combination
bookmarkSchema.index({ user: 1, book: 1, lineId: 1 }, { unique: true });

const Bookmark = mongoose.model('Bookmark', bookmarkSchema);
module.exports = Bookmark;