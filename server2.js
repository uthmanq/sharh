const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const cors = require('cors'); // Import the cors package
const { v4: uuidv4 } = require('uuid'); // Import uuid for unique IDs

app.use(cors()); // Enable CORS for all routes
app.use(express.json());

const filePath = path.join(__dirname, 'cache2.json');

app.get('/books', (req, res) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // If file doesn't exist, create it with an empty array of books
                const emptyBooks = { books: [] };
                fs.writeFile(filePath, JSON.stringify(emptyBooks, null, 2), 'utf8', (err) => {
                    if (err) {
                        res.status(500).send('Internal Server Error');
                    } else {
                        res.header('Content-Type', 'application/json');
                        res.send(JSON.stringify(emptyBooks));
                    }
                });
            } else {
                res.status(500).send('Internal Server Error');
            }
        } else {
            res.header('Content-Type', 'application/json');
            res.send(data);
        }
    });
});
//Create a New Book
app.post('/books', (req, res) => {
    const newBook = { id: uuidv4(), ...req.body.newBook, lines: [] };
<<<<<<< HEAD
    if (!newBook  || !newBook.title || !newBook.author) {
=======
    if (!newBook || !newBook.title || !newBook.author) {
>>>>>>> v2
        return res.status(400).send('Bad Request: Missing required fields');
    }
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // If file doesn't exist, create it with the new book
                const newBooks = { books: [newBook] };
                fs.writeFile(filePath, JSON.stringify(newBooks, null, 2), 'utf8', (err) => {
                    if (err) {
                        res.status(500).send('Internal Server Error');
                    } else {
                        res.status(201).json(newBook);
                    }
                });
            } else {
                res.status(500).send('Internal Server Error');
            }
        } else {
            const cache = JSON.parse(data);
            const index = cache.books.findIndex(b => b.title === newBook.title);
            if (index !== -1) {
                return res.status(400).send('Bad Request: Book with the same title already exists');
            }
            cache.books.push(newBook);
            fs.writeFile(filePath, JSON.stringify(cache, null, 2), 'utf8', (err) => {
                if (err) {
                    res.status(500).send('Internal Server Error');
                } else {
                    res.status(201).json(newBook);
                }
            });
        }
    });
});

<<<<<<< HEAD
=======
app.get('/books/:bookId', (req, res) => {
    const bookId = req.params.bookId;

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            res.status(500).send('Internal Server Error');
        } else {
            const cache = JSON.parse(data);
            const book = cache.books.find(b => b.id === bookId);
            if (!book) {
                res.status(404).send('Not Found: No book with the given ID exists');
            } else {
                res.header('Content-Type', 'application/json');
                res.send(JSON.stringify(book));
            }
        }
    });
});

>>>>>>> v2
app.get('/books/:bookId/lines', (req, res) => {
    const bookId = req.params.bookId;

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            res.status(500).send('Internal Server Error');
        } else {
            const cache = JSON.parse(data);
            const book = cache.books.find(b => b.id === bookId);
            if (!book) {
                res.status(404).send('Not Found: No book with the given ID exists');
            } else {
                res.header('Content-Type', 'application/json');
                res.send(JSON.stringify(book));
            }
        }
    });
});

app.post('/books/:bookId/lines', (req, res) => {
    const bookId = req.params.bookId;
    const newLine = { id: uuidv4(), ...req.body.newLine };

<<<<<<< HEAD
    if (!newLine || !newLine.Arabic || !newLine.English ) {
=======
    if (!newLine || !newLine.Arabic || !newLine.English) {
>>>>>>> v2
        return res.status(400).send('Bad Request: Missing required fields');
    }

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            res.status(500).send('Internal Server Error');
        } else {
            const cache = JSON.parse(data);
            const book = cache.books.find(b => b.id === bookId);
            if (!book) {
                res.status(404).send('Not Found: No book with the given ID exists');
            } else {
                const index = book.lines.findIndex(line => line.Arabic === newLine.Arabic);
                if (index !== -1) {
                    return res.status(400).send('Bad Request: Line with the same Arabic field already exists');
                }
                book.lines.push(newLine);
                fs.writeFile(filePath, JSON.stringify(cache, null, 2), 'utf8', (err) => {
                    if (err) {
                        res.status(500).send('Internal Server Error');
                    } else {
                        res.status(201).json('Line added successfully');
                    }
                });
            }
        }
    });
});

