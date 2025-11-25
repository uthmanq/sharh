const express = require('express');
const router = express.Router();
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const multer = require('multer');
const authenticateToken = require('../middleware/authenticate');
const { optionalAuthenticateToken } = require('../middleware/authenticate');
const s3Service = require('../scripts/accessS3');
const File = require('../models/File');
const BookText = require('../models/BookText');
const BookTextPage = require('../models/BookTextPage');
const {
  searchBookTextsInIndex,
  searchBookTextPagesInIndex,
  isEnabled: isElasticSearchEnabled
} = require('../services/ElasticService');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const fsSync = require('fs');
const tmp = require('tmp-promise');
require('dotenv').config();

// Initialize SQS client
const sqsClient = new SQSClient({
  region: process.env.AWS_REGION
});

// Set up multer to store files temporarily on the server
const upload = multer({
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    // List of allowed PDF and image MIME types for OCR
    const allowedTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/tiff',
      'image/bmp',
      'image/webp'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and image files are allowed for OCR.'), false);
    }
  },
  limits: {
    fileSize: 1024 * 1024 * 1000 // 1000MB file size limit
  }
});


// Route for worker to submit incremental page updates during OCR processing
router.post('/result/page', authenticateToken(['admin', 'editor']), async (req, res) => {
  try {
    const {
      jobId,
      fileId,
      userId,
      pageNumber,
      status,
      text,
      error,
      s3Key,
      pageCount,
      pagesProcessed
    } = req.body;

    // Validate required fields
    if (!jobId || !fileId || !userId || pageNumber === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: jobId, fileId, userId, and pageNumber are required'
      });
    }

    // Check if BookText record exists
    let bookText = await BookText.findOne({ jobId: jobId });

    if (!bookText) {
      // Create a new BookText record for orphaned jobs
      bookText = new BookText({
        jobId: jobId,
        fileId: fileId,
        userId: userId,
        extractedText: '',
        language: 'ar',
        status: 'processing',
        pageCount: pageCount || 0,
        metadata: { pageErrors: [] }
      });

      await bookText.save();
      console.log(`Created BookText record for orphaned job during page update: ${jobId}`);
    }

    // Save or update page in BookTextPage collection
    await BookTextPage.findOneAndUpdate(
      {
        bookTextId: bookText._id,
        pageNumber: pageNumber
      },
      {
        bookTextId: bookText._id,
        jobId: jobId,
        pageNumber: pageNumber,
        text: text || '',
        s3Key: s3Key || null,
        updatedAt: new Date()
      },
      {
        upsert: true,
        new: true
      }
    );

    // Update BookText metadata
    const updateOps = {
      $set: {
        updatedAt: new Date(),
        'metadata.pagesProcessed': pagesProcessed,
        'metadata.lastPageUpdate': new Date().toISOString(),
        status: 'processing' // Update status to processing if it's pending
      }
    };

    // Update page count if provided
    if (pageCount) {
      updateOps.$set.pageCount = pageCount;
    }

    await BookText.updateOne({ jobId: jobId }, updateOps);

    // Handle page-level errors separately
    if (status === 'failed' && error) {
      const pageError = {
        pageNumber: pageNumber,
        error: error,
        timestamp: new Date().toISOString()
      };

      // Try to update existing error for this page
      const errorResult = await BookText.updateOne(
        {
          jobId: jobId,
          'metadata.pageErrors.pageNumber': pageNumber
        },
        {
          $set: {
            'metadata.pageErrors.$': pageError
          }
        }
      );

      // If no error was updated, push a new error
      if (errorResult.matchedCount === 0 || errorResult.modifiedCount === 0) {
        await BookText.updateOne(
          { jobId: jobId },
          {
            $push: { 'metadata.pageErrors': pageError }
          }
        );
      }
    }

    res.status(200).json({
      success: true
    });

  } catch (err) {
    console.error('Error processing page update:', err);
    res.status(500).json({
      success: false,
      message: 'Error processing page update',
      error: err.message
    });
  }
});

