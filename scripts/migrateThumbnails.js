const mongoose = require('mongoose');
const File = require('../models/File');
const s3Service = require('../scripts/accessS3');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const tmp = require('tmp-promise');
const ENVIRONMENT = process.env.ENVIRONMENT || 'development';
const DBNAME = process.env.DBNAME;
const DBADDRESS = process.env.DBADDRESS;

// MongoDB connection
mongoose.connect(`mongodb://${DBADDRESS}:27017/${DBNAME}`, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Function to generate thumbnail for a video
async function generateVideoThumbnail(videoPath, outputPath) {
  return new Promise((resolve, reject) => {
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

// Main migration function
async function migrateVideos() {
  try {
    console.log('Starting video thumbnail migration...');
    
    // Find all video files without thumbnails
    const videoFiles = await File.find({
      fileType: { $regex: /^video\// },
      thumbnailUrl: { $exists: false }
    });
    
    console.log(`Found ${videoFiles.length} videos without thumbnails`);
    
    // Process each video
    for (let i = 0; i < videoFiles.length; i++) {
      const video = videoFiles[i];
      console.log(`Processing video ${i+1}/${videoFiles.length}: ${video.fileName}`);
      
      try {
        // Download video from S3 to a temporary file
        const videoTempFile = await tmp.file({ postfix: path.extname(video.fileName) || '.mp4' });
        
        // Get video from S3
        const videoStream = s3Service.getFileStream(video.s3Key);
        const videoFileHandle = await fs.open(videoTempFile.path, 'w');
        
        // Write the stream to the temp file
        await new Promise((resolve, reject) => {
          const writeStream = videoFileHandle.createWriteStream();
          videoStream.pipe(writeStream);
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
        });
        
        await videoFileHandle.close();
        
        // Create a temporary file for the thumbnail
        const thumbnailTempFile = await tmp.file({ postfix: '.jpg' });
        
        // Generate thumbnail
        await generateVideoThumbnail(videoTempFile.path, thumbnailTempFile.path);
        
        // Upload thumbnail to S3
        const thumbnailKey = `thumbnails/${uuidv4()}-${path.basename(video.fileName, path.extname(video.fileName))}.jpg`;
        const thumbnailData = await s3Service.uploadFile(thumbnailTempFile.path, thumbnailKey);
        
        // Generate a pre-signed URL for the thumbnail
        const thumbnailUrl = await s3Service.getPresignedUrl(thumbnailKey, 31536000); // 1 year expiry
        
        // Update video record with thumbnail URL
        video.thumbnailUrl = thumbnailUrl;
        await video.save();
        
        // Clean up temp files
        await videoTempFile.cleanup();
        await thumbnailTempFile.cleanup();
        
        console.log(`✅ Successfully processed ${video.fileName}`);
      } catch (err) {
        console.error(`❌ Error processing video ${video.fileName}:`, err);
        // Continue with next video
      }
    }
    
    console.log('Video thumbnail migration completed');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    mongoose.disconnect();
  }
}

// Run the migration
migrateVideos();