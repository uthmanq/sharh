// services/audioS3Service.js
const AWS = require('aws-sdk');
const crypto = require('crypto');
const OpenAI = require('openai');
require('dotenv').config({ path: '../.env' });

// Initialize AWS S3 client
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

class AudioS3Service {
  constructor() {
    this.bucketName = 'sharh-app-audio';
    this.maxTextLength = 4000; // OpenAI TTS limit
  }

  /**
   * Generate a content hash for a line to detect changes
   * This hash includes all content that would affect audio generation
   */
  generateContentHash(line, voice = 'alloy') {
    const content = {
      arabic: line.Arabic || '',
      english: line.English || '',
      commentary: line.commentary || '',
      rootwords: line.rootwords || '',
      voice: voice
    };
    
    const contentString = JSON.stringify(content, Object.keys(content).sort());
    return crypto.createHash('sha256').update(contentString).digest('hex').substring(0, 16);
  }

  /**
   * Generate S3 key for audio files using naming convention:
   * bookId/lineId/field/voice_contentHash.mp3
   */
  generateS3Key(bookId, lineId, field, voice, contentHash) {
    return `${bookId}/${lineId}/${field}/${voice}_${contentHash}.mp3`;
  }

  /**
 * Delete a specific audio file from S3
 */
async deleteFile(s3Key) {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: s3Key,
      };
  
