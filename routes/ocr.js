const express = require('express');
const router = express.Router();
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const multer = require('multer');
const authenticateToken = require('../middleware/authenticate');
const { optionalAuthenticateToken } = require('../middleware/authenticate');
const s3Service = require('../scripts/accessS3');
const File = require('../models/File');
const BookText = require('../models/BookText');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
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
router.post('/result/page', authenticateToken(['admin']), async (req, res) => {
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
        pages: [],
        metadata: { pageErrors: [] }
      });

      await bookText.save();
      console.log(`Created BookText record for orphaned job during page update: ${jobId}`);
    }

    // Prepare page data
    const pageData = {
      pageNumber: pageNumber,
      text: text || '',
      s3Key: s3Key || null
    };

    // Build update operations
    const updateOps = {
      $set: {
        updatedAt: new Date(),
        'metadata.pagesProcessed': pagesProcessed,
        'metadata.lastPageUpdate': new Date().toISOString()
      }
    };

    // Update page count if provided and not already set
    if (pageCount) {
      updateOps.$set.pageCount = pageCount;
    }

    // Update status to processing if it's pending
    updateOps.$set.status = 'processing';

    // Use atomic operation to update or add the page
    // First, try to update existing page with matching pageNumber
    const result = await BookText.updateOne(
      {
        jobId: jobId,
        'pages.pageNumber': pageNumber
      },
      {
        $set: {
          'pages.$': pageData,
          ...updateOps.$set
        }
      }
    );

    // If no page was updated (page doesn't exist), push a new page
    if (result.matchedCount === 0 || result.modifiedCount === 0) {
      await BookText.updateOne(
        { jobId: jobId },
        {
          $push: { pages: pageData },
          $set: updateOps.$set
        }
      );
    }

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
router.post('/result', authenticateToken(['admin']), async (req, res) => {
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

      // Write text to temporary file
      const tmpFile = await tmp.file({ postfix: '.txt' });
      await fs.writeFile(tmpFile.path, extractedText, 'utf8');

      // Upload to S3
      await s3Service.uploadFile(tmpFile.path, textS3Key);

      // Clean up temp file
      await tmpFile.cleanup();
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
    bookText.pages = pages || bookText.pages;
    bookText.status = status || bookText.status;
    bookText.error = error || bookText.error;
    bookText.processingTime = processingTime || bookText.processingTime;

    await bookText.save();

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
      jobMetadata
    } = req.body;

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

    // Check authorization - user can only view their own jobs unless admin
    if (bookText.userId.toString() !== req.user.id && !req.user.roles.includes('admin')) {
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
    if (bookText.userId.toString() !== req.user.id && !req.user.roles.includes('admin')) {
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

    res.status(200).json({
      success: true,
      data: {
        jobId: bookText.jobId,
        fileId: bookText.fileId._id,
        fileName: bookText.fileId.fileName,
        extractedText: fullText,
        language: bookText.language,
        pageCount: bookText.pageCount,
        pages: bookText.pages,
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

// Route to get a specific book by bookTextId including its full text
router.get('/books/:bookTextId', optionalAuthenticateToken(), async (req, res) => {
  try {
    const { bookTextId } = req.params;

    const bookText = await BookText.findById(bookTextId)
      .populate('fileId', 'fileName author fileType fileSize s3Key visibility')
      .populate('userId', 'username email');

    if (!bookText) {
      return res.status(404).json({ message: 'Book not found' });
    }

    // Check authorization based on visibility
    const isPublic = bookText.visibility === 'public';
    const isOwner = req.user && bookText.userId._id.toString() === req.user.id;
    const isAdmin = req.user && req.user.roles.includes('admin');

    if (!isPublic && !isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Unauthorized to view this book' });
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

    // Sort pages by pageNumber and generate presigned URLs for page images
    const sortedPages = (bookText.pages || []).sort((a, b) => a.pageNumber - b.pageNumber);

    const pagesWithUrls = await Promise.all(
      sortedPages.map(async (page) => {
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
        extractedText: fullText,
        language: bookText.language,
        pageCount: bookText.pageCount,
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
      visibility
    } = req.body;

    const bookText = await BookText.findById(bookTextId)
      .populate('fileId', 'fileName author visibility');

    if (!bookText) {
      return res.status(404).json({ message: 'Book not found' });
    }

    // Check authorization - only owner or admin can update
    const isOwner = bookText.userId.toString() === req.user.id;
    const isAdmin = req.user.roles.includes('admin');

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

    // Update pages - can update individual pages or entire array
    if (pages !== undefined) {
      if (Array.isArray(pages)) {
        // Replace entire pages array
        bookText.pages = pages;
      } else if (typeof pages === 'object') {
        // Update specific pages by pageNumber
        Object.keys(pages).forEach(pageNumber => {
          const pageNum = parseInt(pageNumber);
          const pageIndex = bookText.pages.findIndex(p => p.pageNumber === pageNum);

          if (pageIndex >= 0) {
            // Update existing page
            if (pages[pageNumber].text !== undefined) {
              bookText.pages[pageIndex].text = pages[pageNumber].text;
            }
            if (pages[pageNumber].s3Key !== undefined) {
              bookText.pages[pageIndex].s3Key = pages[pageNumber].s3Key;
            }
            if (pages[pageNumber].isAIGenerated !== undefined) {
              bookText.pages[pageIndex].isAIGenerated = pages[pageNumber].isAIGenerated;
            }
          } else {
            // Add new page
            bookText.pages.push({
              pageNumber: pageNum,
              text: pages[pageNumber].text || '',
              s3Key: pages[pageNumber].s3Key || null,
              isAIGenerated: pages[pageNumber].isAIGenerated !== undefined ? pages[pageNumber].isAIGenerated : true
            });
          }
        });
        // Sort pages after updates
        bookText.pages.sort((a, b) => a.pageNumber - b.pageNumber);
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
      if (req.user.roles.includes('admin')) {
        // Admins see all books
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
