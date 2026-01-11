const mongoose = require('mongoose');

const tutorialSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  youtubeUrl: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(v);
      },
      message: 'Please provide a valid YouTube URL'
    }
  },
  thumbnail: {
    type: String
  },
  category: {
    type: String,
    enum: ['review', 'recommendation', 'reading-tips', 'author-interview', 'other'],
    default: 'other'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Tutorial', tutorialSchema);