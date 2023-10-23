const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const cors = require('cors'); // Import the cors package

app.use(cors()); // Enable CORS for all routes
app.use(express.json());

const filePath = path.join(__dirname, 'cache.json');

app.get('/lines', (req, res) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // If file doesn't exist, create it with an empty array
                const emptyCache = { lines: [] };
                fs.writeFile(filePath, JSON.stringify(emptyCache, null, 2), 'utf8', (err) => {
                    if (err) {
                        res.status(500).send('Internal Server Error');
                    } else {
                        res.header('Content-Type', 'application/json');
                        res.send(JSON.stringify(emptyCache));
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

app.post('/lines', (req, res) => {
    console.log("New line attempting to be added");
    const newLine = { id: uuidv4(), ...req.body.newLine};
    const position = req.body.position;
    if (!newLine || !newLine.Arabic || !newLine.English || !newLine.commentary || !newLine.rootwords) {
        return res.status(400).send('Bad Request: Missing required fields');
    }

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // If file doesn't exist, create it with the new line
                const newCache = { lines: [newLine] };
                fs.writeFile(filePath, JSON.stringify(newCache, null, 2), 'utf8', (err) => {
                    if (err) {
                        res.status(500).send('Internal Server Error');
                    } else {
                        res.status(201).json('Line added successfully');
                    }
                });
            } else {
                res.status(500).send('Internal Server Error');
            }
        } else {
            const cache = JSON.parse(data);
            const index = cache.lines.findIndex(line => line.Arabic === newLine.Arabic);
            if (index !== -1) {
                return res.status(400).send('Bad Request: Line with the same Arabic field already exists');
            }
            if (position != null && position >= 0 && position <= cache.lines.length) {
                cache.lines.splice(position, 0, newLine);
            } else {
                cache.lines.push(newLine);
            }
            fs.writeFile(filePath, JSON.stringify(cache, null, 2), 'utf8', (err) => {
                if (err) {
                    res.status(500).send('Internal Server Error');
                } else {
                    res.status(201).json('Line added successfully');
                }
            });
        }
    });
});

app.get('/lines/:id', (req, res) => {
    const id = req.params.id;

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.status(404).send('Not Found: No lines exist');
            } else {
                res.status(500).send('Internal Server Error');
            }
        } else {
            const cache = JSON.parse(data);
            const line = cache.lines.find(line => line.id === id);
            if (!line) {
                res.status(404).send('Not Found: No line with the given ID exists');
            } else {
                res.header('Content-Type', 'application/json');
                res.send(JSON.stringify(line));
            }
        }
    });
});

app.put('/lines/:id', (req, res) => {
    console.log("New line attempting to be modified");
    const id = req.params.id;
    const updatedLine = req.body;
    console.log('Updated Line:', updatedLine);
    if (!updatedLine || !updatedLine.English || !updatedLine.commentary || !updatedLine.rootwords) {
        console.log('Bad Request: Missing required fields');
        return res.status(400).send('Bad Request: Missing required fields');
    }

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                console.log('Not Found: No lines exist');
                res.status(404).send('Not Found: No lines exist');
            } else {
                res.status(500).send('Internal Server Error');
            }
        } else {
            const cache = JSON.parse(data);
            const index = cache.lines.findIndex(line => line.id === id);
            console.log('Index:', index);
            console.log('Cache:', cache);
            if (index === -1) {
                console.log('Not Found: No line with the given Arabic field exists');
                res.status(404).send('Not Found: No line with the given Arabic field exists');
            } else {
                cache.lines[index] = { ...cache.lines[index], ...updatedLine };
                fs.writeFile(filePath, JSON.stringify(cache, null, 2), 'utf8', (err) => {
                    if (err) {
                        res.status(500).send('Internal Server Error');
                    } else {
                        console.log('Line updated successfully');
                        console.log(data)
                        res.status(200).json('Line updated successfully');
                    }
                });
            }
        }
    });
});

app.delete('/lines/:id', (req, res) => {
    const id = req.params.id;

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.status(404).send('Not Found: No lines exist');
            } else {
                res.status(500).send('Internal Server Error');
            }
        } else {
            const cache = JSON.parse(data);
            const index = cache.lines.findIndex(line => line.id === id);
            if (index === -1) {
                res.status(404).send('Not Found: No line with the given Arabic field exists');
            } else {
                cache.lines.splice(index, 1);
                fs.writeFile(filePath, JSON.stringify(cache, null, 2), 'utf8', (err) => {
                    if (err) {
                        res.status(500).send('Internal Server Error');
                    } else {
                        res.status(200).json('Line deleted successfully');
                    }
                });
            }
        }
    });
});

app.put('/lines/:index/move', (req, res) => {
    const fromIndex = parseInt(req.body.fromIndex);
    const toIndex = parseInt(req.body.toIndex);

    if (isNaN(fromIndex) || isNaN(toIndex)) {
        return res.status(400).send('Bad Request: Indices must be integers');
    }

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            res.status(500).send('Internal Server Error');
        } else {
            const cache = JSON.parse(data);
            if (fromIndex < 0 || fromIndex >= cache.lines.length || toIndex < 0 || toIndex >= cache.lines.length) {
                console.log("Bad Request, indices out of range. From index: ", fromIndex, " to index ", toIndex, "cache lines length is ", cache.lines.length)
                return res.status(400).send('Bad Request: Indices out of range');
            }
            
            const [movedLine] = cache.lines.splice(fromIndex, 1);
            cache.lines.splice(toIndex, 0, movedLine);

            fs.writeFile(filePath, JSON.stringify(cache, null, 2), 'utf8', (err) => {
                if (err) {
                    res.status(500).send('Internal Server Error');
                } else {
                    res.status(200).json('Line moved successfully');
                }
            });
        }
    });
});

const port = 3000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }