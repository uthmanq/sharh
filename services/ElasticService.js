const { Client } = require('@opensearch-project/opensearch');
const BookTextPage = require('../models/BookTextPage');

const BOOK_INDEX = process.env.ELASTICSEARCH_BOOK_INDEX || 'books';
const BOOK_TEXT_INDEX = process.env.ELASTICSEARCH_BOOK_TEXT_INDEX || 'book_texts';
const BOOK_TEXT_PAGE_INDEX = process.env.ELASTICSEARCH_BOOK_TEXT_PAGE_INDEX || 'book_text_pages';
const elasticNode = process.env.ELASTICSEARCH_NODE;
const elasticUsername = process.env.ELASTICSEARCH_USERNAME;
const elasticPassword = process.env.ELASTICSEARCH_PASSWORD;
const skipVerify = String(process.env.ELASTICSEARCH_SKIP_VERIFY || '').toLowerCase() === 'true';

let client = null;
let indicesEnsured = false;

function isEnabled() {
  return Boolean(elasticNode);
}

function getClient() {
  if (!isEnabled()) {
    return null;
  }

  if (!client) {
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

    client = new Client(config);
  }

  return client;
}

async function ensureIndices() {
  if (!isEnabled() || indicesEnsured) {
    return;
  }

  const es = getClient();
  if (!es) {
    return;
  }

  const indicesToEnsure = [
    {
      name: BOOK_INDEX,
      body: {
        mappings: {
          properties: {
            title: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 256 } } },
            author: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 256 } } },
            description: { type: 'text' },
            category: { type: 'keyword' },
            translator: { type: 'keyword' },
            visibility: { type: 'keyword' },
            owner: { type: 'keyword' },
            contributors: { type: 'keyword' },
            linesText: { type: 'text' },
            metadata: { type: 'object', enabled: false },
            lastUpdated: { type: 'date' },
            createdAt: { type: 'date' }
          }
        }
      }
    },
    {
      name: BOOK_TEXT_INDEX,
      body: {
        mappings: {
          properties: {
            jobId: { type: 'keyword' },
            fileId: { type: 'keyword' },
            userId: { type: 'keyword' },
            language: { type: 'keyword' },
            status: { type: 'keyword' },
            visibility: { type: 'keyword' },
            extractedText: { type: 'text' },
            pagesText: { type: 'text' },
            metadata: { type: 'object', enabled: false },
            createdAt: { type: 'date' },
            updatedAt: { type: 'date' }
          }
        }
      }
    },
    {
      name: BOOK_TEXT_PAGE_INDEX,
      body: {
        mappings: {
          properties: {
            bookTextId: { type: 'keyword' },
            jobId: { type: 'keyword' },
            fileId: { type: 'keyword' },
            userId: { type: 'keyword' },
            language: { type: 'keyword' },
            status: { type: 'keyword' },
            visibility: { type: 'keyword' },
            pageNumber: { type: 'integer' },
            text: { type: 'text' },
            createdAt: { type: 'date' },
            updatedAt: { type: 'date' }
          }
        }
      }
    }
  ];

  for (const index of indicesToEnsure) {
    const exists = await es.indices.exists({ index: index.name });
    if (!exists) {
      await es.indices.create({ index: index.name, body: index.body });
    }
  }

  indicesEnsured = true;
}

function normalizeDocument(doc) {
  if (!doc) {
    return null;
  }

  if (typeof doc.toObject === 'function') {
    return doc.toObject({ depopulate: true });
  }

  return doc;
}

function buildBookDocument(book) {
  const raw = normalizeDocument(book);
  if (!raw) {
    console.log('buildBookDocument: raw document is null');
    return null;
  }

  const lines = Array.isArray(raw.lines) ? raw.lines : [];
  console.log(`[Book Indexing ${raw._id}] Found ${lines.length} lines in book`);

  const linesText = lines
    .map(line =>
      [line?.Arabic, line?.English, line?.commentary, line?.rootwords].filter(Boolean).join(' ')
    )
    .filter(Boolean)
    .join('\n');

  console.log(`[Book Indexing ${raw._id}] Built linesText with ${linesText.length} chars from ${lines.length} lines`);

  const document = {
    title: raw.title || '',
    author: raw.author || '',
    description: raw.description || '',
    category: raw.category || '',
    translator: raw.translator || '',
    visibility: raw.visibility || 'private',
    owner: raw.owner ? raw.owner.toString() : null,
    contributors: (raw.contributors || []).map(contributor => contributor?.toString()).filter(Boolean),
    linesText,
    metadata: raw.metadata || {},
    lastUpdated: raw.lastUpdated || raw.updatedAt || raw.createdAt,
    createdAt: raw.createdAt || new Date()
  };

  console.log(`[Book Indexing ${raw._id}] Document built - title: "${document.title}", linesText: ${document.linesText.length} chars`);

  return document;
}

