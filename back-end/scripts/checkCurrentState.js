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
const User = require('../models/User');
const Lab = require('../models/Lab');

async function checkState() {
  try {
    console.log('📊 Current Database State:\n');

    // Check all users
    const users = await User.find({}, 'email role labId isActive').populate('labId', 'labCode labName approvalStatus');
    console.log(`👥 Total Users: ${users.length}\n`);

    users.forEach(user => {
      console.log(`📧 ${user.email}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Active: ${user.isActive}`);
      if (user.labId) {
        console.log(`   Lab: ${user.labId.labCode} - ${user.labId.labName}`);
        console.log(`   Lab Status: ${user.labId.approvalStatus}`);
      } else {
        console.log(`   Lab: None (Independent user)`);
      }
      console.log('');
    });

    // Check all labs
    const labs = await Lab.find({}, 'labCode labName email approvalStatus subscriptionStatus subscriptionPlan');
    console.log(`\n🏥 Total Labs: ${labs.length}\n`);

    labs.forEach(lab => {
      console.log(`🏢 ${lab.labCode}: ${lab.labName}`);
      console.log(`   Email: ${lab.email}`);
      console.log(`   Approval: ${lab.approvalStatus}`);
      console.log(`   Subscription: ${lab.subscriptionPlan} (${lab.subscriptionStatus})`);
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run check
checkState();

