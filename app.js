const fs = require('fs');
const https = require('https');
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const session = require('express-session');
const passport = require('./config/passport');

const app = express();

const ENVIRONMENT = process.env.ENVIRONMENT || 'development';
const MONGODB_URI = process.env.MONGODB_URI;

const args = process.argv.slice(2); // Get command-line arguments
if (args.includes('--teststripe')) {
  process.env.STRIPE_ENV = 'test';
  console.log('Stripe Env is set to ', process.env.STRIPE_ENV);
} else {
  process.env.STRIPE_ENV = 'live';
  console.log('Stripe Env is set to ', process.env.STRIPE_SECRET_KEY);
}

// Stripe webhook needs raw body for signature verification
// This MUST be before the regular body parsers
app.use('/stripe/webhook', express.raw({ type: 'application/json' }));

// Middleware
app.use(bodyParser.json({ limit: '50mb' })); // Increased limit for OCR results with large text
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

const corsOptions = {
  origin: 'https://sharhapp.com',  // Replace with your frontend domain
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  exposedHeaders: ['Content-Disposition'],  // Allow the browser to access 'Content-Disposition'
};

//app.use(cors(corsOptions));

app.use(cors({
  exposedHeaders: ['Content-Disposition']
}));

// Session configuration for OAuth
app.use(session({
  secret: process.env.SESSION_SECRET || process.env.SECRET_KEY,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.ENVIRONMENT === 'production', // Use secure cookies in production
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected'))
  .catch(err => console.log('MongoDB connection error:', err));

// Import Routes
const bookRoutes = require('./routes/books');
const userRoutes = require('./routes/users');
const stripeRoutes = require('./routes/stripe');
const fileRoutes = require('./routes/files');
const bookmarkRoutes = require('./routes/bookmarks');
const feedbackRoutes = require('./routes/feedbacks');
const audioRoutes = require('./routes/audio');
const quizRoutes = require('./routes/quiz');
const folderRoutes = require('./routes/folders');
const noteRoutes = require('./routes/notes');
const cardRoutes = require('./routes/cards');
const cardCollectionRoutes = require('./routes/cardCollections');
const ocrRoutes = require('./routes/ocr');
const affiliateRoutes = require('./routes/affiliates');

// Use Routes
app.use('/books', bookRoutes);
app.use('/user', userRoutes);
app.use('/stripe', stripeRoutes);
app.use('/files', fileRoutes);
app.use('/bookmarks', bookmarkRoutes);
app.use('/feedback', feedbackRoutes);
app.use('/audio', audioRoutes);
app.use('/quiz', quizRoutes);
app.use('/folders', folderRoutes);
app.use('/notes', noteRoutes);
app.use('/cards', cardRoutes);
app.use('/card-collections', cardCollectionRoutes);
app.use('/ocr', ocrRoutes);
app.use('/affiliates', affiliateRoutes);


// Error Handling Middleware
app.use((err, req, res, next) => {
  // Log comprehensive error details
  const errorDetails = {
    timestamp: new Date().toISOString(),
    message: err.message || 'Unknown error',
    name: err.name || 'UnknownError',
    stack: err.stack || 'No stack trace available',
    url: req.url,
    method: req.method,
    body: req.body,
    query: req.query,
    params: req.params,
    headers: {
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type']
    }
  };

  if (err instanceof URIError) {
    console.error('URIError:', err.message);
    res.status(400).send('Bad Request: Malformed URL');
  } else {
    console.error('Error handling middleware caught error:');
    console.error(JSON.stringify(errorDetails, null, 2));

    // Prevent exposing sensitive error details in production
    const isDevelopment = process.env.ENVIRONMENT === 'development';
    const errorResponse = isDevelopment
      ? { error: err.message || 'Internal Server Error', stack: err.stack }
      : { error: 'Internal Server Error' };

    res.status(err.status || 500).json(errorResponse);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  // Log to error tracking service if available
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  // Log to error tracking service if available
  // Note: It's generally recommended to restart the process after uncaught exceptions
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '127.0.0.1', () => {
  console.log(`App running on http://localhost:${PORT}`);
});
