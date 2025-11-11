const express = require('express');
const CategoryHead = require('../models/CategoryHead');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

// Get all category heads (public route for dropdown lists)
router.get('/list', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', category = '' } = req.query;
    
    let query = {};
    
    // Add search filter
    if (search) {
      query.$or = [
        { categoryName: new RegExp(search, 'i') },
        { categoryId: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') }
      ];
    }
    
    // Add category filter
    if (category) {
      query.category = category;
    }
    
    const skip = (page - 1) * limit;
    
    const categoryHeads = await CategoryHead.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await CategoryHead.countDocuments(query);
    const totalPages = Math.ceil(total / limit);
    
    res.json({
      categoryHeads,
      totalPages,
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Error fetching category heads:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get category head by ID
router.get('/:id', async (req, res) => {
  try {
    const categoryHead = await CategoryHead.findById(req.params.id);
    if (!categoryHead) {
      return res.status(404).json({ message: 'Category head not found' });
    }
    res.json(categoryHead);
  } catch (error) {
    console.error('Error fetching category head:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create new category head
router.post('/', async (req, res) => {
  try {
    console.log('Creating new category head with data:', req.body);
    
    const categoryHeadData = { ...req.body };
    
    // Ensure categoryName is uppercase
    if (categoryHeadData.categoryName) {
      categoryHeadData.categoryName = categoryHeadData.categoryName.toUpperCase();
    }
    
    const categoryHead = new CategoryHead(categoryHeadData);
    await categoryHead.save();
    
    console.log('Category head created successfully:', categoryHead.categoryId);
    res.status(201).json({
      message: 'Category head created successfully',
      categoryHead
    });
  } catch (error) {
    console.error('Error creating category head:', error);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        message: `${field} already exists` 
      });
    }
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation error', 
        errors 
      });
    }
    
    res.status(500).json({ message: error.message });
  }
});

// Update category head
router.put('/:id', async (req, res) => {
  try {
    console.log('Updating category head:', req.params.id, req.body);
    
    const updateData = { ...req.body };
    
    // Ensure categoryName is uppercase
    if (updateData.categoryName) {
      updateData.categoryName = updateData.categoryName.toUpperCase();
    }
    
    // Update timestamp
    updateData.updatedAt = new Date();
    
    const categoryHead = await CategoryHead.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!categoryHead) {
      return res.status(404).json({ message: 'Category head not found' });
    }
    
    console.log('Category head updated successfully:', categoryHead.categoryId);
    res.json({
      message: 'Category head updated successfully',
      categoryHead
    });
  } catch (error) {
    console.error('Error updating category head:', error);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        message: `${field} already exists` 
      });
    }
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation error', 
        errors 
      });
    }
    
    res.status(500).json({ message: error.message });
  }
});

// Delete category head
router.delete('/:id', async (req, res) => {
  try {
    console.log('Deleting category head:', req.params.id);
    
    const categoryHead = await CategoryHead.findByIdAndDelete(req.params.id);
    
    if (!categoryHead) {
      return res.status(404).json({ message: 'Category head not found' });
    }
    
    console.log('Category head deleted successfully:', categoryHead.categoryId);
    res.json({
      message: 'Category head deleted successfully',
      categoryHead
    });
  } catch (error) {
    console.error('Error deleting category head:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get active category heads by category type
router.get('/category/:categoryType', async (req, res) => {
  try {
    const categoryHeads = await CategoryHead.findByCategory(req.params.categoryType);
    res.json(categoryHeads);
  } catch (error) {
    console.error('Error fetching category heads by type:', error);
    res.status(500).json({ message: error.message });
  }
});

// Toggle category head status
router.patch('/:id/toggle-status', async (req, res) => {
  try {
    const categoryHead = await CategoryHead.findById(req.params.id);
    
    if (!categoryHead) {
      return res.status(404).json({ message: 'Category head not found' });
    }
    
    categoryHead.isActive = !categoryHead.isActive;
    categoryHead.updatedAt = new Date();
    await categoryHead.save();
    
    res.json({
      message: `Category head ${categoryHead.isActive ? 'activated' : 'deactivated'} successfully`,
      categoryHead
    });
  } catch (error) {
    console.error('Error toggling category head status:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
