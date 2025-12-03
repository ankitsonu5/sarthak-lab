const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { authenticateToken } = require('../middlewares/auth');
const User = require('../models/User');
const Lab = require('../models/Lab');
const SubscriptionPlan = require('../models/SubscriptionPlan');

// Razorpay configuration - Use environment variables in production
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_YOUR_KEY_ID';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'YOUR_KEY_SECRET';

// Initialize Razorpay only if keys are configured
let razorpay = null;
try {
  const Razorpay = require('razorpay');
  if (RAZORPAY_KEY_ID && RAZORPAY_KEY_ID !== 'rzp_test_YOUR_KEY_ID') {
    razorpay = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET
    });
  }
} catch (e) {
  console.log('⚠️ Razorpay not configured - payment features disabled');
}

/**
 * @route   POST /api/payments/create-order
 * @desc    Create Razorpay order for subscription
 * @access  Private (LabAdmin)
 */
router.post('/create-order', authenticateToken, async (req, res) => {
  try {
    const { planId, planName, amount, billingCycle } = req.body;
    const userId = req.user._id;

    // Validate user and lab
    const user = await User.findById(userId).lean();
    if (!user || !user.labCode) {
      return res.status(400).json({ success: false, message: 'Lab not found for user' });
    }

    const lab = await Lab.findOne({ labCode: user.labCode });
    if (!lab) {
      return res.status(400).json({ success: false, message: 'Lab not found' });
    }

    // Validate plan
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) {
      return res.status(400).json({ success: false, message: 'Plan not found' });
    }

    // Check if Razorpay is configured
    if (!razorpay) {
      // Demo mode - return mock order for testing
      const mockOrderId = 'order_demo_' + Date.now();
      return res.json({
        success: true,
        order: {
          orderId: mockOrderId,
          amount: amount,
          currency: 'INR',
          razorpayKeyId: 'rzp_test_demo',
          demoMode: true
        },
        message: 'Demo mode - Configure RAZORPAY_KEY_ID in environment'
      });
    }

    // Create Razorpay order
    const orderOptions = {
      amount: amount, // amount in paise
      currency: 'INR',
      receipt: `sub_${lab.labCode}_${Date.now()}`,
      notes: {
        labId: lab._id.toString(),
        labCode: lab.labCode,
        planId: planId,
        planName: planName,
        billingCycle: billingCycle,
        userId: userId.toString()
      }
    };

    const order = await razorpay.orders.create(orderOptions);

    // Store order in database (you can create a Payment model for this)
    // For now, we'll verify using the order details

    res.json({
      success: true,
      order: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        razorpayKeyId: RAZORPAY_KEY_ID
      }
    });

  } catch (error) {
    console.error('❌ Error creating order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/payments/verify
 * @desc    Verify Razorpay payment and update subscription
 * @access  Private (LabAdmin)
 */
router.post('/verify', authenticateToken, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      planName,
      billingCycle
    } = req.body;

    const userId = req.user._id;

    // Get user's lab
    const user = await User.findById(userId).lean();
    if (!user || !user.labCode) {
      return res.status(400).json({ success: false, message: 'Lab not found' });
    }

    const lab = await Lab.findOne({ labCode: user.labCode });
    if (!lab) {
      return res.status(400).json({ success: false, message: 'Lab not found' });
    }

    // Demo mode check
    if (razorpay_order_id.startsWith('order_demo_')) {
      // Demo mode - just update subscription
      await updateSubscription(lab, planName, billingCycle);
      return res.json({
        success: true,
        message: 'Subscription updated (Demo Mode)',
        demoMode: true
      });
    }

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed - Invalid signature'
      });
    }

    // Update lab subscription
    await updateSubscription(lab, planName, billingCycle);

    res.json({
      success: true,
      message: 'Payment verified and subscription updated'
    });

  } catch (error) {
    console.error('❌ Error verifying payment:', error);
    res.status(500).json({ success: false, message: 'Payment verification failed' });
  }
});

// Helper function to update subscription
async function updateSubscription(lab, planName, billingCycle) {
  const now = new Date();
  let subscriptionEndsAt = new Date();

  if (billingCycle === 'yearly') {
    subscriptionEndsAt.setFullYear(subscriptionEndsAt.getFullYear() + 1);
  } else {
    subscriptionEndsAt.setMonth(subscriptionEndsAt.getMonth() + 1);
  }

  lab.subscriptionPlan = planName;
  lab.subscriptionStatus = 'active';
  lab.subscriptionEndsAt = subscriptionEndsAt;
  lab.subscriptionStartedAt = now;
  lab.trialEndsAt = null; // Clear trial

  await lab.save();
  console.log(`✅ Subscription updated for lab ${lab.labCode}: ${planName} (${billingCycle})`);
}

/**
 * @route   GET /api/payments/history
 * @desc    Get payment history for lab
 * @access  Private (LabAdmin)
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();
    if (!user || !user.labCode) {
      return res.status(400).json({ success: false, message: 'Lab not found' });
    }

    // For now, return empty history
    // You can create a Payment model to store payment history
    res.json({
      success: true,
      payments: [],
      message: 'Payment history feature coming soon'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch payment history' });
  }
});

module.exports = router;

