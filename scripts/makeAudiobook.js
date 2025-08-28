#!/usr/bin/env node

const mongoose = require('mongoose');
const axios = require('axios');
const readline = require('readline');
require('dotenv').config({ path: '../.env' });

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'https://app.ummahspot.com';
const DBNAME = process.env.DBNAME;
const DBADDRESS = process.env.DBADDRESS;
const RATE_LIMIT_REQUESTS = 5;
const COOLDOWN_SECONDS = 10;

// Book model (matching your actual schema

const Book = require('../models/Book');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Utility function to prompt user input
const prompt = (question) => {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
};

// Sleep function for cooldown
const sleep = (seconds) => {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
};

// Progress tracking
class ProgressTracker {
  constructor(total) {
    this.total = total;
    this.completed = 0;
    this.errors = 0;
    this.startTime = Date.now();
  }

  update(success = true) {
    if (success) {
      this.completed++;
    } else {
      this.errors++;
    }
    this.displayProgress();
  }

  displayProgress() {
    const processed = this.completed + this.errors;
    const percentage = ((processed / this.total) * 100).toFixed(1);
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(0);
    const eta = processed > 0 ? (((this.total - processed) / processed) * elapsed).toFixed(0) : '?';
    
    process.stdout.write(`\r✨ Progress: ${processed}/${this.total} (${percentage}%) | ✅ ${this.completed} | ❌ ${this.errors} | ⏱️ ${elapsed}s | ETA: ${eta}s`);
  }
  
  finish() {
    console.log('\n');
    const totalTime = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(`🎉 Complete! ${this.completed}/${this.total} successful in ${totalTime}s`);
    if (this.errors > 0) {
      console.log(`⚠️  ${this.errors} errors encountered`);
    }
  }
}

