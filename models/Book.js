const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  author: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  genre: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Genre',
    required: true
  },
  coverImage: {
    type: String,
    required: true
  },
  totalPages: {
    type: Number,
    default: 0
  },
  publishedYear: {
    type: Number
  },
  isbn: {
    type: String,
    unique: true,
    sparse: true
  },
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  ratingsCount: {
    type: Number,
    default: 0
  },
  shelvedCount: {
    wantToRead: { type: Number, default: 0 },
    currentlyReading: { type: Number, default: 0 },
    read: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Index for search functionality
bookSchema.index({ title: 'text', author: 'text', description: 'text' });

module.exports = mongoose.model('Book', bookSchema);