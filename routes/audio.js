// routes/audio.js
const express = require('express');
const router = express.Router();
const AudioS3Service = require('../services/AudioS3Service');
const Book = require('../models/Book');
const authenticateToken = require('../middleware/authenticate');

const audioService = new AudioS3Service();

// Available voices for TTS
const AVAILABLE_VOICES = [
  { id: 'alloy', name: 'Alloy', description: 'Neutral, balanced voice' },
  { id: 'echo', name: 'Echo', description: 'Clear, articulate voice' },
  { id: 'fable', name: 'Fable', description: 'Warm, storytelling voice' },
  { id: 'onyx', name: 'Onyx', description: 'Deep, authoritative voice' },
  { id: 'nova', name: 'Nova', description: 'Bright, energetic voice' },
  { id: 'shimmer', name: 'Shimmer', description: 'Gentle, soothing voice' }
];

// Available fields for audio generation
const AVAILABLE_FIELDS = ['arabic', 'english', 'commentary'];

// Get available voices
router.get('/voices', (req, res) => {
  res.json({ voices: AVAILABLE_VOICES });
});

// Get available fields
router.get('/fields', (req, res) => {
  res.json({ fields: AVAILABLE_FIELDS });
});

// Generate or get audio for a specific line field
router.post('/:bookId/lines/:lineId/:field', async (req, res) => {
  try {
    const { bookId, lineId, field } = req.params;
    const { voice = 'alloy' } = req.body;

    // Validate field
    if (!AVAILABLE_FIELDS.includes(field.toLowerCase())) {
      return res.status(400).json({
        error: 'Invalid field',
        availableFields: AVAILABLE_FIELDS
      });
    }

    // Validate voice
    if (!AVAILABLE_VOICES.some(v => v.id === voice)) {
      return res.status(400).json({
        error: 'Invalid voice',
        availableVoices: AVAILABLE_VOICES.map(v => v.id)
      });
    }

    // Get the book and line
    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const line = book.lines.id(lineId);
    if (!line) {
      return res.status(404).json({ error: 'Line not found' });
    }

    // Generate or get audio
    const result = await audioService.getOrCreateAudio(bookId, lineId, line, field, voice);

    res.json({
      success: true,
      bookId,
      lineId,
      field,
      voice,
      s3Key: result.s3Key,
      audioUrl: result.url,
      cached: result.cached,
      message: result.cached ? 'Audio retrieved from cache' : 'New audio generated'
    });

  } catch (error) {
    console.error('Error generating audio:', error);
    res.status(500).json({
      error: 'Failed to generate audio',
      details: error.message
    });
  }
});

// Get audio for a specific line field (streaming)
router.get('/:bookId/lines/:lineId/:field/stream', async (req, res) => {
  try {
    const { bookId, lineId, field } = req.params;
    const { voice = 'alloy' } = req.query;

    // Get the book and line
    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const line = book.lines.id(lineId);
    if (!line) {
      return res.status(404).json({ error: 'Line not found' });
    }

    // Get or create audio
    const result = await audioService.getOrCreateAudio(bookId, lineId, line, field, voice);

    // Stream the audio file
    const audioStream = audioService.getAudioStream(result.s3Key);
    
    res.set({
      'Content-Type': 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'max-age=31536000', // Cache for 1 year
    });

    audioStream.pipe(res);
    
    audioStream.on('error', (error) => {
      console.error('Error streaming audio:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream audio' });
      }
    });

  } catch (error) {
    console.error('Error streaming audio:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream audio' });
    }
  }
});

// Get presigned URL for audio file
router.get('/:bookId/lines/:lineId/:field/url', async (req, res) => {
  try {
    const { bookId, lineId, field } = req.params;
    const { voice = 'alloy', expires = 3600 } = req.query;

    // Get the book and line
    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const line = book.lines.id(lineId);
    if (!line) {
      return res.status(404).json({ error: 'Line not found' });
    }

    // Get or create audio
    const result = await audioService.getOrCreateAudio(bookId, lineId, line, field, voice);

    // Get fresh presigned URL with custom expiration
    const url = await audioService.getPresignedUrl(result.s3Key, parseInt(expires));

    res.json({
      success: true,
      bookId,
      lineId,
      field,
      voice,
      audioUrl: url,
      expiresIn: parseInt(expires),
      cached: result.cached
    });

  } catch (error) {
    console.error('Error getting audio URL:', error);
    res.status(500).json({
      error: 'Failed to get audio URL',
      details: error.message
    });
  }
});

