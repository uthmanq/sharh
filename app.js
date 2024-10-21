const fs = require('fs');
const https = require('https');
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();
const path = require('path');

const app = express();

const ENVIRONMENT = process.env.ENVIRONMENT || 'development';
const DBNAME = process.env.DBNAME;
const DBADDRESS = process.env.DBADDRESS;

// Middleware
app.use(bodyParser.json());

const corsOptions = {
  origin: 'https://sharhapp.com',  // Replace with your frontend domain
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  exposedHeaders: ['Content-Disposition'],  // Allow the browser to access 'Content-Disposition'
};

app.use(cors(corsOptions));

// Connect to MongoDB
mongoose.connect(`mongodb://${DBADDRESS}:27017/${DBNAME}`, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected'))
  .catch(err => console.log('MongoDB connection error:', err));

// Import Routes
const bookRoutes = require('./routes/books');
const userRoutes = require('./routes/users');
const stripeRoutes = require('./routes/stripe');
const fileRoutes = require('./routes/files');

// Use Routes
app.use('/books', bookRoutes);
app.use('/user', userRoutes);
app.use('/stripe', stripeRoutes);
app.use('/files', fileRoutes);

// Error Handling Middleware
app.use((err, req, res, next) => {
  if (err instanceof URIError) {
    res.status(400).send('Bad Request: Malformed URL');
  } else {
    res.status(500).send('Internal Server Error (MWE)');
  }
});

if (ENVIRONMENT === 'development') {

  app.use(cors({
    exposedHeaders: ['Content-Disposition']
  }));
  // Start HTTP server without HTTPS for development
  http.createServer(app).listen(80, () => {
    console.log('Development HTTP Server running on port 80');
  });
} else {
  // HTTPS Options
  const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/app.ummahspot.com/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/app.ummahspot.com/fullchain.pem')
  };

  // Start HTTPS Server
  https.createServer(options, app).listen(443, () => {
    console.log('HTTPS Server running on port 443. Version 1.1');
  });

  // Redirect HTTP to HTTPS
  http.createServer((req, res) => {
    res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
    res.end();
  }).listen(80, () => {
    console.log('HTTP Server running on port 80 and redirecting to HTTPS.');
  });
}
