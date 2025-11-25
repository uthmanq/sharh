const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const BookText = require('../models/BookText');
const BookTextPage = require('../models/BookTextPage');

const MONGODB_URI = process.env.MONGODB_URI;

// Validate environment variables
if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI is not set in environment variables');
  process.exit(1);
}

const migrateBookTextPages = async () => {
  try {
    // Connect to MongoDB and wait for connection
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB Connected');

    console.log('\nStarting BookText pages migration...');

    // Find all BookText documents that have pages in the pages array
    const booksWithPages = await BookText.find({
      pages: { $exists: true, $ne: [] }
    });

    console.log(`Found ${booksWithPages.length} books with pages to migrate`);

    let migratedCount = 0;
    let pageCount = 0;
    let skippedCount = 0;

    for (const book of booksWithPages) {
      if (!book.pages || book.pages.length === 0) {
        continue;
      }

      console.log(`Migrating ${book.pages.length} pages for book ${book._id} (jobId: ${book.jobId})`);

      // Check if pages already exist in BookTextPage collection
      const existingPageCount = await BookTextPage.countDocuments({ bookTextId: book._id });

      if (existingPageCount > 0) {
        console.log(`  - Skipping: ${existingPageCount} pages already exist in BookTextPage collection`);
        skippedCount++;
        continue;
      }

      // Prepare bulk operations for pages
      const pageOperations = book.pages.map(page => ({
        updateOne: {
          filter: {
            bookTextId: book._id,
            pageNumber: page.pageNumber
          },
          update: {
            $set: {
              bookTextId: book._id,
              jobId: book.jobId,
              pageNumber: page.pageNumber,
              text: page.text || '',
              s3Key: page.s3Key || null,
              isAIGenerated: page.isAIGenerated !== undefined ? page.isAIGenerated : true,
              createdAt: book.createdAt || new Date(),
              updatedAt: book.updatedAt || new Date()
            }
          },
          upsert: true
        }
      }));

      // Execute bulk write
      if (pageOperations.length > 0) {
        const result = await BookTextPage.bulkWrite(pageOperations);
        pageCount += pageOperations.length;
        console.log(`  - Migrated ${pageOperations.length} pages (${result.upsertedCount} new, ${result.modifiedCount} updated)`);
      }

      // Optional: Remove pages array from BookText document to save space
      // Uncomment the following lines if you want to remove the old pages array after migration
      // await BookText.updateOne(
      //   { _id: book._id },
      //   { $unset: { pages: "" } }
      // );
      // console.log(`  - Removed pages array from BookText document`);

      migratedCount++;
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Books migrated: ${migratedCount}`);
    console.log(`Books skipped (already migrated): ${skippedCount}`);
    console.log(`Total pages migrated: ${pageCount}`);
    console.log('Migration complete!');

    mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('Error during migration:', err);
    mongoose.connection.close();
    process.exit(1);
  }
};

// Run the migration
migrateBookTextPages();