async function buildBookTextDocument(bookText) {
  const raw = normalizeDocument(bookText);
  if (!raw) {
    console.log('buildBookTextDocument: raw document is null');
    return null;
  }

  // Fetch pages from BookTextPage collection (new approach)
  let pagesText = '';
  let pageSource = 'none';
  try {
    const pages = await BookTextPage.find({ bookTextId: raw._id })
      .select('text')
      .sort({ pageNumber: 1 })
      .lean();

    if (pages && pages.length > 0) {
      pagesText = pages.map(page => page.text).filter(Boolean).join('\n');
      pageSource = 'BookTextPage';
      console.log(`[Indexing ${raw._id}] Found ${pages.length} pages in BookTextPage collection, total text length: ${pagesText.length}`);
    } else if (Array.isArray(raw.pages)) {
      // Fallback to old pages array for unmigrated documents
      pagesText = raw.pages.map(page => page?.text).filter(Boolean).join('\n');
      pageSource = 'pages_array';
      console.log(`[Indexing ${raw._id}] Using fallback pages array with ${raw.pages.length} pages, total text length: ${pagesText.length}`);
    } else {
      console.log(`[Indexing ${raw._id}] No pages found in either location`);
    }
  } catch (error) {
    console.error(`[Indexing ${raw._id}] Error fetching pages for indexing:`, error);
    // Fallback to old pages array on error
    if (Array.isArray(raw.pages)) {
      pagesText = raw.pages.map(page => page?.text).filter(Boolean).join('\n');
      pageSource = 'pages_array_fallback';
      console.log(`[Indexing ${raw._id}] Using fallback pages array due to error`);
    }
  }

  const document = {
    jobId: raw.jobId,
    fileId: raw.fileId ? raw.fileId.toString() : null,
    userId: raw.userId ? raw.userId.toString() : null,
    language: raw.language || 'ar',
    status: raw.status || 'pending',
    visibility: raw.visibility || 'private',
    extractedText: raw.extractedText || '',
    pagesText,
    metadata: raw.metadata || {},
    createdAt: raw.createdAt || new Date(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date()
  };

  console.log(`[Indexing ${raw._id}] Document built - extractedText: ${document.extractedText.length} chars, pagesText: ${document.pagesText.length} chars (from ${pageSource})`);

  return document;
}

function buildBookTextPageDocument(page, parentBookText) {
  const rawPage = normalizeDocument(page);
  if (!rawPage) {
    return null;
  }

  const parent = parentBookText ? normalizeDocument(parentBookText) : null;

  return {
    bookTextId: rawPage.bookTextId ? rawPage.bookTextId.toString() : null,
    jobId: rawPage.jobId,
    fileId: parent?.fileId ? parent.fileId.toString() : null,
    userId: parent?.userId ? parent.userId.toString() : null,
    language: parent?.language || 'ar',
    status: parent?.status || 'pending',
    visibility: parent?.visibility || 'private',
    pageNumber: rawPage.pageNumber,
    text: rawPage.text || '',
    createdAt: rawPage.createdAt || new Date(),
    updatedAt: rawPage.updatedAt || rawPage.createdAt || new Date()
  };
}

async function indexBookDocument(book) {
  if (!isEnabled()) {
    return;
  }

  const es = getClient();
  if (!es) {
    return;
  }

  const document = buildBookDocument(book);
  if (!document) {
    return;
  }

  try {
    await ensureIndices();
    await es.index({
      index: BOOK_INDEX,
      id: book._id ? book._id.toString() : undefined,
      body: document
    });
  } catch (error) {
    console.error('Failed to index book document', error);
  }
}

async function removeBookDocument(bookId) {
  if (!isEnabled()) {
    return;
  }

  const es = getClient();
  if (!es) {
    return;
  }

  try {
    await es.delete({
      index: BOOK_INDEX,
      id: bookId.toString()
    }, { ignore: [404] });
  } catch (error) {
    console.error('Failed to remove book document', error);
  }
}

async function indexBookTextDocument(bookText) {
  if (!isEnabled()) {
    console.log('[Indexing] Elasticsearch is not enabled');
    return;
  }

  const es = getClient();
  if (!es) {
    console.log('[Indexing] Elasticsearch client is null');
    return;
  }

  const document = await buildBookTextDocument(bookText);
  if (!document) {
    console.log('[Indexing] Document build returned null');
    return;
  }

  try {
    await ensureIndices();
    const response = await es.index({
      index: BOOK_TEXT_INDEX,
      id: bookText._id ? bookText._id.toString() : undefined,
      body: document
    });
    console.log(`[Indexing ${bookText._id}] Successfully indexed to ${BOOK_TEXT_INDEX}, result: ${response.result}`);
  } catch (error) {
    console.error(`[Indexing ${bookText._id}] Failed to index book text document:`, error.message);
  }
}

async function removeBookTextDocument(bookTextId) {
  if (!isEnabled()) {
    return;
  }

  const es = getClient();
  if (!es) {
    return;
  }

  try {
    await es.delete({
      index: BOOK_TEXT_INDEX,
      id: bookTextId.toString()
    }, { ignore: [404] });
  } catch (error) {
    console.error('Failed to remove book text document', error);
  }
}

async function indexBookTextPageDocument(page, parentBookText) {
  if (!isEnabled()) {
    return;
  }

  const es = getClient();
  if (!es) {
    return;
  }

  const document = buildBookTextPageDocument(page, parentBookText);
  if (!document || !document.bookTextId) {
    return;
  }

  try {
    await ensureIndices();
    await es.index({
      index: BOOK_TEXT_PAGE_INDEX,
      id: page._id ? page._id.toString() : undefined,
      body: document
    });
  } catch (error) {
    console.error(`[Indexing page ${page._id}] Failed to index book text page document`, error);
  }
}

async function removeBookTextPageDocument(pageId) {
  if (!isEnabled()) {
    return;
  }

  const es = getClient();
  if (!es) {
    return;
  }

  try {
    await es.delete({
      index: BOOK_TEXT_PAGE_INDEX,
      id: pageId.toString()
    }, { ignore: [404] });
  } catch (error) {
    console.error('Failed to remove book text page document', error);
  }
}

async function searchBooksInIndex({ query, from = 0, size = 20, filters = {} }) {
  if (!isEnabled()) {
    return null;
  }

  const es = getClient();
  if (!es) {
    return null;
  }

  const must = [];
  if (query) {
    must.push({
      multi_match: {
        query,
        fields: [
          'title^3',
          'author^2',
          'description',
          'linesText'
        ],
        type: 'best_fields',
        fuzziness: 'AUTO'
      }
    });
  }

  const bool = { must };

  if (filters.visibility) {
    bool.filter = [{ term: { visibility: filters.visibility } }];
  }

  if (Array.isArray(filters.allowedVisibilities) && filters.allowedVisibilities.length) {
    bool.should = filters.allowedVisibilities.map(filterOption => {
      if (filterOption.type === 'visibility') {
        return { term: { visibility: filterOption.value } };
      }

      if (filterOption.type === 'owner') {
        return { term: { owner: filterOption.value } };
      }

      if (filterOption.type === 'contributor') {
        return { term: { contributors: filterOption.value } };
      }

      return null;
    }).filter(Boolean);

    bool.minimum_should_match = 1;
  }

  const body = {
    from,
    size,
    query: bool
  };

  try {
    await ensureIndices();
    const response = await es.search({
      index: BOOK_INDEX,
      body
    });

    return response.hits;
  } catch (error) {
    console.error('Failed to search books index', error);
    return null;
  }
}

async function searchBookTextsInIndex({ query, from = 0, size = 20, userFilter }) {
  if (!isEnabled()) {
    return null;
  }

  const es = getClient();
  if (!es) {
    return null;
  }

  const must = [];
  if (query) {
    must.push({
      multi_match: {
        query,
        fields: [
          'extractedText',
          'pagesText'
        ],
        fuzziness: 'AUTO'
      }
    });
  }

  const filter = [];

  if (userFilter?.visibility) {
    filter.push({ term: { visibility: userFilter.visibility } });
  }

  if (userFilter?.userId) {
    filter.push({ term: { userId: userFilter.userId } });
  }

  const body = {
    from,
    size,
    query: {
      bool: {
        must,
        filter
      }
    }
  };

  try {
    await ensureIndices();
    const response = await es.search({
      index: BOOK_TEXT_INDEX,
      body
    });

    return response.hits;
  } catch (error) {
    console.error('Failed to search book text index', error);
    return null;
  }
}

async function searchBookTextPagesInIndex({ query, from = 0, size = 20, userFilter }) {
  if (!isEnabled()) {
    return null;
  }

  const es = getClient();
  if (!es) {
    return null;
  }

  const must = [];
  if (query) {
    must.push({
      match: {
        text: {
          query,
          fuzziness: 'AUTO'
        }
      }
    });
  }

  const filter = [];
  if (userFilter?.visibility) {
    filter.push({ term: { visibility: userFilter.visibility } });
  }

  if (userFilter?.userId) {
    filter.push({ term: { userId: userFilter.userId } });
  }

  const body = {
    from,
    size,
    query: {
      bool: {
        must,
        filter
      }
    },
    highlight: {
      fields: {
        text: {}
      }
    }
  };

  try {
    await ensureIndices();
    const response = await es.search({
      index: BOOK_TEXT_PAGE_INDEX,
      body
    });

    return response.hits;
  } catch (error) {
    console.error('Failed to search book text page index', error);
    return null;
  }
}

module.exports = {
  isEnabled,
  indexBookDocument,
  removeBookDocument,
  indexBookTextDocument,
  removeBookTextDocument,
  indexBookTextPageDocument,
  removeBookTextPageDocument,
  searchBooksInIndex,
  searchBookTextsInIndex,
  searchBookTextPagesInIndex
};
