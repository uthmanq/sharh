const mongoose = require('mongoose');
const Schema = mongoose.Schema;

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
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Feedback = mongoose.model('Feedback', feedbackSchema);
module.exports = Feedback;
