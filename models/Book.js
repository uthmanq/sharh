const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
    title: String,
    author: String,
    metadata: Object,
    lines: [{
        Arabic: String,
        English: String,
        commentary: String,
        rootwords: String
    }]
});

const Book = mongoose.model('Book', bookSchema);
module.exports = Book;