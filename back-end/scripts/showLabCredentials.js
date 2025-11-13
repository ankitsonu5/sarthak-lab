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

async function showCredentials() {
  try {
    console.log('🔑 Lab Login Credentials:\n');

    // Get all lab admins
    const labAdmins = await User.find({ role: 'LabAdmin' }).populate('labId', 'labCode labName approvalStatus subscriptionStatus trialEndsAt');

    if (labAdmins.length === 0) {
      console.log('❌ No lab admins found');
      process.exit(0);
    }

    labAdmins.forEach(admin => {
      console.log(`\n🏢 Lab: ${admin.labId.labCode} - ${admin.labId.labName}`);
      console.log(`   Status: ${admin.labId.approvalStatus} | Subscription: ${admin.labId.subscriptionStatus}`);
      console.log(`   Trial Ends: ${admin.labId.trialEndsAt ? new Date(admin.labId.trialEndsAt).toLocaleDateString() : 'N/A'}`);
      console.log(`\n   👤 Admin Login:`);
      console.log(`   Email: ${admin.email}`);
      console.log(`   Password: [Set during registration - you need to remember it]`);
      console.log(`   Name: ${admin.firstName} ${admin.lastName}`);
      console.log(`   Active: ${admin.isActive}`);
    });

    console.log('\n\n💡 Note: Passwords are hashed and cannot be displayed.');
    console.log('   If you forgot the password, you need to reset it.\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run
showCredentials();