// Route for worker to submit extracted text after OCR processing is complete
// Note: MongoDB has a 16MB document size limit, so for large documents we:
// 1. Store extractedText in S3 (if >10KB) and keep only a 1000-char preview in MongoDB
// 2. Store pages array WITHOUT text content to avoid exceeding document size limit
// 3. Full text can be retrieved via GET /text/:jobId or GET /books/:bookTextId
router.post('/result', authenticateToken(['admin', 'editor']), async (req, res) => {
  try {
    const {
      jobId,
      fileId,
      userId,
      extractedText,
      language,
      pageCount,
      pages,
      metadata,
      status,
      error,
      processingTime
    } = req.body;

    // Validate required fields
    if (!jobId || !fileId || !userId) {
      return res.status(400).json({
        message: 'Missing required fields: jobId, fileId, and userId are required'
      });
    }

    // Check if BookText already exists for this job (idempotency)
    let bookText = await BookText.findOne({ jobId: jobId });

    if (!bookText) {
      // Create a new BookText record for orphaned jobs
      bookText = new BookText({
        jobId: jobId,
        fileId: fileId,
        userId: userId,
        extractedText: '',
        language: language || 'ar',
        status: 'processing',
        metadata: metadata || {}
      });

      console.log(`Creating BookText record for orphaned job: ${jobId}`);
    }

    // If extracted text is provided and large, store it in S3
    let textS3Key = null;
    if (extractedText && extractedText.length > 10000) { // Store in S3 if > 10KB
      textS3Key = `ocr-results/${jobId}.txt`;

      // Write text to temporary file using streams to avoid buffer overflow
      const tmpFile = await tmp.file({ postfix: '.txt' });

      try {
        // For very large texts, write using streams to avoid buffer size limits
        await new Promise((resolve, reject) => {
          const writeStream = fsSync.createWriteStream(tmpFile.path, { encoding: 'utf8' });

          writeStream.on('error', reject);
          writeStream.on('finish', resolve);

          // Write in chunks to avoid buffer overflow
          const chunkSize = 1024 * 1024; // 1MB chunks
          for (let i = 0; i < extractedText.length; i += chunkSize) {
            const chunk = extractedText.substring(i, Math.min(i + chunkSize, extractedText.length));
            writeStream.write(chunk);
          }

          writeStream.end();
        });

        // Upload to S3
        await s3Service.uploadFile(tmpFile.path, textS3Key);

        // Clean up temp file
        await tmpFile.cleanup();
      } catch (writeError) {
        console.error('Error writing large text file:', writeError);
        // Clean up on error
        try {
          await tmpFile.cleanup();
        } catch (cleanupErr) {
          console.error('Error cleaning up temp file:', cleanupErr);
        }
        throw writeError;
      }
    }

    // Update BookText record
    if (extractedText) {
      if (textS3Key) {
        // Store S3 reference and summary only
        bookText.metadata = {
          ...bookText.metadata,
          ...metadata,
          textS3Key: textS3Key,
          textLength: extractedText.length
        };
        bookText.extractedText = extractedText.substring(0, 1000) + '... [Full text stored in S3]';
      } else {
        // Store full text in MongoDB for smaller texts
        bookText.extractedText = extractedText;
        bookText.metadata = { ...bookText.metadata, ...metadata };
      }
    }

    bookText.language = language || bookText.language;
    bookText.pageCount = pageCount || bookText.pageCount;
    bookText.status = status || bookText.status;
    bookText.error = error || bookText.error;
    bookText.processingTime = processingTime || bookText.processingTime;

    await bookText.save();

    // Save pages to BookTextPage collection (avoids MongoDB 16MB document size limit)
    if (pages && Array.isArray(pages)) {
      const pageOperations = pages.map(page => ({
        updateOne: {
          filter: {
            bookTextId: bookText._id,
            pageNumber: page.pageNumber
          },
          update: {
            $set: {
              bookTextId: bookText._id,
              jobId: jobId,
              pageNumber: page.pageNumber,
              text: page.text || '',
              s3Key: page.s3Key || null,
              isAIGenerated: page.isAIGenerated !== undefined ? page.isAIGenerated : true,
              updatedAt: new Date()
            }
          },
          upsert: true
        }
      }));

      // Bulk write for better performance
      if (pageOperations.length > 0) {
        await BookTextPage.bulkWrite(pageOperations);
      }
    }

    res.status(201).json({
      message: 'OCR result saved successfully',
      bookTextId: bookText._id.toString(),
      status: bookText.status
    });

  } catch (err) {
    console.error('Error saving OCR result:', err);
    res.status(500).json({
      message: 'Error saving OCR result',
      error: err.message
    });
  }
});

