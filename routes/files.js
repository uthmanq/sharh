const express = require('express');
const router = express.Router();
const s3Service = require('../scripts/accessS3');
const File = require('../models/File');
const multer = require('multer');
const authenticateToken = require('../middleware/authenticate')
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.SECRET_KEY;
const User = require('../models/User');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const path = require('path');
const tmp = require('tmp-promise');

// Set up multer to store files temporarily on the server
const upload = multer({ dest: '../uploads/' }); // Files will be temporarily stored in 'uploads/' folder

const videoUpload = multer({
    dest: '../uploads/',
    fileFilter: (req, file, cb) => {
        // List of allowed video MIME types
        const allowedVideoTypes = [
            'video/mp4', 
            'video/quicktime', 
            'video/x-msvideo', 
            'video/x-ms-wmv', 
            'video/webm'
        ];

        if (allowedVideoTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid video file type. Only MP4, MOV, AVI, WMV, and WebM are allowed.'), false);
        }
    },
    limits: {
        fileSize: 1024 * 1024 * 500 // 500MB file size limit
    }
});

async function generateVideoThumbnail(videoPath, outputPath) {
    return new Promise((resolve, reject) => {
      // Use ffmpeg to extract a frame at 2 seconds (or adjust as needed)
      const ffmpeg = spawn('ffmpeg', [
        '-y',                    // Add this flag to automatically overwrite existing files
        '-i', videoPath,
        '-ss', '00:00:02.000',  // Take frame at 2 seconds
        '-vframes', '1',        // Extract 1 frame
        '-vf', 'scale=320:180', // Resize to 320x180
        '-f', 'image2',         // Output format
        outputPath              // Output path
      ]);
  
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg process exited with code ${code}`));
        }
      });
  
      ffmpeg.stderr.on('data', (data) => {
        console.log(`FFmpeg: ${data}`);
      });
    });
  }

// Route to upload a file to S3 and save metadata in MongoDB
router.post('/upload', authenticateToken(['admin']), upload.single('file'), async (req, res) => {
    try {
        const file = req.file; // The uploaded file
        const author = req.body.author || 'Unknown'; // Optional author field
        const title = req.body.title || file.originalname; // User-provided title or default to original name
        const tags = req.body.tags ? req.body.tags.split(',').map(tag => tag.trim()) : []; // Extract and split tags
        const categories = req.body.categories ? req.body.categories.split(',').map(cat => cat.trim()) : ['uncategorized']; // Extract and split categories
        const visibility = req.body.visibility;
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
            tags: tags, // Add tags to the file metadata
            categories: categories, // Add categories to the file metadata
            visibility: visibility
        });

        await newFile.save();

        res.status(201).json({ message: 'File uploaded and metadata saved successfully', file: newFile });
    } catch (err) {
        console.error('Error in upload:', err);
        res.status(500).json({ message: 'Error uploading file', error: err.message });
    }
});


// Route to download the file from S3 using the File model's ID
router.get('/download/:id', authenticateToken(['member', 'admin']), async (req, res) => {
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
        //res.setHeader('Content-Disposition', `attachment; filename="${fileRecord.fileName}"`);

        // Pipe the S3 file stream to the response
        fileStream.pipe(res);
    } catch (err) {
        console.error('Error retrieving file:', err);
        res.status(500).json({ message: 'Error retrieving file', error: err.message });
    }
});

// Route to generate a pre-signed URL for viewing the file
router.get('/view/:id', authenticateToken(['member', 'admin']), async (req, res) => {
    try {
        const fileId = req.params.id;

        // Fetch the file metadata from MongoDB by ID
        const fileRecord = await File.findById(fileId);

        if (!fileRecord) {
            return res.status(404).json({ message: 'File not found' });
        }

        const s3Key = fileRecord.s3Key;

        // Generate a pre-signed URL for viewing
        const presignedUrl = await s3Service.getPresignedUrl(s3Key, 300); // URL valid for 5 minutes

        res.json({ url: presignedUrl });
    } catch (err) {
        console.error('Error generating pre-signed URL:', err);
        res.status(500).json({ message: 'Error generating view link', error: err.message });
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
router.get('/:id/metadata', authenticateToken(['member', 'admin']), async (req, res) => {
    try {
        const fileId = req.params.id;

        // Fetch the file metadata from MongoDB by ID
        const fileRecord = await File.findById(fileId);

        if (!fileRecord) {
            return res.status(404).json({ message: 'File not found' });
        }

        // Send file metadata (including the filename, tags, and categories)
        res.status(200).json({
            fileName: fileRecord.fileName,
            fileType: fileRecord.fileType,
            author: fileRecord.author,
            uploadDate: fileRecord.uploadDate,
            tags: fileRecord.tags, // Include tags in response
            categories: fileRecord.categories // Include categories in response
        });
    } catch (err) {
        console.error('Error retrieving file metadata:', err);
        res.status(500).json({ message: 'Error retrieving file metadata', error: err.message });
    }
});

// Route to update file attributes (fileName, author, tags, categories) by file ID
router.put('/:id', authenticateToken(['admin']), async (req, res) => {
    try {
        const fileId = req.params.id;

        // Find the file by ID
        const fileRecord = await File.findById(fileId);

        if (!fileRecord) {
            return res.status(404).json({ message: 'File not found' });
        }

        // Update file attributes if provided in the request body
        if (req.body.fileName) fileRecord.fileName = req.body.fileName;
        if (req.body.author) fileRecord.author = req.body.author;
        if (req.body.tags) fileRecord.tags = req.body.tags.split(',').map(tag => tag.trim());
        if (req.body.categories) fileRecord.categories = req.body.categories.split(',').map(cat => cat.trim());

        // Save the updated record to the database
        await fileRecord.save();

        // Send back the updated file record
        res.status(200).json({ message: 'File attributes updated successfully', file: fileRecord });
    } catch (err) {
        console.error('Error updating file attributes:', err);
        res.status(500).json({ message: 'Error updating file attributes', error: err.message });
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
router.get('/', async (req, res) => {
    try {
        let filter = {};

        // Add query parameter filters
        if (req.query.fileName) filter.fileName = { $regex: req.query.fileName, $options: 'i' };
        if (req.query.author) filter.author = { $regex: req.query.author, $options: 'i' };
        if (req.query.uploadDate) filter.uploadDate = new Date(req.query.uploadDate);
        if (req.query.fileSize) filter.fileSize = req.query.fileSize;
        if (req.query.fileType) filter.fileType = { $regex: req.query.fileType, $options: 'i' };
        if (req.query.tags) {
            const tagList = req.query.tags.split(',').map(tag => new RegExp(tag.trim(), 'i'));
            filter.tags = { $in: tagList };
        }
        if (req.query.categories) {
            const categoryList = req.query.categories.split(',').map(category => new RegExp(category.trim(), 'i'));
            filter.categories = { $in: categoryList };
        }

        // Get token and check user role
        const token = req.header('Authorization')?.split(' ')[1];
        if (token) {
            try {
                const user = jwt.verify(token, SECRET_KEY);
                const foundUser = await User.findById(user.id);
                if (foundUser?.roles.includes('admin')) {
                    // Admin sees all files
                } else {
                    // Member sees only public files
                    filter.visibility = 'public';
                }
            } catch (err) {
                // Invalid token - treat as public user
                filter.visibility = 'public';
            }
        } else {
            // No token - public user sees only public files
            filter.visibility = 'public';
        }

        let projection = { s3Key: 0, s3Bucket: 0 };
        let sortOption = {};

        if (req.query.searchTerm) {
            filter.$text = { $search: req.query.searchTerm };
            projection.score = { $meta: 'textScore' };
            sortOption.score = { $meta: 'textScore' };
        }

        const files = await File.find(filter)
            .select(projection)
            .sort(sortOption);

        res.status(200).json({ files });
    } catch (err) {
        console.error('Error retrieving files:', err);
        res.status(500).json({ message: 'Error retrieving files', error: err.message });
    }
});

// Route to upload a video to S3 and save metadata in MongoDB
// Modified video upload route with improved thumbnail handling
router.post('/videos/upload', authenticateToken(['admin']), videoUpload.single('video'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ message: 'No video uploaded' });
        }

        const { 
            fileName = file.originalname, 
            description = '', 
            author = 'Unknown', 
            tags = '', 
            categories = '',
            visibility = 'private'
        } = req.body;

        // Generate unique keys for S3
        const videoKey = `videos/${uuidv4()}-${file.originalname}`;
        const thumbnailKey = `thumbnails/${uuidv4()}-${path.basename(file.originalname, path.extname(file.originalname))}.jpg`;
        
        // Upload video to S3
        const s3Data = await s3Service.uploadFile(file.path, videoKey);
        
        // Create a temporary file for the thumbnail
        const tmpFile = await tmp.file({ postfix: '.jpg' });
        
        try {
            // Generate thumbnail
            await generateVideoThumbnail(file.path, tmpFile.path);
            
            // Upload thumbnail to S3
            await s3Service.uploadFile(tmpFile.path, thumbnailKey);
            
            // Log successful thumbnail upload
            console.log(`Successfully uploaded thumbnail to ${thumbnailKey}`);
        } catch (thumbnailError) {
            console.error('Error generating or uploading thumbnail:', thumbnailError);
            // Continue with video processing even if thumbnail fails
        }
        
        // Clean up temporary files
        await fs.unlink(file.path);
        await tmpFile.cleanup();

        // Save video metadata in MongoDB - store just the thumbnail key
        const newVideo = new File({
            fileName: fileName,
            s3Key: s3Data.Key,
            author: author,
            s3Bucket: s3Data.Bucket,
            fileSize: file.size,
            fileType: file.mimetype,
            description: description,
            tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
            categories: categories ? categories.split(',').map(cat => cat.trim()) : [],
            visibility: visibility,
            thumbnailKey: thumbnailKey // Store the key instead of URL
        });

        await newVideo.save();

        // Generate a fresh presigned URL for the response
        const thumbnailUrl = await s3Service.getPresignedUrl(thumbnailKey, 3600); // 1 hour expiry for response

        res.status(201).json({ 
            message: 'Video uploaded successfully', 
            video: {
                id: newVideo._id,
                fileName: newVideo.fileName,
                author: newVideo.author,
                description: newVideo.description,
                thumbnailUrl: thumbnailUrl
            }
        });
    } catch (err) {
        console.error('Error uploading video:', err);
        res.status(500).json({ message: 'Error uploading video', error: err.message });
    }
});
// Route to get list of videos with filtering and pagination
router.get('/videos', authenticateToken(['member', 'admin']), async (req, res) => {
    try {
        let filter = {};

        // Filtering options for videos
        if (req.query.fileName) filter.fileName = { $regex: req.query.fileName, $options: 'i' };
        if (req.query.author) filter.author = { $regex: req.query.author, $options: 'i' };
        if (req.query.tags) {
            const tagList = req.query.tags.split(',').map(tag => new RegExp(tag.trim(), 'i'));
            filter.tags = { $in: tagList };
        }
        if (req.query.categories) {
            const categoryList = req.query.categories.split(',').map(category => new RegExp(category.trim(), 'i'));
            filter.categories = { $in: categoryList };
        }

        // Pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Check user authorization
        const token = req.header('Authorization')?.split(' ')[1];
        if (token) {
            try {
                const user = jwt.verify(token, SECRET_KEY);
                const foundUser = await User.findById(user.id);
                if (!foundUser?.roles.includes('admin')) {
                    // Non-admin users only see public videos
                    filter.visibility = 'public';
                }
            } catch (err) {
                // Invalid token - show only public videos
                filter.visibility = 'public';
            }
        } else {
            // No token - show only public videos
            filter.visibility = 'public';
        }

        // Projection to exclude sensitive information
        const projection = { 
            s3Key: 0, 
            s3Bucket: 0 
        };

        // Fetch videos with pagination
        const videos = await File.find(filter)
            .select(projection)
            .skip(skip)
            .limit(limit)
            .sort({ uploadDate: -1 });

        // Get total count for pagination
        const totalVideos = await File.countDocuments(filter);

        res.status(200).json({ 
            videos, 
            currentPage: page, 
            totalPages: Math.ceil(totalVideos / limit),
            totalVideos 
        });
    } catch (err) {
        console.error('Error retrieving videos:', err);
        res.status(500).json({ message: 'Error retrieving videos', error: err.message });
    }
});

// Route to get video details
// Route to get video details - modified to generate fresh thumbnail URL
router.get('/videos/:id', authenticateToken(['member', 'admin']), async (req, res) => {
    try {
        const videoId = req.params.id;

        // Fetch the video metadata from MongoDB
        const videoRecord = await File.findById(videoId);

        if (!videoRecord) {
            return res.status(404).json({ message: 'Video not found' });
        }

        // Generate pre-signed URLs
        const videoUrl = await s3Service.getPresignedUrl(videoRecord.s3Key, 3600); // 1 hour for video
        
        // Generate thumbnail URL if we have a thumbnail key
        let thumbnailUrl = null;
        if (videoRecord.thumbnailKey) {
            thumbnailUrl = await s3Service.getPresignedUrl(videoRecord.thumbnailKey, 3600);
        }

        // Check visibility and user authorization
        const token = req.header('Authorization')?.split(' ')[1];
        let isAuthorized = false;

        if (token) {
            try {
                const user = jwt.verify(token, SECRET_KEY);
                const foundUser = await User.findById(user.id);
                
                // Admin can always view
                if (foundUser?.roles.includes('admin')) {
                    isAuthorized = true;
                } 
                // Public or member can view public videos
                else if (videoRecord.visibility === 'public') {
                    isAuthorized = true;
                }
            } catch (err) {
                // Invalid token - only allow public videos
                isAuthorized = videoRecord.visibility === 'public';
            }
        } else {
            // No token - only allow public videos
            isAuthorized = videoRecord.visibility === 'public';
        }

        if (!isAuthorized) {
            return res.status(403).json({ message: 'Unauthorized to view this video' });
        }

        res.status(200).json({
            id: videoRecord._id,
            fileName: videoRecord.fileName,
            description: videoRecord.description,
            author: videoRecord.author,
            uploadDate: videoRecord.uploadDate,
            createdDate: videoRecord.createdDate,
            updatedDate: videoRecord.updatedDate,
            fileType: videoRecord.fileType,
            fileSize: videoRecord.fileSize,
            tags: videoRecord.tags,
            categories: videoRecord.categories,
            visibility: videoRecord.visibility,
            viewUrl: videoUrl,
            thumbnailUrl: thumbnailUrl
        });
    } catch (err) {
        console.error('Error retrieving video details:', err);
        res.status(500).json({ message: 'Error retrieving video details', error: err.message });
    }
});

// Route to update video details
router.put('/videos/:id', authenticateToken(['admin']), async (req, res) => {
    try {
        const videoId = req.params.id;

        // Find the video by ID
        const videoRecord = await File.findById(videoId);

        if (!videoRecord) {
            return res.status(404).json({ message: 'Video not found' });
        }

        // Fields that can be updated
        const updateFields = [
            'fileName', 
            'description', 
            'author', 
            'tags', 
            'categories', 
            'visibility'
        ];

        // Update fields from request body
        updateFields.forEach(field => {
            if (req.body[field] !== undefined) {
                // Special handling for tags and categories
                if (field === 'tags' || field === 'categories') {
                    videoRecord[field] = typeof req.body[field] === 'string' 
                        ? req.body[field].split(',').map(item => item.trim())
                        : req.body[field];
                } else {
                    videoRecord[field] = req.body[field];
                }
            }
        });

        // Save the updated record
        await videoRecord.save();

        res.status(200).json({ 
            message: 'Video details updated successfully', 
            video: {
                id: videoRecord._id,
                fileName: videoRecord.fileName,
                description: videoRecord.description
            }
        });
    } catch (err) {
        console.error('Error updating video details:', err);
        res.status(500).json({ message: 'Error updating video details', error: err.message });
    }
});

// Update to the video delete endpoint to also delete the thumbnail
// Updated video delete route for better thumbnail handling
router.delete('/videos/:id', authenticateToken(['admin']), async (req, res) => {
    try {
        const videoId = req.params.id;

        // Fetch the video metadata from MongoDB
        const videoRecord = await File.findById(videoId);

        if (!videoRecord) {
            return res.status(404).json({ message: 'Video not found' });
        }

        // Delete the video from S3
        await s3Service.deleteFile(videoRecord.s3Key);
        
        // Delete the thumbnail from S3 if it exists
        if (videoRecord.thumbnailKey) {
            try {
                await s3Service.deleteFile(videoRecord.thumbnailKey);
                console.log(`Deleted thumbnail: ${videoRecord.thumbnailKey}`);
            } catch (err) {
                console.error('Error deleting thumbnail:', err);
                // Continue with video deletion even if thumbnail deletion fails
            }
        }

        // Delete the video metadata from MongoDB
        await File.findByIdAndDelete(videoId);

        res.status(200).json({ 
            message: 'Video deleted successfully', 
            videoId: videoId 
        });
    } catch (err) {
        console.error('Error deleting video:', err);
        res.status(500).json({ message: 'Error deleting video', error: err.message });
    }
});




module.exports = router;
