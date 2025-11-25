const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Book = require('../models/Book');
const BookText = require('../models/BookText');
const BookTextPage = require('../models/BookTextPage');
const {
  isEnabled,
  indexBookDocument,
  indexBookTextDocument,
  indexBookTextPageDocument
} = require('../services/ElasticService');

const MONGODB_URI = process.env.MONGODB_URI;

console.log('Elasticsearch node:', process.env.ELASTICSEARCH_NODE);
console.log('Elasticsearch skip verify:', process.env.ELASTICSEARCH_SKIP_VERIFY);

if (!isEnabled()) {
  console.error('Elasticsearch is not enabled. Set ELASTICSEARCH_NODE before running this script.');
  process.exit(1);
}

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI environment variable.');
  process.exit(1);
}

async function reindex() {
  await mongoose.connect(MONGODB_URI);

  const books = await Book.find();
  const bookTexts = await BookText.find();
  const bookTextPages = await BookTextPage.find();
  const bookTextMap = new Map(bookTexts.map(text => [text._id.toString(), text]));

  console.log(`Indexing ${books.length} books...`);
  for (const book of books) {
    await indexBookDocument(book);
  }

  console.log(`Indexing ${bookTexts.length} book texts...`);
  for (const text of bookTexts) {
    await indexBookTextDocument(text);
  }

  console.log(`Indexing ${bookTextPages.length} book text pages...`);
  for (const page of bookTextPages) {
    const parent = bookTextMap.get(page.bookTextId.toString()) || await BookText.findById(page.bookTextId);
    if (parent) {
      bookTextMap.set(parent._id.toString(), parent);
    }
    await indexBookTextPageDocument(page, parent);
  }

  console.log('Reindex complete.');
  await mongoose.disconnect();
}

reindex().catch(async (err) => {
  console.error('Reindex failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
