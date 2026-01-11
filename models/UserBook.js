const mongoose = require('mongoose');

const userBookSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  book: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book',
    required: true
  },
  shelf: {
    type: String,
    enum: ['wantToRead', 'currentlyReading', 'read'],
    required: true
  },
  progress: {
    pagesRead: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 }
  },
  startedReading: {
    type: Date
  },
  finishedReading: {
    type: Date
  },
  personalRating: {
    type: Number,
    min: 1,
    max: 5
  }
}, {
  timestamps: true
});

// Ensure one entry per user per book
userBookSchema.index({ user: 1, book: 1 }, { unique: true });

module.exports = mongoose.model('UserBook', userBookSchema);