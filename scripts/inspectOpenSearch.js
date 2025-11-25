const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('@opensearch-project/opensearch');

const BOOK_TEXT_INDEX = process.env.ELASTICSEARCH_BOOK_TEXT_INDEX || 'book_texts';
const elasticNode = process.env.ELASTICSEARCH_NODE;
const elasticUsername = process.env.ELASTICSEARCH_USERNAME;
const elasticPassword = process.env.ELASTICSEARCH_PASSWORD;
const skipVerify = String(process.env.ELASTICSEARCH_SKIP_VERIFY || '').toLowerCase() === 'true';

if (!elasticNode) {
  console.error('Error: ELASTICSEARCH_NODE is not set in environment variables');
  process.exit(1);
}

// Create client
const config = { node: elasticNode };

if (skipVerify) {
  config.ssl = {
    rejectUnauthorized: false
  };
}

if (elasticUsername && elasticPassword) {
  config.auth = {
    username: elasticUsername,
    password: elasticPassword
  };
}

const client = new Client(config);

async function inspectIndex() {
  try {
    console.log(`\n=== Inspecting OpenSearch Index: ${BOOK_TEXT_INDEX} ===\n`);

    // Check if index exists
    const indexExists = await client.indices.exists({ index: BOOK_TEXT_INDEX });
    if (!indexExists) {
      console.log(`❌ Index "${BOOK_TEXT_INDEX}" does not exist!`);
      return;
    }

    console.log(`✅ Index "${BOOK_TEXT_INDEX}" exists\n`);

    // Get index stats
    const stats = await client.indices.stats({ index: BOOK_TEXT_INDEX });
    const docCount = stats.indices[BOOK_TEXT_INDEX].total.docs.count;
    const storeSize = stats.indices[BOOK_TEXT_INDEX].total.store.size_in_bytes;
    console.log(`📊 Total documents: ${docCount}`);
    console.log(`💾 Index size: ${(storeSize / 1024 / 1024).toFixed(2)} MB\n`);

    // Get index mapping
    console.log('📋 Index Mapping:');
    const mapping = await client.indices.getMapping({ index: BOOK_TEXT_INDEX });
    console.log(JSON.stringify(mapping[BOOK_TEXT_INDEX].mappings.properties, null, 2));
    console.log('');

    // Get a sample document
    console.log('📄 Sample Documents:\n');
    const searchResponse = await client.search({
      index: BOOK_TEXT_INDEX,
      body: {
        size: 3,
        query: { match_all: {} }
      }
    });

    searchResponse.hits.hits.forEach((hit, index) => {
      console.log(`--- Document ${index + 1} ---`);
      console.log(`ID: ${hit._id}`);
      console.log(`JobID: ${hit._source.jobId}`);
      console.log(`Language: ${hit._source.language}`);
      console.log(`Status: ${hit._source.status}`);
      console.log(`Visibility: ${hit._source.visibility}`);
      console.log(`ExtractedText length: ${hit._source.extractedText?.length || 0} chars`);
      console.log(`PagesText length: ${hit._source.pagesText?.length || 0} chars`);

      if (hit._source.pagesText && hit._source.pagesText.length > 0) {
        console.log(`PagesText preview: ${hit._source.pagesText.substring(0, 100)}...`);
      } else {
        console.log(`⚠️  PagesText is empty!`);
      }

      if (hit._source.extractedText && hit._source.extractedText.length > 0) {
        console.log(`ExtractedText preview: ${hit._source.extractedText.substring(0, 100)}...`);
      } else {
        console.log(`⚠️  ExtractedText is empty!`);
      }

      console.log('');
    });

    // Search for a specific term to test search functionality
    console.log('🔍 Testing search for "الله" (Allah):\n');
    const searchTest = await client.search({
      index: BOOK_TEXT_INDEX,
      body: {
        size: 5,
        query: {
          multi_match: {
            query: 'الله',
            fields: ['extractedText', 'pagesText']
          }
        }
      }
    });

    console.log(`Found ${searchTest.hits.total.value} results`);
    searchTest.hits.hits.forEach((hit, index) => {
      console.log(`${index + 1}. JobID: ${hit._source.jobId}, Score: ${hit._score}`);
    });

  } catch (error) {
    console.error('Error inspecting index:', error.message);
    if (error.meta?.body) {
      console.error('Error details:', JSON.stringify(error.meta.body, null, 2));
    }
  }
}

inspectIndex().then(() => {
  console.log('\n✅ Inspection complete');
  process.exit(0);
}).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