// Route to upload a PDF/image and create an OCR job
router.post('/', authenticateToken(['member', 'admin']), upload.single('file'), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Extract optional metadata from request
    const {
      fileName = file.originalname,
      language = 'ar',
      author = 'Unknown',
      tags = '',
      categories = '',
      visibility = 'private',
      customPrompt,
      jobMetadata
    } = req.body;

    // Parse tags and categories into arrays
    const tagsArray = tags ? tags.split(',').map(tag => tag.trim()).filter(Boolean) : [];
    const categoriesArray = categories ? categories.split(',').map(cat => cat.trim()).filter(Boolean) : [];

    // Generate a unique key for S3
    const uniqueKey = `ocr/${uuidv4()}-${file.originalname}`;

    // Upload file to S3
    const s3Data = await s3Service.uploadFile(file.path, uniqueKey);

    // Clean up temporary file
    await fs.unlink(file.path);

    // Save file metadata in MongoDB
    const newFile = new File({
      fileName: fileName,
      s3Key: s3Data.Key,
      author: author,
      s3Bucket: s3Data.Bucket,
      fileSize: file.size,
      fileType: file.mimetype,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      categories: categories ? categories.split(',').map(cat => cat.trim()) : ['ocr'],
      visibility: visibility
    });

    await newFile.save();

    // Prepare SQS message
    const jobId = uuidv4();
    const messageBody = {
      jobId: jobId,
      fileId: newFile._id.toString(),
      userId: req.user.id,
      s3Bucket: s3Data.Bucket,
      s3Key: s3Data.Key,
      fileName: fileName,
      fileType: file.mimetype,
      fileSize: file.size,
      language: language,
      customPrompt: customPrompt || null,
      metadata: jobMetadata ? JSON.parse(jobMetadata) : {},
      createdAt: new Date().toISOString()
    };

    // Create BookText record with pending status
    const bookText = new BookText({
      jobId: jobId,
      fileId: newFile._id,
      userId: req.user.id,
      extractedText: '',
      language: language,
      tags: tagsArray,
      categories: categoriesArray,
      status: 'pending',
      metadata: jobMetadata ? JSON.parse(jobMetadata) : {}
    });

    await bookText.save();

    // Send message to SQS
    const sqsParams = {
      QueueUrl: process.env.SQS_OCR_QUEUE_URL,
      MessageBody: JSON.stringify(messageBody),
      MessageAttributes: {
        JobType: {
          DataType: 'String',
          StringValue: 'ocr'
        },
        UserId: {
          DataType: 'String',
          StringValue: req.user.id
        },
        FileType: {
          DataType: 'String',
          StringValue: file.mimetype
        }
      }
    };

    const command = new SendMessageCommand(sqsParams);
    const sqsResponse = await sqsClient.send(command);

    // Return success response
    res.status(201).json({
      message: 'OCR job created successfully',
      jobId: jobId,
      bookTextId: bookText._id.toString(),
      fileId: newFile._id.toString(),
      fileName: fileName,
      s3Key: s3Data.Key,
      sqsMessageId: sqsResponse.MessageId,
      status: 'pending'
    });

  } catch (err) {
    console.error('Error creating OCR job:', err);

    // Clean up uploaded file if it exists
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkErr) {
        console.error('Error cleaning up temporary file:', unlinkErr);
      }
    }

    res.status(500).json({
      message: 'Error creating OCR job',
      error: err.message
    });
  }
});


// Route to get OCR job status by jobId
router.get('/status/:jobId', authenticateToken(['member', 'admin']), async (req, res) => {
  try {
    const { jobId } = req.params;

    const bookText = await BookText.findOne({ jobId: jobId })
      .populate('fileId', 'fileName author fileType fileSize');

    if (!bookText) {
      return res.status(404).json({ message: 'OCR job not found' });
    }

    // Check authorization - user can only view their own jobs unless admin or editor
    const isAdminOrEditor = req.user.roles.includes('admin') || req.user.roles.includes('editor');
    if (bookText.userId.toString() !== req.user.id && !isAdminOrEditor) {
      return res.status(403).json({ message: 'Unauthorized to view this job' });
    }

    res.status(200).json({
      success: true,
      job: {
        jobId: bookText.jobId,
        fileId: bookText.fileId._id,
        fileName: bookText.fileId.fileName,
        status: bookText.status,
        language: bookText.language,
        pageCount: bookText.pageCount,
        error: bookText.error,
        processingTime: bookText.processingTime,
        createdAt: bookText.createdAt,
        updatedAt: bookText.updatedAt,
        completedAt: bookText.completedAt,
        hasFullText: bookText.metadata?.textS3Key ? true : false
      }
    });

  } catch (err) {
    console.error('Error retrieving OCR job status:', err);
    res.status(500).json({
      message: 'Error retrieving OCR job status',
      error: err.message
    });
  }
});

