const fs = require('fs');
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();
const path = require('path');

const app = express();

const DBNAME = process.env.DBNAME;
const DBADDRESS = process.env.DBADDRESS;

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Connect to MongoDB
mongoose.connect(`mongodb://${DBADDRESS}:27017/${DBNAME}`, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected'))
  .catch(err => console.log('MongoDB connection error:', err));

// Import Routes
const bookRoutes = require('./routes/books');
const userRoutes = require('./routes/users');

// Use Routes
app.use('/books', bookRoutes);
app.use('/user', userRoutes);

// Error Handling Middleware
app.use((err, req, res, next) => {
  if (err instanceof URIError) {
    res.status(400).send('Bad Request: Malformed URL');
  } else {
    res.status(500).send('Internal Server Error');
  }
});

// Start HTTP Server
const http = require('http');
http.createServer(app).listen(80, () => {
  console.log('HTTP Server running on port 80');
});
