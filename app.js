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

// Middleware to block debug/test routes in production
// This prevents accidentally deployed test routes from being accessible
app.use((req, res, next) => {
  const debugRoutes = ['/debug-sentry', '/test-error', '/debug', '/test'];
  const isProduction = ENVIRONMENT === 'production';

  if (isProduction && debugRoutes.some(route => req.path.startsWith(route))) {
    console.warn(`Blocked access to debug route in production: ${req.path}`);
    return res.status(404).send('Not Found');
  }

  next();
});

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
  if (err instanceof URIError) {
    console.error('URIError:', err.message);
    res.status(400).send('Bad Request: Malformed URL');
  } else {
    console.error('Error handling middleware caught error:');
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    console.error('Request URL:', req.url);
    console.error('Request method:', req.method);
    console.error('Request body:', JSON.stringify(req.body, null, 2));
    res.status(500).send('Internal Server Error (MWE)');
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '127.0.0.1', () => {
  console.log(`App running on http://localhost:${PORT}`);
});
