const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Book = require('../models/Book');
const BookText = require('../models/BookText');
const {
  isEnabled,
  indexBookDocument,
  indexBookTextDocument
} = require('../services/ElasticService');

const MONGODB_URI = process.env.MONGODB_URI;

if (!isEnabled()) {
  console.error('Elasticsearch is not enabled. Set ELASTICSEARCH_NODE before running this script.');
  process.exit(1);
}

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI environment variable.');
  process.exit(1);
}

async function reindex() {
  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  const books = await Book.find();
  const bookTexts = await BookText.find();

  console.log(`Indexing ${books.length} books...`);
  for (const book of books) {
    await indexBookDocument(book);
  }

  console.log(`Indexing ${bookTexts.length} book texts...`);
  for (const text of bookTexts) {
    await indexBookTextDocument(text);
  }

  console.log('Reindex complete.');
  await mongoose.disconnect();
}

reindex().catch(async (err) => {
  console.error('Reindex failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
