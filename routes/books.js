const express = require('express');
const { body, validationResult } = require('express-validator');
const Book = require('../models/Book');
const Genre = require('../models/Genre');
const UserBook = require('../models/UserBook');
const Review = require('../models/Review');
const { auth, adminAuth } = require('../middleware/auth');
const { upload, uploadToCloudinary } = require('../config/cloudinary');

const router = express.Router();

// Get all books with filters and pagination
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 12, 
      search, 
      genre, 
      minRating, 
      maxRating, 
      sortBy = 'createdAt',
      sortOrder = 'desc' 
    } = req.query;

    const query = {};
    
    // Search functionality
    if (search) {
      query.$text = { $search: search };
    }
    
    // Genre filter
    if (genre) {
      query.genre = genre;
    }
    
    // Rating filter
    if (minRating || maxRating) {
      query.averageRating = {};
      if (minRating) query.averageRating.$gte = parseFloat(minRating);
      if (maxRating) query.averageRating.$lte = parseFloat(maxRating);
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const books = await Book.find(query)
      .populate('genre', 'name')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Book.countDocuments(query);

    res.json({
      books,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get books error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single book
router.get('/:id', async (req, res) => {
  try {
    const book = await Book.findById(req.params.id)
      .populate('genre', 'name');
    
    if (!book) {
      return res.status(404).json({ message: 'Book not found' });
    }

    // Get approved reviews for this book
    const reviews = await Review.find({ 
      book: req.params.id, 
      status: 'approved' 
    })
      .populate('user', 'name photo')
      .sort({ createdAt: -1 });

    res.json({ book, reviews });
  } catch (error) {
    console.error('Get book error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create book (Admin only)
router.post('/', 
  adminAuth,
  upload.single('coverImage'),
  [
    body('title').trim().isLength({ min: 1 }).withMessage('Title is required'),
    body('author').trim().isLength({ min: 1 }).withMessage('Author is required'),
    body('description').trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
    body('genre').isMongoId().withMessage('Valid genre ID is required'),
    body('totalPages').optional().isInt({ min: 1 }).withMessage('Total pages must be a positive number')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'Cover image is required' });
      }

      // Verify genre exists
      const genre = await Genre.findById(req.body.genre);
      if (!genre) {
        return res.status(400).json({ message: 'Invalid genre' });
      }

      // Upload image to cloudinary
      let coverImageUrl = '';
      try {
        const result = await uploadToCloudinary(req.file.buffer);
        coverImageUrl = result.secure_url;
      } catch (uploadError) {
        console.error('Image upload error:', uploadError);
        return res.status(500).json({ message: 'Failed to upload cover image' });
      }

      const bookData = {
        ...req.body,
        coverImage: coverImageUrl,
        totalPages: req.body.totalPages || 0
      };

      const book = new Book(bookData);
      await book.save();
      
      await book.populate('genre', 'name');

      res.status(201).json({
        message: 'Book created successfully',
        book
      });
    } catch (error) {
      console.error('Create book error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Update book (Admin only)
router.put('/:id', 
  adminAuth,
  upload.single('coverImage'),
  async (req, res) => {
    try {
      const book = await Book.findById(req.params.id);
      if (!book) {
        return res.status(404).json({ message: 'Book not found' });
      }

      const updateData = { ...req.body };
      
      if (req.file) {
        try {
          const result = await uploadToCloudinary(req.file.buffer);
          updateData.coverImage = result.secure_url;
        } catch (uploadError) {
          console.error('Image upload error:', uploadError);
          return res.status(500).json({ message: 'Failed to upload cover image' });
        }
      }

      // Verify genre if provided
      if (updateData.genre) {
        const genre = await Genre.findById(updateData.genre);
        if (!genre) {
          return res.status(400).json({ message: 'Invalid genre' });
        }
      }

      const updatedBook = await Book.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true }
      ).populate('genre', 'name');

      res.json({
        message: 'Book updated successfully',
        book: updatedBook
      });
    } catch (error) {
      console.error('Update book error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Delete book (Admin only)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ message: 'Book not found' });
    }

    // Delete related data
    await UserBook.deleteMany({ book: req.params.id });
    await Review.deleteMany({ book: req.params.id });
    await Book.findByIdAndDelete(req.params.id);

    res.json({ message: 'Book deleted successfully' });
  } catch (error) {
    console.error('Delete book error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add book to user shelf
router.post('/:id/shelf', auth, async (req, res) => {
  try {
    const { shelf } = req.body;
    
    if (!['wantToRead', 'currentlyReading', 'read'].includes(shelf)) {
      return res.status(400).json({ message: 'Invalid shelf type' });
    }

    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ message: 'Book not found' });
    }

    // Check if book is already on user's shelf
    let userBook = await UserBook.findOne({
      user: req.user._id,
      book: req.params.id
    });

    if (userBook) {
      // Update existing entry
      const oldShelf = userBook.shelf;
      userBook.shelf = shelf;
      
      // Update timestamps based on shelf
      if (shelf === 'currentlyReading' && !userBook.startedReading) {
        userBook.startedReading = new Date();
      } else if (shelf === 'read' && !userBook.finishedReading) {
        userBook.finishedReading = new Date();
        userBook.progress.percentage = 100;
      }
      
      await userBook.save();
      
      // Update book shelf counts
      if (oldShelf !== shelf) {
        book.shelvedCount[oldShelf] = Math.max(0, book.shelvedCount[oldShelf] - 1);
        book.shelvedCount[shelf] += 1;
        await book.save();
      }
    } else {
      // Create new entry
      userBook = new UserBook({
        user: req.user._id,
        book: req.params.id,
        shelf,
        startedReading: shelf === 'currentlyReading' ? new Date() : undefined,
        finishedReading: shelf === 'read' ? new Date() : undefined,
        progress: shelf === 'read' ? { percentage: 100 } : { percentage: 0 }
      });
      
      await userBook.save();
      
      // Update book shelf counts
      book.shelvedCount[shelf] += 1;
      await book.save();
    }

    res.json({
      message: 'Book added to shelf successfully',
      userBook
    });
  } catch (error) {
    console.error('Add to shelf error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update reading progress
router.put('/:id/progress', auth, async (req, res) => {
  try {
    const { pagesRead, percentage } = req.body;
    
    const userBook = await UserBook.findOne({
      user: req.user._id,
      book: req.params.id
    });

    if (!userBook) {
      return res.status(404).json({ message: 'Book not found in your library' });
    }

    if (pagesRead !== undefined) {
      userBook.progress.pagesRead = pagesRead;
    }
    
    if (percentage !== undefined) {
      userBook.progress.percentage = Math.min(100, Math.max(0, percentage));
      
      // Auto-move to read shelf if 100% complete
      if (percentage >= 100 && userBook.shelf !== 'read') {
        userBook.shelf = 'read';
        userBook.finishedReading = new Date();
        
        // Update book shelf counts
        const book = await Book.findById(req.params.id);
        book.shelvedCount.currentlyReading = Math.max(0, book.shelvedCount.currentlyReading - 1);
        book.shelvedCount.read += 1;
        await book.save();
      }
    }

    await userBook.save();

    res.json({
      message: 'Progress updated successfully',
      userBook
    });
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get recommendations for user
router.get('/recommendations/for-me', auth, async (req, res) => {
  try {
    const userBooks = await UserBook.find({ 
      user: req.user._id, 
      shelf: 'read' 
    }).populate('book');

    let recommendations = [];

    if (userBooks.length >= 3) {
      // Get user's favorite genres
      const genreCounts = {};
      userBooks.forEach(userBook => {
        const genreId = userBook.book.genre.toString();
        genreCounts[genreId] = (genreCounts[genreId] || 0) + 1;
      });

      const favoriteGenres = Object.keys(genreCounts)
        .sort((a, b) => genreCounts[b] - genreCounts[a])
        .slice(0, 3);

      // Get books from favorite genres that user hasn't read
      const readBookIds = userBooks.map(ub => ub.book._id);
      
      recommendations = await Book.find({
        genre: { $in: favoriteGenres },
        _id: { $nin: readBookIds },
        averageRating: { $gte: 3.5 }
      })
        .populate('genre', 'name')
        .sort({ averageRating: -1, ratingsCount: -1 })
        .limit(12);
    }

    // If not enough recommendations, add popular books
    if (recommendations.length < 12) {
      const readBookIds = userBooks.map(ub => ub.book._id);
      const additionalBooks = await Book.find({
        _id: { $nin: [...readBookIds, ...recommendations.map(r => r._id)] }
      })
        .populate('genre', 'name')
        .sort({ averageRating: -1, ratingsCount: -1 })
        .limit(12 - recommendations.length);

      recommendations = [...recommendations, ...additionalBooks];
    }

    res.json({ recommendations });
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;