// Route to get extracted text by jobId
router.get('/text/:jobId', authenticateToken(['member', 'admin']), async (req, res) => {
  try {
    const { jobId } = req.params;

    const bookText = await BookText.findOne({ jobId: jobId })
      .populate('fileId', 'fileName author');

    if (!bookText) {
      return res.status(404).json({ message: 'Extracted text not found for this job' });
    }

    // Check authorization
    const isAdminOrEditor = req.user.roles.includes('admin') || req.user.roles.includes('editor');
    if (bookText.userId.toString() !== req.user.id && !isAdminOrEditor) {
      return res.status(403).json({ message: 'Unauthorized to view this text' });
    }

    // If text is stored in S3, retrieve it
    let fullText = bookText.extractedText;
    if (bookText.metadata?.textS3Key) {
      try {
        const textStream = s3Service.getFileStream(bookText.metadata.textS3Key);
        const chunks = [];

        for await (const chunk of textStream) {
          chunks.push(chunk);
        }

        fullText = Buffer.concat(chunks).toString('utf8');
      } catch (s3Error) {
        console.error('Error retrieving text from S3:', s3Error);
        return res.status(500).json({
          message: 'Error retrieving full text from storage',
          error: s3Error.message
        });
      }
    }

    // Fetch pages from BookTextPage collection
    let pages = await BookTextPage.find({ bookTextId: bookText._id })
      .sort({ pageNumber: 1 })
      .select('pageNumber text s3Key isAIGenerated')
      .lean();

    // Fallback: If no pages in BookTextPage collection, use old pages array format
    if (pages.length === 0 && bookText.pages && bookText.pages.length > 0) {
      console.log(`Using fallback pages array for book ${bookText._id}`);
      pages = bookText.pages;
    }

    res.status(200).json({
      success: true,
      data: {
        jobId: bookText.jobId,
        fileId: bookText.fileId._id,
        fileName: bookText.fileId.fileName,
        extractedText: fullText,
        language: bookText.language,
        pageCount: bookText.pageCount,
        pages: pages,
        status: bookText.status,
        completedAt: bookText.completedAt
      }
    });

  } catch (err) {
    console.error('Error retrieving extracted text:', err);
    res.status(500).json({
      message: 'Error retrieving extracted text',
      error: err.message
    });
  }
});

// Route to list all OCR jobs for the authenticated user
router.get('/jobs', authenticateToken(['member', 'admin']), async (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;

    const filter = { userId: req.user.id };
    if (status) {
      filter.status = status;
    }

    const jobs = await BookText.find(filter)
      .populate('fileId', 'fileName author fileType fileSize')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    const total = await BookText.countDocuments(filter);

    res.status(200).json({
      success: true,
      total: total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      jobs: jobs.map(job => ({
        jobId: job.jobId,
        bookTextId: job._id,
        fileId: job.fileId._id,
        fileName: job.fileId.fileName,
        status: job.status,
        language: job.language,
        tags: job.tags,
        categories: job.categories,
        pageCount: job.pageCount,
        error: job.error,
        processingTime: job.processingTime,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt
      }))
    });

  } catch (err) {
    console.error('Error retrieving OCR jobs:', err);
    res.status(500).json({
      message: 'Error retrieving OCR jobs',
      error: err.message
    });
  }
});

const isBookTextPrivilegedUser = (user) => {
  return Boolean(user && Array.isArray(user.roles) && (user.roles.includes('admin') || user.roles.includes('editor')));
};

const buildBookTextMongoAccessFilter = (user) => {
  if (!user) {
    return { visibility: 'public' };
  }

  if (isBookTextPrivilegedUser(user)) {
    return {};
  }

  return { userId: user._id };
};

const buildBookTextElasticFilter = (user) => {
  if (!user) {
    return { visibility: 'public' };
  }

  if (isBookTextPrivilegedUser(user)) {
    return {};
  }

  return { userId: user._id.toString() };
};

const mergeBookTextQuery = (baseQuery, accessFilter) => {
  if (!accessFilter || Object.keys(accessFilter).length === 0) {
    return baseQuery;
  }

  return { $and: [baseQuery, accessFilter] };
};

const buildBookTextRegex = (query) => {
  try {
    return new RegExp(query, 'i');
  } catch (err) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, 'i');
  }
};

const getBookTextExcerpt = (text, query, contextLength = 120) => {
  const lower = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lower.indexOf(lowerQuery);
  if (index === -1) {
    return null;
  }

  let start = Math.max(0, index - contextLength);
  let end = Math.min(text.length, index + query.length + contextLength);

  start = text.lastIndexOf(' ', start);
  if (start === -1) {
    start = 0;
  }

  end = text.indexOf(' ', end);
  if (end === -1) {
    end = text.length;
  }

  return text.slice(start, end).trim();
};

