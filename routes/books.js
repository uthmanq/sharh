const express = require('express');
const router = express.Router();
require('dotenv').config();
const Book = require('../models/Book')
const authenticateToken = require('../middleware/authenticate')

const getExcerpt = (text, query, contextLength = 35) => {
    const regex = new RegExp(`(.{0,${contextLength}}\\b)\\b(${query})\\b(\\b.{0,${contextLength}})`, 'i');
    const match = text.match(regex);
    if (match) {
        const before = match[1] ? match[1].split(' ') : [];
        const after = match[3] ? match[3].split(' ') : [];
        
        // Join before and after with proper context length
        const beforeText = before.slice(-(contextLength)).join(' ');
        const afterText = after.slice(0, contextLength).join(' ');
        
        return `${beforeText} ${match[2]} ${afterText}`.trim();
    }
    return null;
};

router.get('/search', async (req, res) => {
    const { q } = req.query;
    if (!q) {
        return res.status(400).send('Bad Request: Missing query parameter');
    }
    try {
        const books = await Book.find({
            $or: [
                { title: { $regex: q, $options: 'i' } },
                { author: { $regex: q, $options: 'i' } },
                { 'lines.Arabic': { $regex: q, $options: 'i' } },
                { 'lines.English': { $regex: q, $options: 'i' } },
                { 'lines.commentary': { $regex: q, $options: 'i' } },
                { 'lines.rootwords': { $regex: q, $options: 'i' } }
            ],
            'metadata.hidden': { $ne: true }
        });

        const formattedBooks = books.map(book => {
            const matchingLines = book.lines.filter(line => 
                line.Arabic.match(new RegExp(q, 'i')) ||
                line.English.match(new RegExp(q, 'i')) ||
                (line.commentary && line.commentary.match(new RegExp(q, 'i'))) ||
                (line.rootwords && line.rootwords.match(new RegExp(q, 'i')))
            ).map(line => {
                let excerpt = '';
                if (line.Arabic.match(new RegExp(q, 'i'))) {
                    excerpt = getExcerpt(line.Arabic, q);
                } else if (line.English.match(new RegExp(q, 'i'))) {
                    excerpt = getExcerpt(line.English, q);
                } else if (line.commentary && line.commentary.match(new RegExp(q, 'i'))) {
                    excerpt = getExcerpt(line.commentary, q);
                } else if (line.rootwords && line.rootwords.match(new RegExp(q, 'i'))) {
                    excerpt = getExcerpt(line.rootwords, q);
                }
                return {
                    id: line._id,
                    excerpt: excerpt
                };
            });

            if (matchingLines.length > 0) {
                return {
                    id: book._id,
                    title: book.title,
                    author: book.author,
                    metadata: book.metadata || {},
                    matchingLines: matchingLines
                };
            } else if (
                book.title.match(new RegExp(q, 'i')) ||
                book.author.match(new RegExp(q, 'i'))
            ) {
                return {
                    id: book._id,
                    title: book.title,
                    author: book.author,
                    metadata: book.metadata || {},
                    matchingLines: []
                };
            }
        }).filter(book => book !== undefined);

        res.json({ books: formattedBooks });
    } catch (err) {
        console.error('Error during book search:', err);
        res.status(500).send('Internal Server Error');
    }
});


// Other routes
router.get('/', async (req, res) => {
    try {
        const books = await Book.find({ 'metadata.hidden': { $ne: true } });
        const formattedBooks = books.map(book => {
            return {
                id: book._id,
                title: book.title,
                author: book.author,
                metadata: book.metadata || {},
               // lines: book.lines.map(line => {
               //     return {
               //         id: line._id,
                 //       Arabic: line.Arabic,
                   //     English: line.English,
                     //   commentary: line.commentary || "",
                    //    rootwords: line.rootwords || ""
                  //  };
             //   })
            };
        });
        res.json({ books: formattedBooks });
    } catch (err) {
        res.status(500).send('Internal Server Error (1)');
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
        res.status(500).send('Internal Server Error (2)');
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
        res.status(500).send('Internal Server Error (3)');
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
        res.status(500).send('Internal Server Error (4)');
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
        res.status(500).send('Internal Server Error (6)');
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
        res.status(500).send('Internal Server Error (7)');
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
        res.status(500).send('Internal Server Error (8)');
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
        res.status(500).send('Internal Server Error (9)');
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
        res.status(500).send('Internal Server Error (10)');
    }
});

// PUT /:bookId (Edit Metadata and Book Title)
router.put('/:bookId', authenticateToken, async (req, res) => {
    const { title, author, metadata } = req.body;
    // Optional: Add validation logic here for title, author, and metadata if needed

    try {
        const book = await Book.findById(req.params.bookId);
        if (!book) {
            return res.status(404).send('Not Found: No book with the given ID exists');
        }

        // Update book fields if they are provided in the request body
        if (title) book.title = title;
        if (author) book.author = author;
        if (metadata) book.metadata = metadata;

        const updatedBook = await book.save();
        const formattedBook = {
            id: updatedBook._id,
            title: updatedBook.title,
            author: updatedBook.author,
            metadata: updatedBook.metadata || {},
            lines: updatedBook.lines.map(line => {
                return {
                    id: line._id,
                    Arabic: line.Arabic,
                    English: line.English,
                    commentary: line.commentary || "",
                    rootwords: line.rootwords || ""
                };
            })
        };
        console.log("success")
        res.status(200).json('Book updated successfully');
    } catch (err) {
        console.log(err);
        res.status(500).send('Internal Server Error (11)');
    }
});

module.exports = router;
