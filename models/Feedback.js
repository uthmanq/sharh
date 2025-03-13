const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Create a log entry schema for the logs array
const logEntrySchema = new mongoose.Schema({
    message: {
        type: String,
        required: true
    },
    addedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const feedbackSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['Suggestion', 'Bug', 'Content'],
        required: true
    },
    details: {
        type: String,
        required: true
    },
    sitePage: {
        type: String,
        default: ''
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    status: {
        type: String,
        enum: ['New', 'In Progress', 'Completed', 'Removed'],
        default: 'New'
    },
    assignedTo: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    logs: [logEntrySchema],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Feedback = mongoose.model('Feedback', feedbackSchema);
module.exports = Feedback;