const formatBookTextSearchResults = (books, query, regex, pageMatchesMap = {}) => {
  return books.map(book => {
    const matches = [];

    if (book.extractedText && regex.test(book.extractedText)) {
      matches.push({
        pageNumber: null,
        excerpt: getBookTextExcerpt(book.extractedText, query)
      });
    }

    const pageMatches = pageMatchesMap[book._id.toString()] || [];
    pageMatches.forEach(match => {
      matches.push(match);
    });

    return {
      bookTextId: book._id,
      jobId: book.jobId,
      fileId: book.fileId?._id,
      fileName: book.fileId?.fileName,
      author: book.fileId?.author,
      userId: book.userId?._id,
      username: book.userId?.username,
      language: book.language,
      tags: book.tags,
      categories: book.categories,
      visibility: book.visibility,
      status: book.status,
      pageCount: book.pageCount,
      matches: matches.slice(0, 5),
      updatedAt: book.updatedAt,
      createdAt: book.createdAt
    };
  });
};

const findMatchingPagesForBooks = async (bookIds = [], regex, query, limitPerBook = 5) => {
  if (!bookIds.length || !regex) {
    return {};
  }

  try {
    const maxDocuments = bookIds.length * limitPerBook * 3;
    const pages = await BookTextPage.find({
      bookTextId: { $in: bookIds },
      text: regex
    })
      .select('bookTextId pageNumber text')
      .sort({ pageNumber: 1 })
      .limit(maxDocuments)
      .lean();

    return pages.reduce((acc, page) => {
      const key = page.bookTextId.toString();
      if (!acc[key]) {
        acc[key] = [];
      }
      if (acc[key].length >= limitPerBook) {
        return acc;
      }

      const excerpt = getBookTextExcerpt(page.text || '', query);
      if (excerpt) {
        acc[key].push({
          pageNumber: page.pageNumber,
          excerpt
        });
      }

      return acc;
    }, {});
  } catch (err) {
    console.error('Error fetching page matches for search results:', err);
    return {};
  }
};

const buildPageMatchesFromHits = (hits, query, limitPerBook = 5) => {
  if (!hits || !Array.isArray(hits.hits)) {
    return {};
  }

  return hits.hits.reduce((acc, hit) => {
    const source = hit._source || {};
    const bookTextId = source.bookTextId;
    if (!bookTextId) {
      return acc;
    }

    if (!acc[bookTextId]) {
      acc[bookTextId] = [];
    }

    if (acc[bookTextId].length >= limitPerBook) {
      return acc;
    }

    const excerpt = hit.highlight?.text?.[0] || getBookTextExcerpt(source.text || '', query);
    if (excerpt) {
      acc[bookTextId].push({
        pageNumber: source.pageNumber,
        excerpt
      });
    }

    return acc;
  }, {});
};

