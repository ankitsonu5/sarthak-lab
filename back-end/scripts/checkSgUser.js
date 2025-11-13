const mongoose = require('mongoose');
const User = require('../models/User');
const Lab = require('../models/Lab');

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/Lab-E-commerce';

async function checkSgUser() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get sg@gmail.com user
    const user = await User.findOne({ email: 'sg@gmail.com' }).populate('labId');
    
    if (!user) {
      console.log('❌ User sg@gmail.com not found!');
      await mongoose.connection.close();
      return;
    }

    console.log('👤 User Details:');
    console.log(JSON.stringify(user, null, 2));

    console.log('\n\n🔍 Checking for issues:');
    
    // Check if user is active
    if (!user.isActive) {
      console.log('❌ User is NOT active!');
    } else {
      console.log('✅ User is active');
    }

    // Check if labId exists
    if (!user.labId) {
      console.log('❌ User has NO labId!');
    } else {
      console.log('✅ User has labId:', user.labId._id);
      
      // Check lab details
      console.log('\n🏢 Lab Details:');
      console.log('   Name:', user.labId.labName);
      console.log('   Code:', user.labId.labCode);
      console.log('   Approval:', user.labId.approvalStatus);
      console.log('   Subscription:', user.labId.subscriptionPlan, '(' + user.labId.subscriptionStatus + ')');
    }

    // Check password field
    if (!user.password) {
      console.log('❌ User has NO password!');
    } else {
      console.log('✅ User has password (hashed)');
    }

    await mongoose.connection.close();
    console.log('\n✅ Check completed');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkSgUser();

