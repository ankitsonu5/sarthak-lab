const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/Lab-E-commerce';

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// Import models
const Lab = require('../models/Lab');

async function approveAllPendingLabs() {
  try {
    console.log('🔄 Approving all pending labs with 30-day trial...\n');

    // Find all pending labs
    const pendingLabs = await Lab.find({ approvalStatus: 'pending' });
    console.log(`📊 Found ${pendingLabs.length} pending labs\n`);

    if (pendingLabs.length === 0) {
      console.log('✅ No pending labs to approve');
      process.exit(0);
    }

    // Update each lab
    for (const lab of pendingLabs) {
      console.log(`🏢 Approving: ${lab.labCode} - ${lab.labName}`);
      
      // Calculate 30-day trial
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 30);
      
      lab.approvalStatus = 'approved';
      lab.approvedAt = new Date();
      lab.subscriptionStatus = 'active';
      lab.trialEndsAt = trialEndsAt;
      lab.subscriptionEndsAt = trialEndsAt;
      
      await lab.save();
      
      console.log(`   ✅ Approved with trial until: ${trialEndsAt.toLocaleDateString()}`);
    }

    console.log(`\n✅ Successfully approved ${pendingLabs.length} labs!`);
    console.log('🎉 All labs can now login with 30-day free trial!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run approval
approveAllPendingLabs();

