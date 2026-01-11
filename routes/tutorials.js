const express = require('express');
const { body, validationResult } = require('express-validator');
const Tutorial = require('../models/Tutorial');
const { auth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// Get all tutorials
router.get('/', auth, async (req, res) => {
  try {
    const { category, page = 1, limit = 12 } = req.query;
    
    const query = { isActive: true };
    if (category && category !== 'all') {
      query.category = category;
    }

    const tutorials = await Tutorial.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Tutorial.countDocuments(query);

    res.json({
      tutorials,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get tutorials error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all tutorials for admin
router.get('/admin', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const tutorials = await Tutorial.find()
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Tutorial.countDocuments();

    res.json({
      tutorials,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get admin tutorials error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single tutorial
router.get('/:id', auth, async (req, res) => {
  try {
    const tutorial = await Tutorial.findById(req.params.id);
    
    if (!tutorial) {
      return res.status(404).json({ message: 'Tutorial not found' });
    }

    res.json({ tutorial });
  } catch (error) {
    console.error('Get tutorial error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create tutorial (Admin only)
router.post('/', 
  adminAuth,
  [
    body('title').trim().isLength({ min: 1 }).withMessage('Title is required'),
    body('youtubeUrl').isURL().withMessage('Valid YouTube URL is required'),
    body('category').isIn(['review', 'recommendation', 'reading-tips', 'author-interview', 'other'])
      .withMessage('Invalid category'),
    body('description').optional().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { title, description, youtubeUrl, category } = req.body;

      // Extract YouTube video ID and create thumbnail URL
      const videoId = extractYouTubeVideoId(youtubeUrl);
      if (!videoId) {
        return res.status(400).json({ message: 'Invalid YouTube URL' });
      }

      const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

      const tutorial = new Tutorial({
        title,
        description,
        youtubeUrl,
        category,
        thumbnail
      });

      await tutorial.save();

      res.status(201).json({
        message: 'Tutorial created successfully',
        tutorial
      });
    } catch (error) {
      console.error('Create tutorial error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Update tutorial (Admin only)
router.put('/:id', 
  adminAuth,
  [
    body('title').trim().isLength({ min: 1 }).withMessage('Title is required'),
    body('youtubeUrl').isURL().withMessage('Valid YouTube URL is required'),
    body('category').isIn(['review', 'recommendation', 'reading-tips', 'author-interview', 'other'])
      .withMessage('Invalid category'),
    body('description').optional().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { title, description, youtubeUrl, category, isActive } = req.body;

      // Extract YouTube video ID and create thumbnail URL
      const videoId = extractYouTubeVideoId(youtubeUrl);
      if (!videoId) {
        return res.status(400).json({ message: 'Invalid YouTube URL' });
      }

      const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

      const tutorial = await Tutorial.findByIdAndUpdate(
        req.params.id,
        {
          title,
          description,
          youtubeUrl,
          category,
          thumbnail,
          isActive: isActive !== undefined ? isActive : true
        },
        { new: true }
      );

      if (!tutorial) {
        return res.status(404).json({ message: 'Tutorial not found' });
      }

      res.json({
        message: 'Tutorial updated successfully',
        tutorial
      });
    } catch (error) {
      console.error('Update tutorial error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Delete tutorial (Admin only)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const tutorial = await Tutorial.findByIdAndDelete(req.params.id);
    
    if (!tutorial) {
      return res.status(404).json({ message: 'Tutorial not found' });
    }

    res.json({ message: 'Tutorial deleted successfully' });
  } catch (error) {
    console.error('Delete tutorial error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle tutorial status (Admin only)
router.patch('/:id/toggle', adminAuth, async (req, res) => {
  try {
    const tutorial = await Tutorial.findById(req.params.id);
    
    if (!tutorial) {
      return res.status(404).json({ message: 'Tutorial not found' });
    }

    tutorial.isActive = !tutorial.isActive;
    await tutorial.save();

    res.json({
      message: `Tutorial ${tutorial.isActive ? 'activated' : 'deactivated'} successfully`,
      tutorial
    });
  } catch (error) {
    console.error('Toggle tutorial error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to extract YouTube video ID
function extractYouTubeVideoId(url) {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : null;
}

module.exports = router;