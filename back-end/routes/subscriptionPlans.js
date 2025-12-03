const express = require('express');
const router = express.Router();
const SubscriptionPlan = require('../models/SubscriptionPlan');
const { authenticateToken } = require('../middlewares/auth');

/**
 * @route   GET /api/subscription-plans
 * @desc    Get all subscription plans (Public for display, returns only active)
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true })
      .sort({ sortOrder: 1 })
      .lean();
    
    res.json({
      success: true,
      plans
    });
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription plans'
    });
  }
});

/**
 * @route   GET /api/subscription-plans/all
 * @desc    Get all subscription plans including inactive (SuperAdmin only)
 * @access  Private (SuperAdmin)
 */
router.get('/all', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'SuperAdmin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const plans = await SubscriptionPlan.find().sort({ sortOrder: 1 }).lean();
    
    res.json({
      success: true,
      plans
    });
  } catch (error) {
    console.error('Error fetching all plans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription plans'
    });
  }
});

/**
 * @route   POST /api/subscription-plans
 * @desc    Create a new subscription plan (SuperAdmin only)
 * @access  Private (SuperAdmin)
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'SuperAdmin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const planData = req.body;
    
    // Check if planName already exists
    const existing = await SubscriptionPlan.findOne({ planName: planData.planName });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Plan with this name already exists'
      });
    }

    const plan = new SubscriptionPlan(planData);
    await plan.save();

    res.status(201).json({
      success: true,
      message: 'Plan created successfully',
      plan
    });
  } catch (error) {
    console.error('Error creating plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create plan',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/subscription-plans/:id
 * @desc    Update a subscription plan (SuperAdmin only)
 * @access  Private (SuperAdmin)
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'SuperAdmin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const plan = await SubscriptionPlan.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );

    if (!plan) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    res.json({
      success: true,
      message: 'Plan updated successfully',
      plan
    });
  } catch (error) {
    console.error('Error updating plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update plan',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/subscription-plans/:id
 * @desc    Delete a subscription plan (SuperAdmin only)
 * @access  Private (SuperAdmin)
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'SuperAdmin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const plan = await SubscriptionPlan.findByIdAndDelete(req.params.id);

    if (!plan) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    res.json({
      success: true,
      message: 'Plan deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting plan:', error);
    res.status(500).json({ success: false, message: 'Failed to delete plan' });
  }
});

/**
 * @route   POST /api/subscription-plans/seed
 * @desc    Seed default plans (SuperAdmin only)
 * @access  Private (SuperAdmin)
 */
router.post('/seed', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'SuperAdmin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await SubscriptionPlan.seedDefaultPlans();

    res.json({
      success: true,
      message: 'Default plans seeded successfully'
    });
  } catch (error) {
    console.error('Error seeding plans:', error);
    res.status(500).json({ success: false, message: 'Failed to seed plans' });
  }
});

module.exports = router;