app.get('/books/:bookId/lines/:lineId', (req, res) => {
    const bookId = req.params.bookId;
    const lineId = req.params.lineId;

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            res.status(500).send('Internal Server Error');
        } else {
            const cache = JSON.parse(data);
            const book = cache.books.find(b => b.id === bookId);
            if (!book) {
                res.status(404).send('Not Found: No book with the given ID exists');
            } else {
                const line = book.lines.find(l => l.id === lineId);
                if (!line) {
                    res.status(404).send('Not Found: No line with the given ID exists');
                } else {
                    res.header('Content-Type', 'application/json');
                    res.send(JSON.stringify(line));
                }
            }
        }
    });
});

app.put('/books/:bookId/lines/:lineId', (req, res) => {
<<<<<<< HEAD
=======
    console.log(req.body)
>>>>>>> v2
    const bookId = req.params.bookId;
    const lineId = req.params.lineId;
    const updatedLine = req.body.updatedLine;

<<<<<<< HEAD
    if (!updatedLine || !updatedLine.Arabic || !updatedLine.English || !updatedLine.commentary || !updatedLine.rootwords) {
=======
    if (!updatedLine || !updatedLine.Arabic || !updatedLine.English) {
>>>>>>> v2
        return res.status(400).send('Bad Request: Missing required fields');
    }

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            res.status(500).send('Internal Server Error');
        } else {
            const cache = JSON.parse(data);
            const book = cache.books.find(b => b.id === bookId);
            if (!book) {
                res.status(404).send('Not Found: No book with the given ID exists');
            } else {
                const lineIndex = book.lines.findIndex(l => l.id === lineId);
                if (lineIndex === -1) {
                    res.status(404).send('Not Found: No line with the given ID exists');
                } else {
                    book.lines[lineIndex] = { ...book.lines[lineIndex], ...updatedLine };
                    fs.writeFile(filePath, JSON.stringify(cache, null, 2), 'utf8', (err) => {

                        if (err) {
                            res.status(500).send('Internal Server Error');
                        } else {
                            res.status(200).json('Line updated successfully');
                        }
                    });
                }
            }
        }
    });
});

<<<<<<< HEAD
=======
//Move Line
app.put('/books/:bookId/lines/:index/move', (req, res) => {
    const fromIndex = parseInt(req.body.fromIndex);
    const toIndex = parseInt(req.body.toIndex);
    const bookId = req.params.bookId;

    //console.log("from Index is ", fromIndex)
    //console.log(req.body)
    if (isNaN(fromIndex) || isNaN(toIndex)) {
        //console.log("Indices are not integers")
        return res.status(400).send('Bad Request: Indices must be integers');
    }

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            res.status(500).send('Internal Server Error');
        } else {
            const cache = JSON.parse(data);
            const book = cache.books.find(b => b.id === bookId);
            if (!book) {
                // console.log("Book does not exist")
                res.status(404).send('Not Found: No book with the given ID exists');
            }
            else {
                // console.log("Book exists")

                if (fromIndex < 0 || fromIndex >= book.lines.length || toIndex < 0 || toIndex >= book.lines.length) {
                   // console.log("Bad Request, indices out of range. From index: ", fromIndex, " to index ", toIndex, "cache lines length is ", book.lines.length)
                    return res.status(400).send('Bad Request: Indices out of range');
                }

                const [movedLine] = book.lines.splice(fromIndex, 1);
                book.lines.splice(toIndex, 0, movedLine);

                fs.writeFile(filePath, JSON.stringify(cache, null, 2), 'utf8', (err) => {
                    if (err) {
                        res.status(500).send('Internal Server Error');
                    } else {
                        res.status(200).json('Line moved successfully');
                    }
                });
            }
        }
    });
});

>>>>>>> v2
app.delete('/books/:bookId/lines/:lineId', (req, res) => {
    const bookId = req.params.bookId;
    const lineId = req.params.lineId;

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            res.status(500).send('Internal Server Error');
        } else {
            const cache = JSON.parse(data);
            const bookIndex = cache.books.findIndex(b => b.id === bookId);
            if (bookIndex === -1) {
                res.status(404).send('Not Found: No book with the given ID exists');
            } else {
                const lineIndex = cache.books[bookIndex].lines.findIndex(l => l.id === lineId);
                if (lineIndex === -1) {
                    res.status(404).send('Not Found: No line with the given ID exists');
                } else {
                    cache.books[bookIndex].lines.splice(lineIndex, 1);
                    fs.writeFile(filePath, JSON.stringify(cache, null, 2), 'utf8', (err) => {
                        if (err) {
                            res.status(500).send('Internal Server Error');
                        } else {
                            res.status(200).json('Line deleted successfully');
                        }
                    });
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