// List all audio files for a line
router.get('/:bookId/lines/:lineId', async (req, res) => {
  try {
    const { bookId, lineId } = req.params;

    // Verify book and line exist
    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const line = book.lines.id(lineId);
    if (!line) {
      return res.status(404).json({ error: 'Line not found' });
    }

    // List available audio files
    const audioFiles = await audioService.listLineAudio(bookId, lineId);

    // Generate presigned URLs for each file
    const filesWithUrls = await Promise.all(
      audioFiles.map(async (file) => ({
        ...file,
        url: await audioService.getPresignedUrl(file.s3Key, 3600)
      }))
    );

    res.json({
      success: true,
      bookId,
      lineId,
      audioFiles: filesWithUrls,
      lineContent: {
        arabic: line.Arabic,
        english: line.English,
        commentary: line.commentary || '',
        rootwords: line.rootwords || ''
      }
    });

  } catch (error) {
    console.error('Error listing line audio:', error);
    res.status(500).json({
      error: 'Failed to list audio files',
      details: error.message
    });
  }
});

// Generate audio for multiple fields of a line
router.post('/:bookId/lines/:lineId/batch', async (req, res) => {
  try {
    const { bookId, lineId } = req.params;
    const { fields = ['arabic', 'english'], voice = 'alloy' } = req.body;

    // Validate fields
    console.log(req.body)
    const invalidFields = fields.filter(f => !AVAILABLE_FIELDS.includes(f.toLowerCase()));
    if (invalidFields.length > 0) {
      return res.status(400).json({
        error: 'Invalid fields',
        invalidFields,
        availableFields: AVAILABLE_FIELDS
      });
    }

    // Get the book and line
    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const line = book.lines.id(lineId);
    if (!line) {
      return res.status(404).json({ error: 'Line not found' });
    }

    // Generate audio for each field
    const results = {};
    const errors = {};

    for (const field of fields) {
      try {
        const result = await audioService.getOrCreateAudio(bookId, lineId, line, field, voice);
        results[field] = {
          s3Key: result.s3Key,
          audioUrl: result.url,
          cached: result.cached
        };
      } catch (error) {
        console.error(`Error generating audio for field ${field}:`, error);
        errors[field] = error.message;
      }
    }

    res.json({
      success: true,
      bookId,
      lineId,
      voice,
      results,
      errors: Object.keys(errors).length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Error in batch audio generation:', error);
    res.status(500).json({
      error: 'Failed to generate batch audio',
      details: error.message
    });
  }
});

// Delete audio for a specific line field
router.delete('/:bookId/lines/:lineId/:field', authenticateToken(['member', 'editor', 'admin']), async (req, res) => {
  try {
    const { bookId, lineId, field } = req.params;
    const { voice } = req.query;

    // Get the book and line to verify they exist
    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const line = book.lines.id(lineId);
    if (!line) {
      return res.status(404).json({ error: 'Line not found' });
    }

    // If specific voice provided, delete only that voice
    if (voice) {
      const contentHash = audioService.generateContentHash(line, voice);
      const s3Key = audioService.generateS3Key(bookId, lineId, field, voice, contentHash);
      
      // Delete specific file
      await audioService.deleteFile(s3Key);
      
      res.json({
        success: true,
        message: `Deleted audio for ${field} with voice ${voice}`,
        deletedFiles: 1
      });
    } else {
      // Delete all audio for this field
      await audioService.cleanupOldAudio(bookId, lineId, field, 'force-delete-all');
      
      res.json({
        success: true,
        message: `Deleted all audio for ${field}`,
        deletedFiles: 'all'
      });
    }

  } catch (error) {
    console.error('Error deleting audio:', error);
    res.status(500).json({
      error: 'Failed to delete audio',
      details: error.message
    });
  }
});

// Delete all audio for a line
router.delete('/:bookId/lines/:lineId', authenticateToken(['member', 'editor', 'admin']), async (req, res) => {
  try {
    const { bookId, lineId } = req.params;

    // Verify book and line exist
    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const line = book.lines.id(lineId);
    if (!line) {
      return res.status(404).json({ error: 'Line not found' });
    }

    const deletedCount = await audioService.deleteLineAudio(bookId, lineId);

    res.json({
      success: true,
      message: `Deleted all audio for line ${lineId}`,
      deletedFiles: deletedCount
    });

  } catch (error) {
    console.error('Error deleting line audio:', error);
    res.status(500).json({
      error: 'Failed to delete line audio',
      details: error.message
    });
  }
});

// Delete all audio for a book
router.delete('/:bookId', authenticateToken(['admin']), async (req, res) => {
  try {
    const { bookId } = req.params;

    // Verify book exists
    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const deletedCount = await audioService.deleteBookAudio(bookId);

    res.json({
      success: true,
      message: `Deleted all audio for book ${bookId}`,
      deletedFiles: deletedCount
    });

  } catch (error) {
    console.error('Error deleting book audio:', error);
    res.status(500).json({
      error: 'Failed to delete book audio',
      details: error.message
    });
  }
});

// Add this route to routes/audio.js

// Get all audio files for a book with field filtering
router.get('/:bookId/all', async (req, res) => {
    try {
      const { bookId } = req.params;
      const { fields } = req.query; // comma-separated list: 'arabic', 'english', 'commentary'
  
      // Verify book exists
      const book = await Book.findById(bookId);
      if (!book) {
        return res.status(404).json({ error: 'Book not found' });
      }
  
      // Parse and validate requested fields
      let requestedFields = AVAILABLE_FIELDS; // Default to all fields
      if (fields) {
        requestedFields = fields.split(',').map(f => f.trim().toLowerCase());
        const invalidFields = requestedFields.filter(f => !AVAILABLE_FIELDS.includes(f));
        if (invalidFields.length > 0) {
          return res.status(400).json({
            error: 'Invalid fields',
            invalidFields,
            availableFields: AVAILABLE_FIELDS
          });
        }
      }
  
      // Get all audio files for the book
      const bookPrefix = `${bookId}/`;
      const listParams = {
        Bucket: audioService.bucketName,
        Prefix: bookPrefix,
      };
  
      let allAudioFiles = [];
      let continuationToken = null;
  
      // Get all objects from S3 (handling pagination)
      do {
        if (continuationToken) {
          listParams.ContinuationToken = continuationToken;
        }
  
        const s3 = new (require('aws-sdk')).S3({
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          region: process.env.AWS_REGION,
        });
  
        const objects = await s3.listObjectsV2(listParams).promise();
        
        if (objects.Contents) {
          allAudioFiles = allAudioFiles.concat(objects.Contents);
        }
  
        continuationToken = objects.NextContinuationToken;
      } while (continuationToken);
  
      // Parse and filter audio files by requested fields
      const parsedFiles = allAudioFiles
        .map(obj => {
          const parsed = audioService.parseS3Key(obj.Key);
          if (!parsed) return null;
  
          return {
            s3Key: obj.Key,
            lineId: parsed.lineId,
            field: parsed.field,
            voice: parsed.voice,
            size: obj.Size,
            lastModified: obj.LastModified
          };
        })
        .filter(file => file !== null)
        .filter(file => requestedFields.includes(file.field.toLowerCase()));
  
      // Group audio files by line and field
      const audioByLine = {};
      for (const file of parsedFiles) {
        if (!audioByLine[file.lineId]) {
          audioByLine[file.lineId] = {};
        }
        if (!audioByLine[file.lineId][file.field]) {
          audioByLine[file.lineId][file.field] = [];
        }
        audioByLine[file.lineId][file.field].push({
          s3Key: file.s3Key,
          voice: file.voice,
          size: file.size,
          lastModified: file.lastModified,
          url: await audioService.getPresignedUrl(file.s3Key, 7200) // 2-hour expiration
        });
      }
  
      // Build response with line data
      const response = {
        success: true,
        bookId,
        bookTitle: book.title,
        requestedFields,
        totalFiles: parsedFiles.length,
        lines: []
      };
  
      // Include line content and audio data, sorted by line order
      const sortedLines = book.lines
        .filter(line => audioByLine[line._id.toString()])
        .sort((a, b) => (a.lineNumber || 0) - (b.lineNumber || 0));
  
      for (const line of sortedLines) {
        const lineId = line._id.toString();
        const audioData = audioByLine[lineId];
  
        response.lines.push({
          lineId,
          lineNumber: line.lineNumber,
          content: {
            arabic: line.Arabic || '',
            english: line.English || '',
            commentary: line.commentary || '',
            rootwords: line.rootwords || ''
          },
          audio: audioData
        });
      }
  
      res.json(response);
  
    } catch (error) {
      console.error('Error getting book audio list:', error);
      res.status(500).json({
        error: 'Failed to get book audio list',
        details: error.message
      });
    }
  });
  
module.exports = router;