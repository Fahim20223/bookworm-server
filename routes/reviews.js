const express = require('express');
const { body, validationResult } = require('express-validator');
const Review = require('../models/Review');
const Book = require('../models/Book');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// Get all reviews (Admin only)
router.get('/', adminAuth, async (req, res) => {
  try {
    const { status = 'all', page = 1, limit = 10 } = req.query;
    
    const query = {};
    if (status !== 'all') {
      query.status = status;
    }

    const reviews = await Review.find(query)
      .populate('user', 'name email photo')
      .populate('book', 'title author coverImage')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Review.countDocuments(query);

    res.json({
      reviews,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get reviews for a specific book
router.get('/book/:bookId', async (req, res) => {
  try {
    const reviews = await Review.find({ 
      book: req.params.bookId, 
      status: 'approved' 
    })
      .populate('user', 'name photo')
      .sort({ createdAt: -1 });

    res.json({ reviews });
  } catch (error) {
    console.error('Get book reviews error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create review
router.post('/', 
  auth,
  [
    body('book').isMongoId().withMessage('Valid book ID is required'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('comment').trim().isLength({ min: 10 }).withMessage('Comment must be at least 10 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { book, rating, comment } = req.body;

      // Check if book exists
      const bookExists = await Book.findById(book);
      if (!bookExists) {
        return res.status(404).json({ message: 'Book not found' });
      }

      // Check if user already reviewed this book
      const existingReview = await Review.findOne({
        user: req.user._id,
        book: book
      });

      if (existingReview) {
        return res.status(400).json({ message: 'You have already reviewed this book' });
      }

      const review = new Review({
        user: req.user._id,
        book,
        rating,
        comment
      });

      await review.save();
      await review.populate('user', 'name photo');
      await review.populate('book', 'title author');

      res.status(201).json({
        message: 'Review submitted successfully. It will be visible after admin approval.',
        review
      });
    } catch (error) {
      console.error('Create review error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Update review status (Admin only)
router.put('/:id/status', 
  adminAuth,
  [
    body('status').isIn(['approved', 'rejected']).withMessage('Status must be approved or rejected')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { status } = req.body;
      
      const review = await Review.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      )
        .populate('user', 'name photo')
        .populate('book', 'title author');

      if (!review) {
        return res.status(404).json({ message: 'Review not found' });
      }

      // Update book's average rating if approved
      if (status === 'approved') {
        await updateBookRating(review.book._id);
      }

      res.json({
        message: `Review ${status} successfully`,
        review
      });
    } catch (error) {
      console.error('Update review status error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Delete review (Admin only)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    const bookId = review.book;
    await Review.findByIdAndDelete(req.params.id);

    // Update book's average rating
    await updateBookRating(bookId);

    res.json({ message: 'Review deleted successfully' });
  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to update book's average rating
async function updateBookRating(bookId) {
  try {
    const reviews = await Review.find({ book: bookId, status: 'approved' });
    
    if (reviews.length === 0) {
      await Book.findByIdAndUpdate(bookId, {
        averageRating: 0,
        ratingsCount: 0
      });
    } else {
      const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
      const averageRating = totalRating / reviews.length;
      
      await Book.findByIdAndUpdate(bookId, {
        averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
        ratingsCount: reviews.length
      });
    }
  } catch (error) {
    console.error('Update book rating error:', error);
  }
}

module.exports = router;