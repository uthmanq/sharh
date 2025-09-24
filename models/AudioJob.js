// models/AudioJob.js
const mongoose = require('mongoose');

const audioJobSchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  voice: { type: String, required: true },
  status: { type: String, enum: ['pending', 'in_progress', 'completed', 'failed'], default: 'pending' },
  progress: { type: Number, default: 0 }, // 0–100%
  error: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AudioJob', audioJobSchema);
