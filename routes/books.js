const express = require('express');
const router = express.Router();
require('dotenv').config();
const Book = require('../models/Book')
const authenticateToken = require('../middleware/authenticate')

router.get('/', async (req, res) => {
    try {
        const books = await Book.find({});
        const formattedBooks = books.map(book => {
            return {
                id: book._id,
                title: book.title,
                author: book.author,
                metadata: book.metadata || {},
                lines: book.lines.map(line => {
                    return {
                        id: line._id,
                        Arabic: line.Arabic,
                        English: line.English,
                        commentary: line.commentary || "",
                        rootwords: line.rootwords || ""
                    };
                })
            };
        });
        res.json({ books: formattedBooks });
    } catch (err) {
        res.status(500).send('Internal Server Error');
    }
});

// POST 
router.post('/', authenticateToken, async (req, res) => {
    const newBook = new Book(req.body.newBook);
    if (!newBook || !newBook.title || !newBook.author) {
        return res.status(400).send('Bad Request: Missing required fields');
    }
    try {
        const existingBook = await Book.findOne({ title: newBook.title });
        if (existingBook) {
            return res.status(400).send('Bad Request: Book with the same title already exists');
        }
        const savedBook = await newBook.save();
        const formattedBook = {
            id: savedBook._id,
            title: savedBook.title,
            author: savedBook.author,
            metadata: savedBook.metadata || {},
            lines: savedBook.lines.map(line => {
                return {
                    id: line._id,
                    Arabic: line.Arabic,
                    English: line.English,
                    commentary: line.commentary || "",
                    rootwords: line.rootwords || ""
                };
            })
        };
        res.status(201).json(formattedBook);
    } catch (err) {
        console.log(err)
        res.status(500).send('Internal Server Error');
    }
});

// GET /:bookId
router.get('/:bookId', async (req, res) => {
    try {
        const book = await Book.findById(req.params.bookId);
        if (!book) {
            return res.status(404).send('Not Found: No book with the given ID exists');
        }
        const formattedBook = {
            id: book._id,
            title: book.title,
            author: book.author,
            metadata: book.metadata || {},
            lines: book.lines.map(line => {
                return {
                    id: line._id,
                    Arabic: line.Arabic,
                    English: line.English,
                    commentary: line.commentary || "",
                    rootwords: line.rootwords || ""
                };
            })
        };
        res.json(formattedBook);
    } catch (err) {
        res.status(500).send('Internal Server Error');
    }
});

// GET /:bookId/lines
router.get('/:bookId/lines', async (req, res) => {
    try {
        const book = await Book.findById(req.params.bookId);
        // console.log(book)

        if (!book) {
            return res.status(404).send('Not Found: No book with the given ID exists');
        }
        const formattedLines = book.lines.map(line => {
            return {
                id: line._id,
                Arabic: line.Arabic,
                English: line.English,
                commentary: line.commentary || "",
                rootwords: line.rootwords || ""
            };
        });
        res.json({
            id: book._id,
            title: book.title,
            author: book.author,
            metadata: book.metadata || {},
            lines: formattedLines
        });
    } catch (err) {
        res.status(500).send('Internal Server Error');
    }
});

// POST /:bookId/lines
router.post('/:bookId/lines', authenticateToken, async (req, res) => {
    const position = req.body.position;
    const newLine = req.body.newLine;
    if (!newLine || !newLine.Arabic || !newLine.English) {
        return res.status(400).send('Bad Request: Missing required fields');
    }
    try {
        const book = await Book.findById(req.params.bookId);
        if (!book) {
            return res.status(404).send('Not Found: No book with the given ID exists');
        }
        const existingLine = book.lines.find(line => line.Arabic === newLine.Arabic);
        if (existingLine) {
            return res.status(400).send('Bad Request: Line with the same Arabic field already exists');
        }

        if (position != null && position >= 0 && position <= book.lines.length) {
            book.lines.splice(position, 0, newLine);
        } else {
            book.lines.push(newLine);
        }
        const updatedBook = await book.save();
        const lastLine = updatedBook.lines[updatedBook.lines.length - 1];
        const formattedLine = {
            id: lastLine._id,
            Arabic: lastLine.Arabic,
            English: lastLine.English,
            commentary: lastLine.commentary || "",
            rootwords: lastLine.rootwords || ""
        };
        res.status(201).json(formattedLine);
    } catch (err) {
        console.log(err);
        res.status(500).send('Internal Server Error');
    }
});