router.get('/books/search', optionalAuthenticateToken(), async (req, res) => {
  const { q, limit = 20, offset = 0 } = req.query;

  if (!q) {
    return res.status(400).json({
      success: false,
      message: 'Missing query parameter "q"'
    });
  }

  try {
    const size = Math.min(parseInt(limit, 10) || 20, 50);
    const from = parseInt(offset, 10) || 0;
    const regex = buildBookTextRegex(q);
    const accessFilter = buildBookTextMongoAccessFilter(req.user);
    const elasticFilter = buildBookTextElasticFilter(req.user);

    if (isElasticSearchEnabled()) {
      const [textHits, pageHits] = await Promise.all([
        searchBookTextsInIndex({
          query: q,
          from,
          size,
          userFilter: elasticFilter
        }),
        searchBookTextPagesInIndex({
          query: q,
          from,
          size,
          userFilter: elasticFilter
        })
      ]);

      const textIds = Array.isArray(textHits?.hits) ? textHits.hits.map(hit => hit._id) : [];
      const pageIds = Array.isArray(pageHits?.hits)
        ? pageHits.hits
            .map(hit => hit._source?.bookTextId)
            .filter(Boolean)
        : [];

      const combinedIds = [...textIds];
      pageIds.forEach(id => {
        if (!combinedIds.includes(id)) {
          combinedIds.push(id);
        }
      });

      if (combinedIds.length) {
        let mongoQuery = { _id: { $in: combinedIds } };
        if (accessFilter && Object.keys(accessFilter).length > 0) {
          mongoQuery = { $and: [mongoQuery, accessFilter] };
        }

        const docs = await BookText.find(mongoQuery)
          .populate('fileId', 'fileName author fileType fileSize s3Key')
          .populate('userId', 'username email');

        const docMap = new Map(docs.map(doc => [doc._id.toString(), doc]));
        const ordered = combinedIds.map(id => docMap.get(id)).filter(Boolean);
        const pageMatches = buildPageMatchesFromHits(pageHits, q);

        if (ordered.length) {
          const totalCount = textHits?.total?.value ?? pageHits?.total?.value ?? ordered.length;
          return res.status(200).json({
            success: true,
            total: totalCount,
            limit: size,
            offset: from,
            books: formatBookTextSearchResults(ordered, q, regex, pageMatches)
          });
        }
      }
    }

    // Note: Pages are now in a separate BookTextPage collection
    // Search extractedText and include books that have matching pages
    const pageMatchIds = await BookTextPage.distinct('bookTextId', { text: regex });

    const orConditions = [{ extractedText: { $regex: q, $options: 'i' } }];
    if (pageMatchIds.length > 0) {
      orConditions.push({ _id: { $in: pageMatchIds } });
    }

    const baseQuery = orConditions.length === 1 ? orConditions[0] : { $or: orConditions };

    const finalQuery = mergeBookTextQuery(baseQuery, accessFilter);

    const [books, total] = await Promise.all([
      BookText.find(finalQuery)
        .populate('fileId', 'fileName author fileType fileSize s3Key')
        .populate('userId', 'username email')
        .limit(size)
        .skip(from),
      BookText.countDocuments(finalQuery)
    ]);
    const pageMatches = await findMatchingPagesForBooks(
      books.map(book => book._id),
      regex,
      q
    );

    res.status(200).json({
      success: true,
      total,
      limit: size,
      offset: from,
      books: formatBookTextSearchResults(books, q, regex, pageMatches)
    });
  } catch (err) {
    console.error('Error searching OCR books:', err);
    res.status(500).json({
      success: false,
      message: 'Error searching books',
      error: err.message
    });
  }
});

