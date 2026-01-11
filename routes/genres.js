const express = require('express');
const { body, validationResult } = require('express-validator');
const Genre = require('../models/Genre');
const Book = require('../models/Book');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();

// Get all genres
router.get('/', async (req, res) => {
  try {
    const genres = await Genre.find().sort({ name: 1 });
    res.json({ genres });
  } catch (error) {
    console.error('Get genres error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single genre
router.get('/:id', async (req, res) => {
  try {
    const genre = await Genre.findById(req.params.id);
    if (!genre) {
      return res.status(404).json({ message: 'Genre not found' });
    }
    res.json({ genre });
  } catch (error) {
    console.error('Get genre error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create genre (Admin only)
router.post('/', 
  adminAuth,
  [
    body('name').trim().isLength({ min: 1 }).withMessage('Genre name is required'),
    body('description').optional().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, description } = req.body;

      // Check if genre already exists
      const existingGenre = await Genre.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') } 
      });
      
      if (existingGenre) {
        return res.status(400).json({ message: 'Genre already exists' });
      }

      const genre = new Genre({ name, description });
      await genre.save();

      res.status(201).json({
        message: 'Genre created successfully',
        genre
      });
    } catch (error) {
      console.error('Create genre error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Update genre (Admin only)
router.put('/:id', 
  adminAuth,
  [
    body('name').trim().isLength({ min: 1 }).withMessage('Genre name is required'),
    body('description').optional().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, description } = req.body;

      // Check if another genre with same name exists
      const existingGenre = await Genre.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: req.params.id }
      });
      
      if (existingGenre) {
        return res.status(400).json({ message: 'Genre with this name already exists' });
      }

      const genre = await Genre.findByIdAndUpdate(
        req.params.id,
        { name, description },
        { new: true }
      );

      if (!genre) {
        return res.status(404).json({ message: 'Genre not found' });
      }

      res.json({
        message: 'Genre updated successfully',
        genre
      });
    } catch (error) {
      console.error('Update genre error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Delete genre (Admin only)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const genre = await Genre.findById(req.params.id);
    if (!genre) {
      return res.status(404).json({ message: 'Genre not found' });
    }

    // Check if any books use this genre
    const booksWithGenre = await Book.countDocuments({ genre: req.params.id });
    if (booksWithGenre > 0) {
      return res.status(400).json({ 
        message: `Cannot delete genre. ${booksWithGenre} books are using this genre.` 
      });
    }

    await Genre.findByIdAndDelete(req.params.id);

    res.json({ message: 'Genre deleted successfully' });
  } catch (error) {
    console.error('Delete genre error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;