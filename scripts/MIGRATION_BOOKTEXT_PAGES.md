# BookText Pages Migration

## Overview

This migration moves page data from the `pages` array in BookText documents to the new `BookTextPage` collection. This change was made to avoid MongoDB's 16MB document size limit for books with large amounts of text.

## Why This Migration Is Needed

- **Problem**: Large books with many pages can exceed MongoDB's 16MB document size limit
- **Solution**: Store each page as a separate document in the `BookTextPage` collection
- **Benefits**:
  - No document size limits
  - Better scalability
  - More efficient pagination
  - Full page text preserved (no truncation)

## Migration Script

**Location**: `/scripts/migrateBookTextPages.js`

## How to Run the Migration

### Option 1: Using Node directly

```bash
cd /path/to/sharh
node scripts/migrateBookTextPages.js
```

### Option 2: Using PM2 (if you have it installed)

```bash
pm2 start scripts/migrateBookTextPages.js --name "migrate-pages"
pm2 logs migrate-pages
```

## What the Migration Does

1. Finds all BookText documents that have pages in the `pages` array
2. Creates corresponding BookTextPage documents for each page
3. Preserves all page data:
   - Page number
   - Full page text (no truncation!)
   - S3 keys for page images
   - AI-generated flag
   - Timestamps
4. Skips books that have already been migrated
5. Provides progress logging and summary

## Important Notes

### Backward Compatibility

The system has **fallback logic** built-in:
- If pages aren't found in BookTextPage collection, it falls back to the old `pages` array
- This means the migration can be run at any time without breaking existing functionality
- Old books will continue to work even if not migrated

### Optional Cleanup

The migration script **does NOT** automatically remove the old `pages` array from BookText documents. This is intentional for safety.

If you want to remove the old pages array after verifying the migration was successful, uncomment these lines in the script (lines 75-79):

```javascript
await BookText.updateOne(
  { _id: book._id },
  { $unset: { pages: "" } }
);
console.log(`  - Removed pages array from BookText document`);
```

### Re-running the Migration

The migration is **idempotent** - you can safely run it multiple times:
- It checks if pages already exist in BookTextPage before migrating
- Already migrated books are skipped
- No duplicate pages will be created

## After Migration

Once the migration is complete, all new OCR jobs will automatically use the new BookTextPage collection. The old `pages` array field is kept in the schema for backward compatibility but will remain empty for new documents.

### Re-indexing Elasticsearch/OpenSearch

**IMPORTANT**: After migrating pages, you should re-index your Elasticsearch/OpenSearch to ensure search functionality works correctly with the new page structure.

The ElasticService has been updated to fetch pages from the BookTextPage collection when indexing. To re-index all documents:

```bash
node scripts/reindexElasticsearch.js
```

This will:
- Re-index all books
- Re-index all book texts with pages from the new BookTextPage collection
- Update the `pagesText` field in Elasticsearch with current page data

**When to re-index:**
- After running the migration script
- If you notice search results not returning expected pages
- After bulk updates to page content

## Verification

To verify the migration was successful:

```javascript
// Check number of pages migrated
db.booktextpages.count()

// Check a specific book
db.booktextpages.find({ bookTextId: ObjectId("YOUR_BOOK_ID") }).count()

// Compare with original
db.booktexts.findOne({ _id: ObjectId("YOUR_BOOK_ID") }).pages.length
```

## Rollback

If you need to rollback (not recommended):
1. The old `pages` arrays are still in the BookText documents (unless you cleaned them up)
2. Simply delete the BookTextPage collection: `db.booktextpages.drop()`
3. The fallback logic will automatically use the old pages arrays

## Support

If you encounter any issues during migration, check:
- MongoDB connection (check .env file for DBADDRESS and DBNAME)
- Sufficient disk space for the new collection
- Migration logs for specific errors