      await s3.deleteObject(params).promise();
      console.log(`Successfully deleted audio file: ${s3Key}`);
      return true;
    } catch (error) {
      console.error(`Error deleting audio file ${s3Key}:`, error);
      throw error;
    }
  }

  /**
   * Parse S3 key to extract metadata
   */
  parseS3Key(s3Key) {
    const parts = s3Key.split('/');
    if (parts.length !== 4) return null;
    
    const [bookId, lineId, field, filename] = parts;
    const [voice, hashWithExt] = filename.split('_');
    const contentHash = hashWithExt.replace('.mp3', '');
    
    return { bookId, lineId, field, voice, contentHash };
  }

  /**
   * Check if audio exists for a specific line field
   */
  async checkAudioExists(bookId, lineId, field, voice, contentHash) {
    try {
      const s3Key = this.generateS3Key(bookId, lineId, field, voice, contentHash);
      
      const params = {
        Bucket: this.bucketName,
        Key: s3Key,
      };

      await s3.headObject(params).promise();
      return { exists: true, s3Key };
    } catch (error) {
      if (error.code === 'NotFound') {
        return { exists: false, s3Key: null };
      }
      throw error;
    }
  }

  /**
   * Clean up old audio files for a line field when content changes
   */
  async cleanupOldAudio(bookId, lineId, field, currentContentHash) {
    try {
      const prefix = `${bookId}/${lineId}/${field}/`;
      
      const listParams = {
        Bucket: this.bucketName,
        Prefix: prefix,
      };

      const objects = await s3.listObjectsV2(listParams).promise();
      
      if (objects.Contents && objects.Contents.length > 0) {
        const deletePromises = objects.Contents
          .filter(obj => {
            const parsed = this.parseS3Key(obj.Key);
            return parsed && parsed.contentHash !== currentContentHash;
          })
          .map(obj => {
            const deleteParams = {
              Bucket: this.bucketName,
              Key: obj.Key,
            };
            return s3.deleteObject(deleteParams).promise();
          });

        await Promise.all(deletePromises);
        console.log(`Cleaned up ${deletePromises.length} old audio files for ${bookId}/${lineId}/${field}`);
      }
    } catch (error) {
      console.error('Error cleaning up old audio files:', error);
      // Don't throw - cleanup failure shouldn't prevent new audio generation
    }
  }

  /**
   * Split text into chunks for TTS processing
   */
  splitTextIntoChunks(text, maxLength = this.maxTextLength) {
    if (text.length <= maxLength) return [text];

    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const chunks = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      const potentialChunk = currentChunk + (currentChunk ? '. ' : '') + sentence.trim();
      
      if (potentialChunk.length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk.trim() + '.');
          currentChunk = sentence.trim();
        } else {
          // Single sentence too long, split by commas
          const parts = sentence.split(',');
          for (const part of parts) {
            const potentialPart = currentChunk + (currentChunk ? ', ' : '') + part.trim();
            if (potentialPart.length > maxLength) {
              if (currentChunk) {
                chunks.push(currentChunk.trim() + ',');
                currentChunk = part.trim();
              } else {
                // Even single part is too long, just add it
                chunks.push(part.trim());
              }
            } else {
              currentChunk = potentialPart;
            }
          }
        }
      } else {
        currentChunk = potentialChunk;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.filter(chunk => chunk.length > 0);
  }

  /**
   * Generate audio using OpenAI TTS
   */
  async generateAudio(text, voice = 'alloy') {
    try {
      const chunks = this.splitTextIntoChunks(text);
      const audioBuffers = [];

      for (let i = 0; i < chunks.length; i++) {
        console.log(`Generating audio for chunk ${i + 1}/${chunks.length}`);
        
        const mp3 = await openai.audio.speech.create({
          model: "tts-1",
          voice: voice,
          input: chunks[i],
          response_format: 'mp3'
        });

        const buffer = Buffer.from(await mp3.arrayBuffer());
        audioBuffers.push(buffer);

        // Rate limiting delay
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Concatenate all audio buffers
      return Buffer.concat(audioBuffers);
    } catch (error) {
      console.error('Error generating audio:', error);
      throw error;
    }
  }

  /**
   * Upload audio buffer to S3
   */
  async uploadAudioToS3(audioBuffer, s3Key) {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: s3Key,
        Body: audioBuffer,
        ContentType: 'audio/mpeg',
        CacheControl: 'max-age=31536000', // Cache for 1 year since content is hashed
      };

      const result = await s3.upload(params).promise();
      console.log('Audio uploaded successfully:', result.Location);
      return result;
    } catch (error) {
      console.error('Error uploading audio to S3:', error);
      throw error;
    }
  }

  /**
   * Get or create audio for a specific line field
   */
  async getOrCreateAudio(bookId, lineId, line, field, voice = 'alloy') {
    try {
      // Get the text content for the specified field
      let text = '';
      switch (field.toLowerCase()) {
        case 'arabic':
          text = line.Arabic || '';
          break;
        case 'english':
          text = line.English || '';
          break;
        case 'commentary':
          text = line.commentary || '';
          break;
        case 'rootwords':
          text = line.rootwords || '';
          break;
        default:
          throw new Error(`Invalid field: ${field}`);
      }

      if (!text.trim()) {
        throw new Error(`No content found for field: ${field}`);
      }

      // Generate content hash
      const contentHash = this.generateContentHash(line, voice);
      
      // Check if audio already exists
      const audioCheck = await this.checkAudioExists(bookId, lineId, field, voice, contentHash);
      
      if (audioCheck.exists) {
        console.log(`Audio already exists for ${bookId}/${lineId}/${field}`);
        return {
          s3Key: audioCheck.s3Key,
          url: await this.getPresignedUrl(audioCheck.s3Key),
          cached: true
        };
      }

      // Clean up old audio files with different content hash
      await this.cleanupOldAudio(bookId, lineId, field, contentHash);

      // Generate new audio
      console.log(`Generating new audio for ${bookId}/${lineId}/${field}`);
      const audioBuffer = await this.generateAudio(text, voice);
      
      // Upload to S3
      const s3Key = this.generateS3Key(bookId, lineId, field, voice, contentHash);
      await this.uploadAudioToS3(audioBuffer, s3Key);
      
      return {
        s3Key: s3Key,
        url: await this.getPresignedUrl(s3Key),
        cached: false
      };

    } catch (error) {
      console.error(`Error getting/creating audio for ${bookId}/${lineId}/${field}:`, error);
      throw error;
    }
  }

  /**
   * Get presigned URL for audio file
   */
  async getPresignedUrl(s3Key, expiresIn = 3600) {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: s3Key,
        Expires: expiresIn,
        ResponseContentType: 'audio/mpeg',
        ResponseContentDisposition: 'inline'
      };

      const url = await s3.getSignedUrlPromise('getObject', params);
      return url;
    } catch (error) {
      console.error('Error generating presigned URL:', error);
      throw error;
    }
  }

  /**
   * Get audio stream directly from S3
   */
  getAudioStream(s3Key) {
    const params = {
      Bucket: this.bucketName,
      Key: s3Key,
    };
    return s3.getObject(params).createReadStream();
  }

  /**
   * Delete all audio files for a specific line
   */
  async deleteLineAudio(bookId, lineId) {
    try {
      const prefix = `${bookId}/${lineId}/`;
      
      const listParams = {
        Bucket: this.bucketName,
        Prefix: prefix,
      };

      const objects = await s3.listObjectsV2(listParams).promise();
      
      if (objects.Contents && objects.Contents.length > 0) {
        const deleteParams = {
          Bucket: this.bucketName,
          Delete: {
            Objects: objects.Contents.map(obj => ({ Key: obj.Key })),
          },
        };

        await s3.deleteObjects(deleteParams).promise();
        console.log(`Deleted ${objects.Contents.length} audio files for line ${bookId}/${lineId}`);
        return objects.Contents.length;
      }
      
      return 0;
    } catch (error) {
      console.error(`Error deleting audio for line ${bookId}/${lineId}:`, error);
      throw error;
    }
  }

  /**
   * Delete all audio files for a book
   */
  async deleteBookAudio(bookId) {
    try {
      const prefix = `${bookId}/`;
      
      const listParams = {
        Bucket: this.bucketName,
        Prefix: prefix,
      };

      let deletedCount = 0;
      let continuationToken = null;

      do {
        if (continuationToken) {
          listParams.ContinuationToken = continuationToken;
        }

        const objects = await s3.listObjectsV2(listParams).promise();
        
        if (objects.Contents && objects.Contents.length > 0) {
          const deleteParams = {
            Bucket: this.bucketName,
            Delete: {
              Objects: objects.Contents.map(obj => ({ Key: obj.Key })),
            },
          };

          await s3.deleteObjects(deleteParams).promise();
          deletedCount += objects.Contents.length;
        }

        continuationToken = objects.NextContinuationToken;
      } while (continuationToken);

      console.log(`Deleted ${deletedCount} audio files for book ${bookId}`);
      return deletedCount;
    } catch (error) {
      console.error(`Error deleting audio for book ${bookId}:`, error);
      throw error;
    }
  }

  /**
   * List available audio files for a line
   */
  async listLineAudio(bookId, lineId) {
    try {
      const prefix = `${bookId}/${lineId}/`;
      
      const listParams = {
        Bucket: this.bucketName,
        Prefix: prefix,
      };

      const objects = await s3.listObjectsV2(listParams).promise();
      
      if (!objects.Contents) {
        return [];
      }

      const audioFiles = objects.Contents.map(obj => {
        const parsed = this.parseS3Key(obj.Key);
        return {
          s3Key: obj.Key,
          field: parsed?.field,
          voice: parsed?.voice,
          contentHash: parsed?.contentHash,
          size: obj.Size,
          lastModified: obj.LastModified,
          url: null // Will be generated on demand
        };
      }).filter(file => file.field); // Filter out invalid keys

      return audioFiles;
    } catch (error) {
      console.error(`Error listing audio for line ${bookId}/${lineId}:`, error);
      throw error;
    }
  }
}

module.exports = AudioS3Service;