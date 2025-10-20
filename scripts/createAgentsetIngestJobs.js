const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const Book = require('../models/Book');

const DBNAME = process.env.DBNAME;
const DBADDRESS = process.env.DBADDRESS;
const AGENTSET_API_KEY = process.env.AGENTSET_API_KEY;
const AGENTSET_NAMESPACE = process.env.AGENTSET_NAMESPACE;

// Validate environment variables
if (!AGENTSET_API_KEY) {
  console.error('Error: AGENTSET_API_KEY is not set in environment variables');
  process.exit(1);
}

if (!AGENTSET_NAMESPACE) {
  console.error('Error: AGENTSET_NAMESPACE is not set in environment variables');
  process.exit(1);
}

// Connect to MongoDB
mongoose.connect(`mongodb://${DBADDRESS}:27017/${DBNAME}`)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => {
    console.log('MongoDB connection error:', err);
    process.exit(1);
  });

/**
 * Creates an ingest job in AgentSet
 * @param {Object} payload - The ingest job payload
 * @param {string} name - Name of the ingest job
 * @param {Object} metadata - Optional metadata for the job
 * @returns {Promise<Object>} The created ingest job response
 */
async function createAgentsetIngestJob(payload, name, metadata = {}) {
  const url = `https://api.agentset.ai/v1/namespace/${AGENTSET_NAMESPACE}/ingest-jobs`;

  const requestBody = {
    name: name,
    payload: payload,
    config: {
      metadata: metadata,
      chunkingStrategy: 'basic',
      strategy: 'auto'
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AGENTSET_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`AgentSet API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating ingest job:', error.message);
    throw error;
  }
}

/**
 * Formats book data into text format for ingestion
 * @param {Object} book - The book document
 * @returns {string} Formatted text content
 */
function formatBookContent(book) {
  const sections = [];

  // Add book header
  sections.push(`Title: ${book.title || 'Untitled'}`);
  sections.push(`Author: ${book.author || 'Unknown'}`);
  sections.push(`Translator: ${book.translator || 'Unknown'}`);
  sections.push(`Category: ${book.category || 'Uncategorized'}`);
  sections.push(`Difficulty: ${book.difficulty || 'Unknown'}`);

  if (book.description) {
    sections.push(`\nDescription: ${book.description}`);
  }

  sections.push('\n' + '='.repeat(80) + '\n');

  // Add lines with English, Arabic, and Commentary
  if (book.lines && book.lines.length > 0) {
    book.lines.forEach((line, index) => {
      sections.push(`\n--- Line ${index + 1} ---\n`);

      if (line.Arabic) {
        sections.push(`Arabic: ${line.Arabic}`);
      }

      if (line.English) {
        sections.push(`English: ${line.English}`);
      }

      if (line.commentary) {
        sections.push(`Commentary: ${line.commentary}`);
      }

      if (line.rootwords) {
        sections.push(`Root Words: ${line.rootwords}`);
      }

      sections.push(''); // Empty line between entries
    });
  } else {
    sections.push('No lines available for this book.');
  }

  return sections.join('\n');
}

/**
 * Main function to query books and create ingest jobs
 */
async function createIngestJobsForAllBooks() {
  try {
    console.log('Fetching all books from database...\n');

    // Query all books with their lines
    const books = await Book.find({}).select('title author translator category difficulty description lines').lean();

    console.log(`Found ${books.length} books.\n`);

    if (books.length === 0) {
      console.log('No books found in the database.');
      mongoose.connection.close();
      return;
    }

    const results = {
      successful: [],
      failed: []
    };

    // Process each book
    for (let i = 0; i < books.length; i++) {
      const book = books[i];
      const bookNumber = i + 1;

      console.log(`[${bookNumber}/${books.length}] Processing: "${book.title || 'Untitled'}"`);
      console.log(`  - Lines: ${book.lines?.length || 0}`);

      try {
        // Format the book content
        const textContent = formatBookContent(book);

        // Create the ingest job payload
        const payload = {
          type: 'TEXT',
          text: textContent,
          fileName: `${book.title || 'Untitled'}.txt`
        };

        // Create metadata for the job
        const metadata = {
          bookId: book._id.toString(),
          title: book.title || 'Untitled',
          author: book.author || 'Unknown',
          category: book.category || 'Uncategorized',
          linesCount: book.lines?.length || 0
        };

        // Create the ingest job
        const jobName = `Book: ${book.title || 'Untitled'}`;
        const result = await createAgentsetIngestJob(payload, jobName, metadata);

        console.log(`  ✓ Success - Job ID: ${result.data.id}`);
        console.log(`  - Status: ${result.data.status}\n`);

        results.successful.push({
          bookTitle: book.title,
          bookId: book._id,
          jobId: result.data.id
        });

        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`  ✗ Failed: ${error.message}\n`);
        results.failed.push({
          bookTitle: book.title,
          bookId: book._id,
          error: error.message
        });
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total books processed: ${books.length}`);
    console.log(`Successful: ${results.successful.length}`);
    console.log(`Failed: ${results.failed.length}`);

    if (results.successful.length > 0) {
      console.log('\n✓ Successfully created jobs:');
      results.successful.forEach(item => {
        console.log(`  - "${item.bookTitle}" (Job ID: ${item.jobId})`);
      });
    }

    if (results.failed.length > 0) {
      console.log('\n✗ Failed to create jobs:');
      results.failed.forEach(item => {
        console.log(`  - "${item.bookTitle}": ${item.error}`);
      });
    }

    console.log('\n');

    // Close database connection
    mongoose.connection.close();

  } catch (error) {
    console.error('Fatal error:', error);
    mongoose.connection.close();
    process.exit(1);
  }
}

// Run the script
createIngestJobsForAllBooks();
