const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const FileSchema = new Schema({
  fileName: {
    type: String,
    required: true, // Name of the file, required
  },
  s3Key: {
    type: String,
    required: true, // S3 key for locating the file in the bucket, required
  },
  author: {
    type: String, // Optional: Author or uploader of the file
  },
  s3Bucket: {
    type: String, // Optional: Name of the S3 bucket (can be useful if you're using multiple buckets)
  },
  uploadDate: {
    type: Date, // Optional: Date the file was uploaded
    default: Date.now, // Default to the current date if not provided
  },
  fileSize: {
    type: Number, // Optional: Size of the file in bytes
  },
  fileType: {
    type: String, // Optional: MIME type of the file (e.g., 'application/pdf', 'image/jpeg')
  },
  description: {
    type: String, // Optional: MIME type of the file (e.g., 'application/pdf', 'image/jpeg')
  },
  tags: {
    type: [String], // Optional: Array of strings for tags
    default: [], // Default to an empty array if not provided
  },
  categories: {
    type: [String], // Optional: Array of strings for categories
    default: [], // Default to an empty array if not provided
  },
  visibility: {
    type: String,
    enum: ['public', 'private'],
    default: 'private',
    required: true
  },
  createdDate: {
    type: Date, // Date when the file document was created
    default: Date.now // Set to current date by default
  },
  updatedDate: {
    type: Date // Date when the file document was last updated
  },
  thumbnailUrl: {
    type: String, // URL to the generated thumbnail in S3
  },
  thumbnailKey: {
    type: String,
    default: null
}
});

// Create a text index on fileName, author, tags, and categories
FileSchema.index({ fileName: 'text', author: 'text', tags: 'text', categories: 'text' });

// Pre-save middleware to set updatedDate when a document is updated
FileSchema.pre('save', function (next) {
  if (this.isNew) {
    this.createdDate = Date.now(); // Set createdDate only if the document is new
  }
  this.updatedDate = Date.now(); // Always update the updatedDate when saving
  next();
});

module.exports = mongoose.model('File', FileSchema);