// Route to get a specific book by bookTextId including its full text
router.get('/books/:bookTextId', optionalAuthenticateToken(), async (req, res) => {
  try {
    const { bookTextId } = req.params;
    const {
      pageLimit = 50,
      pageOffset = 0,
      includeText = 'true'
    } = req.query;

    const bookText = await BookText.findById(bookTextId)
      .populate('fileId', 'fileName author fileType fileSize s3Key visibility')
      .populate('userId', 'username email');

    if (!bookText) {
      return res.status(404).json({ message: 'Book not found' });
    }

    // Check authorization based on visibility
    const isPublic = bookText.visibility === 'public';
    const isOwner = req.user && bookText.userId._id.toString() === req.user.id;
    const isAdmin = req.user && (req.user.roles.includes('admin') || req.user.roles.includes('editor'));

    if (!isPublic && !isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Unauthorized to view this book' });
    }

    // If text is stored in S3, retrieve it (optional based on query param)
    let fullText = null;
    const shouldIncludeText = includeText === 'true';

    if (shouldIncludeText) {
      fullText = bookText.extractedText;
      if (bookText.metadata?.textS3Key) {
        try {
          const textStream = s3Service.getFileStream(bookText.metadata.textS3Key);
          const chunks = [];

          for await (const chunk of textStream) {
            chunks.push(chunk);
          }

          fullText = Buffer.concat(chunks).toString('utf8');
        } catch (s3Error) {
          console.error('Error retrieving text from S3:', s3Error);
          return res.status(500).json({
            message: 'Error retrieving full text from storage',
            error: s3Error.message
          });
        }
      }
    }

    // Fetch pages from BookTextPage collection
    const limit = parseInt(pageLimit);
    const offset = parseInt(pageOffset);

    // Get total page count
    let totalPages = await BookTextPage.countDocuments({ bookTextId: bookText._id });

    // Fetch paginated pages
    let paginatedPages = await BookTextPage.find({ bookTextId: bookText._id })
      .sort({ pageNumber: 1 })
      .skip(offset)
      .limit(limit)
      .lean();

    // Fallback: If no pages in BookTextPage collection, use old pages array format
    if (totalPages === 0 && bookText.pages && bookText.pages.length > 0) {
      console.log(`Using fallback pages array for book ${bookText._id}`);
      const sortedPages = bookText.pages.sort((a, b) => a.pageNumber - b.pageNumber);
      totalPages = sortedPages.length;
      paginatedPages = offset >= totalPages ? [] : sortedPages.slice(offset, offset + limit);
    }

    const hasMore = (offset + limit) < totalPages;

    // Generate presigned URLs for paginated pages
    const pagesWithUrls = await Promise.all(
      paginatedPages.map(async (page) => {
        let imageUrl = null;
        if (page.s3Key) {
          try {
            // Generate presigned URL valid for 1 hour (3600 seconds) from sharh-app-ocr-cache bucket
            imageUrl = await s3Service.getPresignedUrl(("arabic-vision/" + page.s3Key), 3600, 'sharh-app-ocr-cache');
          } catch (urlError) {
            console.error(`Error generating presigned URL for page ${page.pageNumber}:`, urlError);
            // Continue without URL if there's an error
          }
        }
        return {
          pageNumber: page.pageNumber,
          text: page.text,
          s3Key: page.s3Key,
          imageUrl: imageUrl,
          isAIGenerated: page.isAIGenerated !== undefined ? page.isAIGenerated : true
        };
      })
    );

    res.status(200).json({
      success: true,
      book: {
        bookTextId: bookText._id,
        jobId: bookText.jobId,
        fileId: bookText.fileId._id,
        fileName: bookText.fileId.fileName,
        author: bookText.fileId.author,
        fileType: bookText.fileId.fileType,
        fileSize: bookText.fileId.fileSize,
        s3Key: bookText.fileId.s3Key,
        userId: bookText.userId._id,
        username: bookText.userId.username,
        userEmail: bookText.userId.email,
        extractedText: shouldIncludeText ? fullText : undefined,
        language: bookText.language,
        tags: bookText.tags,
        categories: bookText.categories,
        pageCount: bookText.pageCount,
        totalPages: totalPages,
        pageLimit: limit,
        pageOffset: offset,
        hasMore: hasMore,
        pages: pagesWithUrls,
        status: bookText.status,
        error: bookText.error,
        processingTime: bookText.processingTime,
        metadata: bookText.metadata,
        createdAt: bookText.createdAt,
        updatedAt: bookText.updatedAt,
        completedAt: bookText.completedAt,
        visibility: bookText.visibility
      }
    });

  } catch (err) {
    console.error('Error retrieving book:', err);
    res.status(500).json({
      message: 'Error retrieving book',
      error: err.message
    });
  }
});

