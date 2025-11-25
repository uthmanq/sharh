const { Client } = require('@opensearch-project/opensearch');

const BOOK_INDEX = process.env.ELASTICSEARCH_BOOK_INDEX || 'books';
const BOOK_TEXT_INDEX = process.env.ELASTICSEARCH_BOOK_TEXT_INDEX || 'book_texts';
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
    return null;
  }

  const lines = Array.isArray(raw.lines) ? raw.lines : [];
  const linesText = lines
    .map(line =>
      [line?.Arabic, line?.English, line?.commentary, line?.rootwords].filter(Boolean).join(' ')
    )
    .filter(Boolean)
    .join('\n');

  return {
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
}

function buildBookTextDocument(bookText) {
  const raw = normalizeDocument(bookText);
  if (!raw) {
    return null;
  }

  const pagesText = Array.isArray(raw.pages)
    ? raw.pages.map(page => page?.text).filter(Boolean).join('\n')
    : '';

  return {
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
      document
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
    return;
  }

  const es = getClient();
  if (!es) {
    return;
  }

  const document = buildBookTextDocument(bookText);
  if (!document) {
    return;
  }

  try {
    await ensureIndices();
    await es.index({
      index: BOOK_TEXT_INDEX,
      id: bookText._id ? bookText._id.toString() : undefined,
      document
    });
  } catch (error) {
    console.error('Failed to index book text document', error);
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

module.exports = {
  isEnabled,
  indexBookDocument,
  removeBookDocument,
  indexBookTextDocument,
  removeBookTextDocument,
  searchBooksInIndex,
  searchBookTextsInIndex
};
