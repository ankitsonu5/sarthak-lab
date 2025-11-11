const express = require('express');
const router = express.Router();
const ServiceHead = require('../models/ServiceHead');



// Seeding function
const seedServiceHeads = async () => {
  try {
    console.log('🌱 Starting Service Heads seeding...');

    // Check if data already exists
    const existingCount = await ServiceHead.countDocuments();
    
    if (existingCount > 0) {
      console.log(`📊 Found ${existingCount} existing service heads. Skipping seeding to prevent duplicates.`);
      return {
        success: true,
        message: 'Service heads already exist',
        count: existingCount
      };
    }

    // Insert all service heads
    const insertedServiceHeads = await ServiceHead.insertMany(defaultServiceHeads);
    
    console.log(`✅ Successfully seeded ${insertedServiceHeads.length} service heads`);
    
    return {
      success: true,
      message: 'Service heads seeded successfully',
      count: insertedServiceHeads.length
    };

  } catch (error) {
    console.error('❌ Error seeding service heads:', error.message);
    
    // Handle duplicate key errors gracefully
    if (error.code === 11000) {
      console.log('⚠️  Some service heads already exist. Skipping duplicates.');
      return {
        success: true,
        message: 'Some service heads already exist',
        error: 'Duplicate entries found'
      };
    }
    
    throw error;
  }
};

// GET /api/service-heads/:categoryId - Get service heads by category ID or category name
router.get('/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { search } = req.query;

    let serviceHeads;

    // Check if categoryId is a valid ObjectId or a category name
    const mongoose = require('mongoose');
    const isObjectId = mongoose.Types.ObjectId.isValid(categoryId);
    const validCategoryNames = ['PATHOLOGY', 'X-RAY', 'ECG', 'SHALAKYA', 'SHALYA', 'PANCHKARMA'];

    if (isObjectId) {
      // Handle ObjectId case
      if (search && search.trim()) {
        serviceHeads = await ServiceHead.searchTests(categoryId, search.trim());
      } else {
        serviceHeads = await ServiceHead.getByCategory(categoryId);
      }
    } else if (validCategoryNames.includes(categoryId.toUpperCase())) {
      // Handle category name case - find category first, then get service heads
      const CategoryHead = require('../models/CategoryHead');
      const category = await CategoryHead.findOne({ categoryName: categoryId.toUpperCase() });

      if (!category) {
        return res.status(404).json({
          success: false,
          message: `Category '${categoryId}' not found`
        });
      }

      if (search && search.trim()) {
        serviceHeads = await ServiceHead.searchTests(category._id, search.trim());
      } else {
        serviceHeads = await ServiceHead.getByCategory(category._id);
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid category ID or category name',
        validCategories: validCategoryNames
      });
    }

    // Format response
    const formattedServiceHeads = serviceHeads.map(item => ({
      _id: item._id,
      testName: item.testName,
      price: item.price,
      category: item.category?.categoryName || item.category, // 🚨 FIX: Return categoryName instead of ObjectId
      categoryName: item.category?.categoryName || 'Unknown', // Add categoryName field
      formattedPrice: item.getFormattedPrice()
    }));

    res.json({
      success: true,
      categoryId: categoryId,
      count: formattedServiceHeads.length,
      data: formattedServiceHeads,
      searchTerm: search || null
    });

  } catch (error) {
    console.error('Error fetching service heads:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching service heads',
      error: error.message
    });
  }
});

