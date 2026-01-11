const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const UserBook = require('../models/UserBook');
const Review = require('../models/Review');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// Get all users (Admin only)
router.get('/', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments();

    res.json({
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's library
router.get('/library', auth, async (req, res) => {
  try {
    const { shelf } = req.query;
    
    const query = { user: req.user._id };
    if (shelf && ['wantToRead', 'currentlyReading', 'read'].includes(shelf)) {
      query.shelf = shelf;
    }

    const userBooks = await UserBook.find(query)
      .populate({
        path: 'book',
        populate: {
          path: 'genre',
          select: 'name'
        }
      })
      .sort({ updatedAt: -1 });

    // Group by shelf
    const library = {
      wantToRead: [],
      currentlyReading: [],
      read: []
    };

    userBooks.forEach(userBook => {
      library[userBook.shelf].push(userBook);
    });

    res.json({ library });
  } catch (error) {
    console.error('Get library error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's reading stats
router.get('/stats', auth, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    
    // Get all user books
    const userBooks = await UserBook.find({ user: req.user._id })
      .populate('book', 'totalPages genre');

    // Calculate stats
    const stats = {
      totalBooks: userBooks.length,
      booksRead: userBooks.filter(ub => ub.shelf === 'read').length,
      booksReading: userBooks.filter(ub => ub.shelf === 'currentlyReading').length,
      booksWantToRead: userBooks.filter(ub => ub.shelf === 'wantToRead').length,
      totalPages: 0,
      booksThisYear: 0,
      readingGoal: req.user.readingGoal,
      genreBreakdown: {},
      monthlyProgress: Array(12).fill(0)
    };

    // Calculate detailed stats
    userBooks.forEach(userBook => {
      if (userBook.shelf === 'read') {
        // Add pages
        if (userBook.book.totalPages) {
          stats.totalPages += userBook.book.totalPages;
        }

        // Check if read this year
        if (userBook.finishedReading && 
            userBook.finishedReading.getFullYear() === currentYear) {
          stats.booksThisYear++;
          
          // Add to monthly progress
          const month = userBook.finishedReading.getMonth();
          stats.monthlyProgress[month]++;
        }

        // Genre breakdown
        if (userBook.book.genre) {
          const genreName = userBook.book.genre.name || 'Unknown';
          stats.genreBreakdown[genreName] = (stats.genreBreakdown[genreName] || 0) + 1;
        }
      }
    });

    // Calculate reading goal progress
    stats.readingGoal.completed = stats.booksThisYear;
    stats.readingGoal.percentage = stats.readingGoal.target > 0 
      ? Math.round((stats.booksThisYear / stats.readingGoal.target) * 100)
      : 0;

    res.json({ stats });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update reading goal
router.put('/reading-goal', 
  auth,
  [
    body('target').isInt({ min: 1 }).withMessage('Target must be a positive number')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { target } = req.body;
      const currentYear = new Date().getFullYear();

      await User.findByIdAndUpdate(req.user._id, {
        'readingGoal.year': currentYear,
        'readingGoal.target': target
      });

      res.json({ message: 'Reading goal updated successfully' });
    } catch (error) {
      console.error('Update reading goal error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Update user role (Admin only)
router.put('/:id/role', 
  adminAuth,
  [
    body('role').isIn(['user', 'admin']).withMessage('Role must be user or admin')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { role } = req.body;
      
      const user = await User.findByIdAndUpdate(
        req.params.id,
        { role },
        { new: true }
      ).select('-password');

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json({
        message: 'User role updated successfully',
        user
      });
    } catch (error) {
      console.error('Update user role error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Follow/Unfollow user
router.post('/:id/follow', auth, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user._id;

    if (targetUserId === currentUserId.toString()) {
      return res.status(400).json({ message: 'You cannot follow yourself' });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentUser = await User.findById(currentUserId);
    
    const isFollowing = currentUser.following.includes(targetUserId);

    if (isFollowing) {
      // Unfollow
      currentUser.following.pull(targetUserId);
      targetUser.followers.pull(currentUserId);
    } else {
      // Follow
      currentUser.following.push(targetUserId);
      targetUser.followers.push(currentUserId);
    }

    await currentUser.save();
    await targetUser.save();

    res.json({
      message: isFollowing ? 'User unfollowed successfully' : 'User followed successfully',
      isFollowing: !isFollowing
    });
  } catch (error) {
    console.error('Follow/Unfollow error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get activity feed
router.get('/activity-feed', auth, async (req, res) => {
  try {
    const following = req.user.following;
    
    if (following.length === 0) {
      return res.json({ activities: [] });
    }

    // Get recent activities from followed users
    const recentUserBooks = await UserBook.find({
      user: { $in: following },
      updatedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
    })
      .populate('user', 'name photo')
      .populate('book', 'title author coverImage')
      .sort({ updatedAt: -1 })
      .limit(20);

    const recentReviews = await Review.find({
      user: { $in: following },
      status: 'approved',
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    })
      .populate('user', 'name photo')
      .populate('book', 'title author coverImage')
      .sort({ createdAt: -1 })
      .limit(20);

    // Format activities
    const activities = [];

    recentUserBooks.forEach(userBook => {
      activities.push({
        type: 'shelf_update',
        user: userBook.user,
        book: userBook.book,
        shelf: userBook.shelf,
        timestamp: userBook.updatedAt
      });
    });

    recentReviews.forEach(review => {
      activities.push({
        type: 'review',
        user: review.user,
        book: review.book,
        rating: review.rating,
        timestamp: review.createdAt
      });
    });

    // Sort by timestamp
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({ activities: activities.slice(0, 20) });
  } catch (error) {
    console.error('Get activity feed error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;