// GET /:bookId/lines/:lineId
router.get('/:bookId/lines/:lineId', async (req, res) => {
    try {
        const book = await Book.findById(req.params.bookId, 'lines');
        if (!book) {
            return res.status(404).send('Not Found: No book with the given ID exists');
        }
        const line = book.lines.id(req.params.lineId);
        if (!line) {
            return res.status(404).send('Not Found: No line with the given ID exists');
        }
        const formattedLine = {
            id: line._id,
            Arabic: line.Arabic,
            English: line.English,
            commentary: line.commentary || "",
            rootwords: line.rootwords || ""
        };
        res.json(formattedLine);
    } catch (err) {
        res.status(500).send('Internal Server Error');
    }
});

// PUT /:bookId/lines/:lineId
router.put('/:bookId/lines/:lineId', authenticateToken, async (req, res) => {
    const updatedLine = req.body.updatedLine;
    if (!updatedLine || !updatedLine.Arabic || !updatedLine.English) {
        return res.status(400).send('Bad Request: Missing required fields');
    }
    try {
        const book = await Book.findById(req.params.bookId);
        if (!book) {
            return res.status(404).send('Not Found: No book with the given ID exists');
        }
        const line = book.lines.id(req.params.lineId);
        if (!line) {
            return res.status(404).send('Not Found: No line with the given ID exists');
        }
        line.set(updatedLine);
        const updatedBook = await book.save();
        const updatedLineInBook = updatedBook.lines.id(req.params.lineId);
        const formattedLine = {
            id: updatedLineInBook._id,
            Arabic: updatedLineInBook.Arabic,
            English: updatedLineInBook.English,
            commentary: updatedLineInBook.commentary || "",
            rootwords: updatedLineInBook.rootwords || ""
        };
        res.json(formattedLine);
    } catch (err) {
        res.status(500).send('Internal Server Error');
    }
});

// DELETE /:bookId/lines/:lineId
router.delete('/:bookId/lines/:lineId', authenticateToken, async (req, res) => {
    try {
        const book = await Book.findById(req.params.bookId);
        if (!book) {
            return res.status(404).send('Not Found: No book with the given ID exists');
        }

        const lineId = req.params.lineId;
        book.lines.pull({ _id: lineId });

        await book.save();
        res.status(200).json('Line deleted successfully');
    } catch (err) {
        console.log(err)
        res.status(500).send('Internal Server Error');
    }
});

// Move Line
router.put('/:bookId/lines/:index/move', authenticateToken, async (req, res) => {
    const fromIndex = parseInt(req.body.fromIndex);
    const toIndex = parseInt(req.body.toIndex);
    const bookId = req.params.bookId;

    if (isNaN(fromIndex) || isNaN(toIndex)) {
        return res.status(400).send('Bad Request: Indices must be integers');
    }

    try {
        const book = await Book.findById(bookId);
        if (!book) {
            return res.status(404).send('Not Found: No book with the given ID exists');
        }

        if (fromIndex < 0 || fromIndex >= book.lines.length || toIndex < 0 || toIndex >= book.lines.length) {
            return res.status(400).send('Bad Request: Indices out of range');
        }

        const [movedLine] = book.lines.splice(fromIndex, 1);
        book.lines.splice(toIndex, 0, movedLine);

        await book.save();
        res.status(200).json('Line moved successfully');
    } catch (err) {
        console.log(err);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
