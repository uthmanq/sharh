const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors'); // Import the cors package
const app = express();
const jwt = require('jsonwebtoken');
require('dotenv').config();
const path = require('path');
const crypto = require('crypto');

const SECRET_KEY = process.env.SECRETKEY
const DBNAME = process.env.DBNAME
app.use(bodyParser.json());
app.use(cors()); // Enable CORS for all routes
app.use(express.static(path.join(__dirname, 'build')));

// Mongoose setup
mongoose.connect(`mongodb://localhost:27017/${DBNAME}`, {
});

console.log(`mongodb://3.149.244.74:27017/${DBNAME}`, {
});
//Book Schema
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

//User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

//POST Signup Endpoint
app.post('/signup', async (req, res) => {
    const { username, password, email } = req.body;
    if (!username || !password || !email) {
        return res.status(400).send('Bad Request: Missing required fields');
    }
    try {
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            return res.status(400).send('Bad Request: User with the same username or email already exists');
        }
        const newUser = new User({ username, password, email });
        const savedUser = await newUser.save();
        const token = jwt.sign({ id: savedUser._id }, SECRET_KEY, { expiresIn: '24h' });
        res.status(201).json({ token, user: { id: savedUser._id, username: savedUser.username, email: savedUser.email } });
    } catch (err) {
        console.log(err)
        res.status(500).send('Internal Server Error');
    }
});

//POST Login Endpoint
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).send('Bad Request: Missing required fields');
    }
    try {
        const user = await User.findOne({ username });
        if (!user || user.password !== password) {
            return res.status(401).send('Unauthorized: Incorrect username or password');
        }
        const token = jwt.sign({ id: user._id }, SECRET_KEY, { expiresIn: '24h' });
        res.status(200).json({ token, user: { id: user._id, username: user.username, email: user.email } });
    } catch (err) {
        console.log(err)
        res.status(500).send('Internal Server Error');
    }
});

function authenticateToken(req, res, next) {
    const token = req.header('Authorization')?.split(' ')[1];
    if (!token) return res.status(401).send('Unauthorized: No token provided');

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).send('Forbidden: Invalid token');
        req.user = user;
        next();
    });
}

function verifyPostData(req, res, next) {
    const signature = req.headers['x-hub-signature-256'];
    const hmac = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET);
    const digest = 'sha256=' + hmac.update(req.body).digest('hex');

    if (!signature || !digest || signature !== digest) {
        return res.status(403).send('Invalid signature');
    }

    // Signature is valid, parse the body as JSON for the next middleware
    try {
        req.body = JSON.parse(req.body.toString());
    } catch (error) {
        return res.status(400).send('Invalid JSON');
    }

    return next();
}


app.post('/CLI-update', (req, res) => {
    // You could check for a simple secret or token if you still want some level of security
    if (req.body.secret !== process.env.WEBHOOK_SECRET) {
        return res.status(403).send('Invalid secret');
    }

    // Run your build script
    exec('./build.sh', (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return res.status(500).send('Build script failed');
        }
        
        console.log(`stdout: ${stdout}`);
        console.error(`stderr: ${stderr}`);
        res.status(200).send('Build script executed successfully');
    });
});

// GET /books
app.get('/books', async (req, res) => {
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

// POST /books
app.post('/books', authenticateToken, async (req, res) => {
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

// GET /books/:bookId
app.get('/books/:bookId', async (req, res) => {
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

// GET /books/:bookId/lines
app.get('/books/:bookId/lines', async (req, res) => {
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

// POST /books/:bookId/lines
app.post('/books/:bookId/lines', authenticateToken, async (req, res) => {
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
        book.lines.push(newLine);
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
        res.status(500).send('Internal Server Error');
    }
});

// GET /books/:bookId/lines/:lineId
app.get('/books/:bookId/lines/:lineId', async (req, res) => {
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

// PUT /books/:bookId/lines/:lineId
app.put('/books/:bookId/lines/:lineId', authenticateToken, async (req, res) => {
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

// DELETE /books/:bookId/lines/:lineId
app.delete('/books/:bookId/lines/:lineId', authenticateToken, async (req, res) => {
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
app.put('/books/:bookId/lines/:index/move', authenticateToken, async (req, res) => {
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


app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
