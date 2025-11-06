const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const folderSchema = new mongoose.Schema({
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
    notes: [{
        type: Schema.Types.ObjectId,
        ref: 'Note'
    }],
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
folderSchema.pre('save', function(next) {
    this.lastModified = Date.now();
    next();
});

const Folder = mongoose.model('Folder', folderSchema);
module.exports = Folder;
