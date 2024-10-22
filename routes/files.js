const express = require('express');
const router = express.Router();
const s3Service = require('../scripts/accessS3'); // Your S3 service file
const File = require('../models/File'); // The Mongoose File model
const multer = require('multer'); // Import multer for file uploads
const authenticateToken = require('../middleware/authenticate')
const { v4: uuidv4 } = require('uuid'); // Use UUID for unique key generation

// Set up multer to store files temporarily on the server
const upload = multer({ dest: '../uploads/' }); // Files will be temporarily stored in 'uploads/' folder

// Route to upload a file to S3 and save metadata in MongoDB
router.post('/upload', authenticateToken(['admin']), upload.single('file'), async (req, res) => {
    try {
      const file = req.file; // The uploaded file
      const author = req.body.author || 'Unknown'; // Optional author field
      const title = req.body.title || file.originalname; // User-provided title or default to original name

      if (!file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
   // Generate a unique key for S3 by appending a timestamp or UUID
   const uniqueKey = `uploads/${uuidv4()}-${file.originalname}`; // Generates a unique key using UUID

      // Upload file to S3
      const s3Key = `uploads/${file.originalname}`; // The key (file name + path in S3)
      const s3Data = await s3Service.uploadFile(file.path, uniqueKey); // File uploaded from temporary path
  
      // Save file metadata in MongoDB
      const newFile = new File({
        fileName: title, 
        s3Key: s3Data.Key,
        author: author,
        s3Bucket: s3Data.Bucket,
        fileSize: file.size, // File size from multer
        fileType: file.mimetype, // MIME type from multer
      });
  
      await newFile.save();
  
      res.status(201).json({ message: 'File uploaded and metadata saved successfully', file: newFile });
    } catch (err) {
      console.error('Error in upload:', err);
      res.status(500).json({ message: 'Error uploading file', error: err.message });
    }
  });

// Route to download a file from S3 using the File model's ID
// Route to download the file from S3 using the File model's ID
router.get('/download/:id', authenticateToken(['admin']), async (req, res) => {
  try {
      const fileId = req.params.id;

      // Fetch the file metadata from MongoDB by ID
      const fileRecord = await File.findById(fileId);

      if (!fileRecord) {
          return res.status(404).json({ message: 'File not found' });
      }

      const s3Key = fileRecord.s3Key;

      // Retrieve the file stream from S3
      const fileStream = s3Service.getFileStream(s3Key);

      // Set the Content-Type header based on the file type
      res.setHeader('Content-Type', fileRecord.fileType || 'application/octet-stream');

      // Ensure the file is downloaded by setting Content-Disposition header
      res.setHeader('Content-Disposition', `attachment; filename="${fileRecord.fileName}"`);

      // Pipe the S3 file stream to the response
      fileStream.pipe(res);
  } catch (err) {
      console.error('Error retrieving file:', err);
      res.status(500).json({ message: 'Error retrieving file', error: err.message });
  }
});

// Route to delete a file by ID (from both S3 and MongoDB)
router.delete('/:id', authenticateToken(['admin']), async (req, res) => {
  try {
      const fileId = req.params.id;

      // Fetch the file metadata from MongoDB by ID
      const fileRecord = await File.findById(fileId);

      if (!fileRecord) {
          return res.status(404).json({ message: 'File not found' });
      }

      const s3Key = fileRecord.s3Key;

      // Delete the file from S3
      await s3Service.deleteFile(s3Key);

      // Delete the file metadata from MongoDB
      await File.findByIdAndDelete(fileId);

      res.status(200).json({ message: 'File deleted successfully' });
  } catch (err) {
      console.error('Error deleting file:', err);
      res.status(500).json({ message: 'Error deleting file', error: err.message });
  }
});


  // Route to get file metadata by file ID
router.get('/:id/metadata', authenticateToken(['admin']), async (req, res) => {
  try {
      const fileId = req.params.id;

      // Fetch the file metadata from MongoDB by ID
      const fileRecord = await File.findById(fileId);

      if (!fileRecord) {
          return res.status(404).json({ message: 'File not found' });
      }

      // Send file metadata (including the filename)
      res.status(200).json({
          fileName: fileRecord.fileName,
          fileType: fileRecord.fileType,
          author: fileRecord.author,
          uploadDate: fileRecord.uploadDate
      });
  } catch (err) {
      console.error('Error retrieving file metadata:', err);
      res.status(500).json({ message: 'Error retrieving file metadata', error: err.message });
  }
});

  

// Route to generate a presigned URL for accessing a file
// router.get('/presigned-url', async (req, res) => {
//   try {
//     const s3Key = req.query.s3Key; // File key in S3
//     const expiresIn = req.query.expiresIn || 60; // Expiration time for the presigned URL (in seconds)

//     const presignedUrl = await s3Service.generatePresignedUrl(s3Key, expiresIn);
//     res.status(200).json({ url: presignedUrl });
//   } catch (err) {
//     console.error('Error generating presigned URL:', err);
//     res.status(500).json({ message: 'Error generating presigned URL', error: err.message });
//   }
// });

// Route to list all files from the MongoDB model, excluding s3Key and s3Bucket
router.get('/',authenticateToken(['admin']), async (req, res) => {
    try {
      // Query the File model, explicitly excluding the s3Key and s3Bucket fields
      const files = await File.find().select('-s3Key -s3Bucket');
  
      // Return the filtered list of files (without s3Key and s3Bucket)
      res.status(200).json({ files });
    } catch (err) {
      console.error('Error retrieving files:', err);
      res.status(500).json({ message: 'Error retrieving files', error: err.message });
    }
  });
  

module.exports = router;
