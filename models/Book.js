const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Assuming you have a User model in the same folder
const User = require('./User'); 

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
    }
});

const Book = mongoose.model('Book', bookSchema);
module.exports = Book;
