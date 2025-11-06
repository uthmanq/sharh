const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const sectionSchema = new mongoose.Schema({
    title: {
        type: String,
        default: ''
    },
    notes: {
        type: String,
        default: ''
    }
});

const noteSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    sections: [sectionSchema],
    owner: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    folder: {
        type: Schema.Types.ObjectId,
        ref: 'Folder',
        required: true
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
noteSchema.pre('save', function(next) {
    this.lastModified = Date.now();
    next();
});

const Note = mongoose.model('Note', noteSchema);
module.exports = Note;