// Route to update a book's details (admins and owners only)
router.patch('/books/:bookTextId', authenticateToken(['member', 'admin']), async (req, res) => {
  try {
    const { bookTextId } = req.params;
    const {
      fileName,
      author,
      language,
      extractedText,
      pages,
      visibility,
      tags,
      categories
    } = req.body;

    const bookText = await BookText.findById(bookTextId)
      .populate('fileId', 'fileName author visibility');

    if (!bookText) {
      return res.status(404).json({ message: 'Book not found' });
    }

    // Check authorization - only owner, admin, or editor can update
    const isOwner = bookText.userId.toString() === req.user.id;
    const isAdmin = req.user.roles.includes('admin') || req.user.roles.includes('editor');

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Unauthorized to update this book' });
    }

    // Update File fields (fileName, author)
    if (bookText.fileId) {
      const fileUpdates = {};
      if (fileName !== undefined) fileUpdates.fileName = fileName;
      if (author !== undefined) fileUpdates.author = author;

      if (Object.keys(fileUpdates).length > 0) {
        await File.findByIdAndUpdate(bookText.fileId._id, fileUpdates);
      }
    }

    // Update BookText fields
    if (language !== undefined) bookText.language = language;
    if (extractedText !== undefined) bookText.extractedText = extractedText;
    if (visibility !== undefined && ['public', 'private'].includes(visibility)) {
      bookText.visibility = visibility;
    }

    // Update tags and categories
    if (tags !== undefined) {
      bookText.tags = Array.isArray(tags)
        ? tags
        : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : []);
    }
    if (categories !== undefined) {
      bookText.categories = Array.isArray(categories)
        ? categories
        : (typeof categories === 'string' ? categories.split(',').map(c => c.trim()).filter(Boolean) : []);
    }

    // Update pages in BookTextPage collection
    if (pages !== undefined) {
      if (Array.isArray(pages)) {
        // Replace entire pages array - use bulk operations
        const pageOperations = pages.map(page => ({
          updateOne: {
            filter: {
              bookTextId: bookText._id,
              pageNumber: page.pageNumber
            },
            update: {
              $set: {
                bookTextId: bookText._id,
                jobId: bookText.jobId,
                pageNumber: page.pageNumber,
                text: page.text || '',
                s3Key: page.s3Key || null,
                isAIGenerated: page.isAIGenerated !== undefined ? page.isAIGenerated : true,
                updatedAt: new Date()
              }
            },
            upsert: true
          }
        }));

        if (pageOperations.length > 0) {
          await BookTextPage.bulkWrite(pageOperations);
        }
      } else if (typeof pages === 'object') {
        // Update specific pages by pageNumber
        const updatePromises = Object.keys(pages).map(async (pageNumber) => {
          const pageNum = parseInt(pageNumber);
          const pageUpdate = pages[pageNumber];

          const updateFields = {
            bookTextId: bookText._id,
            jobId: bookText.jobId,
            pageNumber: pageNum,
            updatedAt: new Date()
          };

          if (pageUpdate.text !== undefined) updateFields.text = pageUpdate.text;
          if (pageUpdate.s3Key !== undefined) updateFields.s3Key = pageUpdate.s3Key;
          if (pageUpdate.isAIGenerated !== undefined) updateFields.isAIGenerated = pageUpdate.isAIGenerated;

          return BookTextPage.findOneAndUpdate(
            { bookTextId: bookText._id, pageNumber: pageNum },
            { $set: updateFields },
            { upsert: true, new: true }
          );
        });

        await Promise.all(updatePromises);
      }
    }

    await bookText.save();

    // Fetch updated book with populated fields
    const updatedBook = await BookText.findById(bookTextId)
      .populate('fileId', 'fileName author fileType fileSize s3Key')
      .populate('userId', 'username email');

    res.status(200).json({
      success: true,
      message: 'Book updated successfully',
      book: {
        bookTextId: updatedBook._id,
        jobId: updatedBook.jobId,
        fileId: updatedBook.fileId._id,
        fileName: updatedBook.fileId.fileName,
        author: updatedBook.fileId.author,
        visibility: updatedBook.visibility,
        language: updatedBook.language,
        tags: updatedBook.tags,
        categories: updatedBook.categories,
        pageCount: updatedBook.pageCount,
        status: updatedBook.status,
        createdAt: updatedBook.createdAt,
        updatedAt: updatedBook.updatedAt
      }
    });

  } catch (err) {
    console.error('Error updating book:', err);
    res.status(500).json({
      message: 'Error updating book',
      error: err.message
    });
  }
});

// Route to get all books with pagination (admins see all, members see their own, public users see public books)
router.get('/books', optionalAuthenticateToken(), async (req, res) => {
  try {
    const { status, language, limit = 20, offset = 0 } = req.query;

    // Build filter based on user role
    const filter = {};

    if (req.user) {
      // Authenticated user
      if (req.user.roles.includes('admin') || req.user.roles.includes('editor')) {
        // Admins and editors see all books
      } else {
        // Members see their own books
        filter.userId = req.user.id;
      }
    } else {
      // Unauthenticated users see only public books
      filter.visibility = 'public';
    }

    // Optional filters
    if (status) {
      filter.status = status;
    }
    if (language) {
      filter.language = language;
    }

    const books = await BookText.find(filter)
      .populate('fileId', 'fileName author fileType fileSize s3Key')
      .populate('userId', 'username email')
      .select('-extractedText -pages') // Exclude full text and pages
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    const total = await BookText.countDocuments(filter);

    res.status(200).json({
      success: true,
      total: total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      books: books.map(book => ({
        bookTextId: book._id,
        jobId: book.jobId,
        fileId: book.fileId?._id,
        fileName: book.fileId?.fileName,
        author: book.fileId?.author,
        fileType: book.fileId?.fileType,
        fileSize: book.fileId?.fileSize,
        userId: book.userId?._id,
        username: book.userId?.username,
        userEmail: book.userId?.email,
        status: book.status,
        language: book.language,
        tags: book.tags,
        categories: book.categories,
        pageCount: book.pageCount,
        error: book.error,
        processingTime: book.processingTime,
        metadata: book.metadata,
        visibility: book.visibility,
        hasFullText: book.metadata?.textS3Key ? true : false,
        createdAt: book.createdAt,
        updatedAt: book.updatedAt,
        completedAt: book.completedAt
      }))
    });

  } catch (err) {
    console.error('Error retrieving books:', err);
    res.status(500).json({
      message: 'Error retrieving books',
      error: err.message
    });
  }
});

module.exports = router;