// Connect to MongoDB
async function connectToDatabase() {
  try {
    await mongoose.connect(`mongodb://${DBADDRESS}:27017/${DBNAME}`, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('📚 Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
}

// Fetch all books
async function fetchBooks() {
  try {
    console.log('📖 Fetching books...');
    const books = await Book.find({}, { title: 1, lines: 1 }).sort({ title: 1 });
    return books;
  } catch (error) {
    console.error('❌ Error fetching books:', error.message);
    return [];
  }
}

// Display books and let user select
async function selectBook(books) {
  if (books.length === 0) {
    console.log('❌ No books found in database');
    return null;
  }

  console.log('\n📚 Available Books:');
  console.log('═'.repeat(80));
  books.forEach((book, index) => {
    const lineCount = book.lines ? book.lines.length : 0;
    const author = book.author ? ` by ${book.author}` : '';
    const category = book.category || 'Uncategorized';
    console.log(`${index + 1}. ${book.title}${author} (${lineCount} lines, ${category})`);
  });
  console.log('═'.repeat(80));

  while (true) {
    const input = await prompt('\n🔍 Select a book (enter number): ');
    const selection = parseInt(input.trim());
    
    if (selection >= 1 && selection <= books.length) {
      return books[selection - 1];
    }
    
    console.log('❌ Invalid selection. Please try again.');
  }
}

// Generate audio for a single line
async function generateLineAudio(bookId, lineId, voice = 'alloy') {
  const fields = ['arabic', 'english', 'commentary'];
  
  try {
    const response = await axios.post(
      `${API_BASE_URL}/audio/${bookId}/lines/${lineId}/batch`,
      { fields, voice },
      { 
        timeout: 60000, // 60 second timeout
        // Add options to handle certificate issues if needed
        httpsAgent: process.env.NODE_ENV === 'development' ? 
          new (require('https')).Agent({ rejectUnauthorized: false }) : 
          undefined
      }
    );
    
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`API Error ${error.response.status}: ${error.response.data?.error || error.message}`);
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout - audio generation took too long');
    } else if (error.code === 'CERT_HAS_EXPIRED' || error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      throw new Error(`Certificate error: ${error.message}. Try setting NODE_ENV=development to bypass SSL verification.`);
    } else {
      throw new Error(`Network error: ${error.message}`);
    }
  }
}

// Process all lines in a book with rate limiting
async function processBookAudio(book) {
  const lines = book.lines.filter(line => line._id); // Only lines with valid IDs
  
  if (lines.length === 0) {
    console.log('❌ No valid lines found in this book');
    return;
  }

  console.log(`\n🎵 Starting audio generation for "${book.title}"`);
  console.log(`📊 Total lines to process: ${lines.length}`);
  console.log(`⚡ Rate limit: ${RATE_LIMIT_REQUESTS} requests per ${COOLDOWN_SECONDS} seconds`);

  // Ask for voice selection
  const voices = [
    { id: 'alloy', name: 'Alloy (Neutral, balanced)' },
    { id: 'echo', name: 'Echo (Clear, articulate)' },
    { id: 'fable', name: 'Fable (Warm, storytelling)' },
    { id: 'onyx', name: 'Onyx (Deep, authoritative)' },
    { id: 'nova', name: 'Nova (Bright, energetic)' },
    { id: 'shimmer', name: 'Shimmer (Gentle, soothing)' }
  ];

  console.log('\n🎙️  Available Voices:');
  voices.forEach((voice, index) => {
    console.log(`${index + 1}. ${voice.name}`);
  });

  let selectedVoice = 'alloy'; // default
  const voiceInput = await prompt('\n🔊 Select voice (enter number, or press Enter for Alloy): ');
  
  if (voiceInput.trim()) {
    const voiceSelection = parseInt(voiceInput.trim());
    if (voiceSelection >= 1 && voiceSelection <= voices.length) {
      selectedVoice = voices[voiceSelection - 1].id;
    }
  }

  console.log(`🎤 Using voice: ${selectedVoice}`);

  // Confirm before starting
  const confirm = await prompt('\n▶️  Start audio generation? (y/N): ');
  if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
    console.log('❌ Operation cancelled');
    return;
  }

  const progress = new ProgressTracker(lines.length);
  let requestCount = 0;
  let successCount = 0;
  let errorCount = 0;

  console.log('\n🚀 Starting audio generation...\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    try {
      // Rate limiting: pause after every N requests
      if (requestCount > 0 && requestCount % RATE_LIMIT_REQUESTS === 0) {
        console.log(`\n⏸️  Rate limit reached. Cooling down for ${COOLDOWN_SECONDS} seconds...`);
        await sleep(COOLDOWN_SECONDS);
      }

      const result = await generateLineAudio(book._id, line._id, selectedVoice);
      
      if (result.success) {
        successCount++;
        
        // Log any field-specific errors
        if (result.errors && Object.keys(result.errors).length > 0) {
          console.log(`\n⚠️  Line ${i + 1} - Partial success with errors:`);
          Object.entries(result.errors).forEach(([field, error]) => {
            console.log(`   ${field}: ${error}`);
          });
        }
        
        progress.update(true);
      } else {
        throw new Error(result.error || 'Unknown API error');
      }
      
    } catch (error) {
      errorCount++;
      console.log(`\n❌ Line ${i + 1} failed: ${error.message}`);
      progress.update(false);
    }
    
    requestCount++;
  }

  progress.finish();

  // Final summary
  console.log('\n📊 Final Summary:');
  console.log(`   📖 Book: ${book.title}`);
  console.log(`   🎤 Voice: ${selectedVoice}`);
  console.log(`   ✅ Successful: ${successCount}/${lines.length}`);
  console.log(`   ❌ Failed: ${errorCount}/${lines.length}`);
  console.log(`   📊 Success Rate: ${((successCount / lines.length) * 100).toFixed(1)}%`);
}

// Main function
async function main() {
  console.log('🎵 Audio Generation CLI Tool');
  console.log('═'.repeat(40));

  try {
    // Connect to database
    await connectToDatabase();

    // Fetch books
    const books = await fetchBooks();

    // Let user select book
    const selectedBook = await selectBook(books);
    if (!selectedBook) {
      console.log('❌ No book selected. Exiting...');
      return;
    }

    // Process the selected book
    await processBookAudio(selectedBook);

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
  } finally {
    rl.close();
    await mongoose.disconnect();
    console.log('👋 Disconnected from database. Goodbye!');
    process.exit(0);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Received interrupt signal. Shutting down gracefully...');
  rl.close();
  await mongoose.disconnect();
  process.exit(0);
});

// Start the application
if (require.main === module) {
  main().catch(console.error);
}