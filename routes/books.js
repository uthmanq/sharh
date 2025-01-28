const express = require('express');
const router = express.Router();
require('dotenv').config();
const Book = require('../models/Book')
const authenticateToken = require('../middleware/authenticate')
const multer = require('multer');
const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.SECRET_KEY;
const User = require('../models/User'); // Ensure you have the User model imported
const EditGuard = require('../middleware/editguard')
// Configure AWS SDK for the new bucket
// const s3 = new AWS.S3({
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//     region: process.env.AWS_REGION
// });

// // Configure Multer storage (for memory storage)
// const storage = multer.memoryStorage();
// const upload = multer({ storage: storage });

const getExcerpt = (text, query, contextLength = 35) => {
    const index = text.toLowerCase().indexOf(query.toLowerCase());
    if (index === -1) return null;
    
    let start = Math.max(0, index - contextLength);
    let end = Math.min(text.length, index + query.length + contextLength);
    
    // Adjust to word boundaries
    start = text.lastIndexOf(' ', start) + 1;
    end = text.indexOf(' ', end);
    if (end === -1) end = text.length;
    
    return text.slice(start, end).trim();
};

router.get('/search', async (req, res) => {
    const { q } = req.query;
    if (!q) {
        return res.status(400).send('Bad Request: Missing query parameter');
    }

    try {
        // Get token from header
        const token = req.header('Authorization')?.split(' ')[1];
        let user = null;

        // Verify token if provided
        if (token) {
            try {
                const decoded = jwt.verify(token, SECRET_KEY);
                user = await User.findById(decoded.id);
            } catch (err) {
                // Token invalid - treat as public access
                console.error('Invalid token:', err);
            }
        }

        // Build query based on user role
        let query = {
            $or: [
                { title: { $regex: q, $options: 'i' } },
                { author: { $regex: q, $options: 'i' } },
                { 'lines.Arabic': { $regex: q, $options: 'i' } },
                { 'lines.English': { $regex: q, $options: 'i' } },
                { 'lines.commentary': { $regex: q, $options: 'i' } },
                { 'lines.rootwords': { $regex: q, $options: 'i' } }
            ]
        };

        // Add visibility filters based on role
        if (!user) {
            console.log("public")
            // Public access - only show public books
            query.visibility = 'public';
        } else if (user.roles.includes('admin')) {
            console.log("admin")
            // Admin access - show all books
            // No additional filters needed
        } else if (user.roles.includes('member')) {
            console.log("member")
            // Member access - show public books and owned books
            query.$or.push(
                { visibility: 'public' },
                { owner: user._id },
                { contributors: user._id }
            );
        }

        const books = await Book.find(query);

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
        const books = await Book.find({ visibility: 'public' });
        const formattedBooks = books.map(book => {
            return {
                id: book._id,
                title: book.title,
                author: book.author,
                metadata: book.metadata || {},
                lastUpdated: book.lastUpdated
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

router.get('/mybooks', authenticateToken(['user', 'editor', 'member', 'admin']), async (req, res) => {
    try {
        // Find books where the logged-in user is the owner or a contributor
        const books = await Book.find({
            $or: [
                { owner: req.user._id },
                { contributors: req.user._id }
            ]
        });

        // Format the books as needed
        const formattedBooks = books.map(book => {
            return {
                id: book._id,
                title: book.title,
                author: book.author,
                metadata: book.metadata || {},
                // Uncomment if you want to include lines in the response
                // lines: book.lines.map(line => {
                //     return {
                //         id: line._id,
                //         Arabic: line.Arabic,
                //         English: line.English,
                //         commentary: line.commentary || "",
                //         rootwords: line.rootwords || ""
                //     };
                // })
            };
        });

        // Send the formatted books as a response
        res.json({ books: formattedBooks });
    } catch (err) {
        res.status(500).send('Internal Server Error (1)');
    }
});


// POST 
router.post('/', authenticateToken(['member','editor', 'admin']), async (req, res) => {
    const newBookData = {
        ...req.body.newBook,
        owner: req.user._id // Assuming req.user contains the authenticated user's data
    };

    const newBook = new Book(newBookData);
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
            }),
            owner: req.user
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
        // Get token from header (if it exists)
        const token = req.header('Authorization')?.split(' ')[1];
        let currentUser = null;
        console.log('request made');
        // Verify token if provided
        if (token) {
            try {
                const decoded = jwt.verify(token, SECRET_KEY);
                currentUser = await User.findById(decoded.id);
                console.log(currentUser.username, "requested book");
            } catch (err) {
                // Token invalid - treat as public access
                console.error('Invalid token:', err);
            }
        }

        // Fetch book with populated owner and contributors
        const book = await Book.findById(req.params.bookId)
            .populate('owner', 'username email') // Only select necessary fields
            .populate('contributors', 'username email');

        if (!book) {
            return res.status(404).send('Not Found: No book with the given ID exists');
        }

        // Get all users with admin role
        const adminUsers = await User.find({ roles: 'admin' }, 'username email');

        // Determine if current user can edit
        let canEdit = false;
        if (currentUser) {
            canEdit = currentUser.roles.includes('admin') || 
                     book.owner._id.equals(currentUser._id) || 
                     book.contributors.some(contributor => contributor._id.equals(currentUser._id));
        }

        // Format editors list
        const editors = {
            owner: {
                id: book.owner._id,
                username: book.owner.username,
                email: book.owner.email
            },
            contributors: book.contributors.map(contributor => ({
                id: contributor._id,
                username: contributor.username,
                email: contributor.email
            })),
            admins: adminUsers.map(admin => ({
                id: admin._id,
                username: admin.username,
                email: admin.email
            }))
        };

        const formattedBook = {
            id: book._id,
            title: book.title,
            author: book.author,
            visibility: book.visibility,
            metadata: book.metadata || {},
            lines: book.lines.map(line => ({
                id: line._id,
                Arabic: line.Arabic,
                English: line.English,
                commentary: line.commentary || "",
                rootwords: line.rootwords || ""
            })),
            lastUpdated: book.lastUpdated,
            editors: editors,
            canEdit: canEdit
        };

        res.json(formattedBook);
    } catch (err) {
        console.error('Error fetching book:', err);
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
        res.status(500).send('Internal Server Error (4)');
    }
});

// POST /:bookId/lines
router.post('/:bookId/lines', authenticateToken(['member', 'editor', 'admin']), EditGuard({ requireBook = true } = {}), async (req, res) => {
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
router.put('/:bookId/lines/:lineId', authenticateToken(['editor', 'admin']), EditGuard({ requireBook = true } = {}), async (req, res) => {
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
router.delete('/:bookId/lines/:lineId', authenticateToken(['editor', 'admin']), EditGuard({ requireBook = true } = {}), async (req, res) => {
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
router.put('/:bookId/lines/:index/move', authenticateToken(['editor', 'admin']), EditGuard({ requireBook = true } = {}), async (req, res) => {
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
router.put('/:bookId', authenticateToken(['editor', 'admin']), async (req, res) => {
    const { title, author, metadata, visibility } = req.body;
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
        if (visibility) book.visibility = visibility;
        const updatedBook = await book.save();
        const formattedBook = {
            id: updatedBook._id,
            title: updatedBook.title,
            author: updatedBook.author,
            visibility: updatedBook.visibility,
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
