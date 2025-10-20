# AgentSet Ingest Jobs Script

This script queries all books from the MongoDB database and creates ingest jobs in AgentSet for each book, including their English text, Arabic text, and commentary.

## Purpose

The script creates text-based ingest jobs in AgentSet that include:
- Book metadata (title, author, translator, category, difficulty, description)
- All lines with their English, Arabic, commentary, and root words

## Prerequisites

1. **Environment Variables** - Ensure the following are set in your `.env` file:
   - `AGENTSET_API_KEY` - Your AgentSet API key
   - `AGENTSET_NAMESPACE` - Your AgentSet namespace ID (e.g., `ns_xxx`)
   - `DBNAME` - MongoDB database name
   - `DBADDRESS` - MongoDB server address

2. **Dependencies** - All required npm packages should be installed:
   ```bash
   npm install
   ```

## Usage

### Run the script directly:
```bash
node scripts/createAgentsetIngestJobs.js
```

### Or use the npm script:
```bash
npm run createIngestJobs
```

## What the Script Does

1. **Connects to MongoDB** - Establishes a connection to your MongoDB database
2. **Fetches Books** - Retrieves all books with their lines (Arabic, English, commentary, root words)
3. **Formats Content** - Formats each book's content into a readable text format
4. **Creates Ingest Jobs** - Submits each book as a TEXT payload to AgentSet
5. **Tracks Progress** - Shows progress for each book and provides a summary at the end

## Output Example

```
Fetching all books from database...

MongoDB Connected
Found 5 books.

[1/5] Processing: "Khulasat al-Faasi"
  - Lines: 4
  ✓ Success - Job ID: job_cmgzlkgun0005jy04zklyhjka
  - Status: QUEUED

[2/5] Processing: "Al-Arabiyyah Bayna Yadayk"
  - Lines: 150
  ✓ Success - Job ID: job_cmgzlkhsa0006jy04xmklpqrs
  - Status: QUEUED

...

================================================================================
SUMMARY
================================================================================
Total books processed: 5
Successful: 5
Failed: 0

✓ Successfully created jobs:
  - "Khulasat al-Faasi" (Job ID: job_cmgzlkgun0005jy04zklyhjka)
  - "Al-Arabiyyah Bayna Yadayk" (Job ID: job_cmgzlkhsa0006jy04xmklpqrs)
  ...
```

## Data Format

Each book is ingested with the following structure:

```
Title: [Book Title]
Author: [Author Name]
Translator: [Translator Name]
Category: [Category]
Difficulty: [Difficulty Level]

Description: [Book Description]

================================================================================

--- Line 1 ---

Arabic: [Arabic text]
English: [English translation]
Commentary: [Commentary text]
Root Words: [Root words]

--- Line 2 ---

...
```

## Metadata

Each ingest job includes the following metadata:
- `bookId` - MongoDB ObjectId of the book
- `title` - Book title
- `author` - Book author
- `category` - Book category
- `linesCount` - Number of lines in the book

## Error Handling

- The script validates that `AGENTSET_API_KEY` and `AGENTSET_NAMESPACE` are set
- If a book fails to ingest, it continues with the next book and reports errors in the summary
- A 500ms delay is added between requests to avoid rate limiting

## Rate Limiting

The script includes a 500ms delay between each AgentSet API call to prevent hitting rate limits. If you have many books, the script will take some time to complete.

## Notes

- The script uses the AgentSet `/v1/namespace/{namespaceId}/ingest-jobs` endpoint
- Each book is submitted as a TEXT payload type
- The chunking strategy is set to "basic" and strategy is set to "auto"
- Jobs are created in QUEUED status and will be processed by AgentSet