// GET /api/service-heads - Get all service heads
router.get('/', async (req, res) => {
  try {
    const { category, search } = req.query;
    
    let query = { isActive: true };
    
    // Add category filter if provided
    if (category) {
      query.category = category.toUpperCase();
    }
    
    // Add search filter if provided
    if (search && search.trim()) {
      query.$text = { $search: search.trim() };
    }

    const serviceHeads = await ServiceHead.find(query)
      .populate('category', 'categoryName categoryId') // 🚨 FIX: Add populate
      .sort({ category: 1, testName: 1 });

    // Format response
    const formattedServiceHeads = serviceHeads.map(item => ({
      _id: item._id,
      testName: item.testName,
      price: item.price,
      category: item.category?.categoryName || item.category, // 🚨 FIX: Return categoryName instead of ObjectId
      categoryName: item.category?.categoryName || 'Unknown', // Add categoryName field
      formattedPrice: item.getFormattedPrice()
    }));

    res.json({
      success: true,
      count: formattedServiceHeads.length,
      data: formattedServiceHeads
    });

  } catch (error) {
    console.error('Error fetching all service heads:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching service heads',
      error: error.message
    });
  }
});

// POST /api/service-heads - Create new service head
router.post('/', async (req, res) => {
  try {
    const { category, testName, price } = req.body;

    // Validate required fields
    if (!category || !testName || !price) {
      return res.status(400).json({
        success: false,
        message: 'Category, test name, and price are required'
      });
    }

    // Create new service head
    const serviceHead = new ServiceHead({
      category: category, // This should be ObjectId now
      testName: testName.trim(),
      price: parseFloat(price)
    });

    await serviceHead.save();

    // Populate category for response
    await serviceHead.populate('category', 'categoryName categoryId');

    res.status(201).json({
      success: true,
      message: 'Service head created successfully',
      data: {
        _id: serviceHead._id,
        testName: serviceHead.testName,
        price: serviceHead.price,
        category: serviceHead.category,
        formattedPrice: serviceHead.getFormattedPrice()
      }
    });

  } catch (error) {
    console.error('Error creating service head:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Service with this name already exists in this category'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating service head',
      error: error.message
    });
  }
});

// PUT /api/service-heads/:id - Update service head
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { testName, price, description } = req.body;

    console.log('Updating service head:', id, req.body);

    const updateData = {};
    if (testName) updateData.testName = testName.trim();
    if (price !== undefined) updateData.price = price.toString();
    if (description !== undefined) updateData.description = description?.trim();
    updateData.updatedAt = new Date();

    const updatedServiceHead = await ServiceHead.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('category', 'categoryName categoryId');

    if (!updatedServiceHead) {
      return res.status(404).json({
        success: false,
        message: 'Service head not found'
      });
    }

    res.json({
      success: true,
      message: 'Service head updated successfully',
      data: {
        _id: updatedServiceHead._id,
        testName: updatedServiceHead.testName,
        price: updatedServiceHead.price,
        category: updatedServiceHead.category,
        formattedPrice: updatedServiceHead.getFormattedPrice()
      }
    });

  } catch (error) {
    console.error('Error updating service head:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating service head',
      error: error.message
    });
  }
});

// DELETE /api/service-heads/:id - Delete service head
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Find and delete the service head
    const deletedService = await ServiceHead.findByIdAndDelete(id);

    if (!deletedService) {
      return res.status(404).json({
        success: false,
        message: 'Service head not found'
      });
    }

    res.json({
      success: true,
      message: 'Service head deleted successfully',
      data: deletedService
    });

  } catch (error) {
    console.error('Error deleting service head:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting service head',
      error: error.message
    });
  }
});

// DELETE /api/service-heads/:id - Delete service head
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Find and delete the service head
    const deletedService = await ServiceHead.findByIdAndDelete(id);

    if (!deletedService) {
      return res.status(404).json({
        success: false,
        message: 'Service head not found'
      });
    }

    res.json({
      success: true,
      message: 'Service head deleted successfully',
      data: {
        _id: deletedService._id,
        testName: deletedService.testName
      }
    });

  } catch (error) {
    console.error('Error deleting service head:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting service head',
      error: error.message
    });
  }
});

// POST /api/service-heads/seed - Seed default data
router.post('/seed', async (req, res) => {
  try {
    const result = await seedServiceHeads();
    res.json(result);
  } catch (error) {
    console.error('Error seeding service heads:', error);
    res.status(500).json({
      success: false,
      message: 'Error seeding service heads',
      error: error.message
    });
  }
});

module.exports = router;
