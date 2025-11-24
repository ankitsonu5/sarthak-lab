const mongoose = require('mongoose');
const Lab = require('../models/Lab');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// MongoDB connection - Use .env file
const MONGODB_URI = process.env.MONGODB_URI;

async function createTestLab() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Create test lab
    const testLab = new Lab({
      labCode: 'LAB001',
      labName: 'Test Pathology Lab',
      email: 'testlab@example.com',
      phone: '9876543210',
      address: '123 Test Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      subscriptionPlan: 'trial',
      subscriptionStatus: 'active',
      approvalStatus: 'pending',
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      totalUsers: 5,
      totalPatients: 100,
      totalReports: 250
    });

    await testLab.save();
    console.log('✅ Test lab created:', testLab.labCode);

    // Create lab admin user
    const hashedPassword = await bcrypt.hash('password123', 10);
    const adminUser = new User({
      firstName: 'Test',
      lastName: 'Admin',
      email: 'testadmin@example.com',
      phone: '9876543211',
      password: hashedPassword,
      role: 'LabAdmin',
      labId: testLab._id,
      profilePicture: null // No profile picture for now
    });

    await adminUser.save();
    console.log('✅ Lab admin user created:', adminUser.email);

    console.log('\n📊 Test Lab Details:');
    console.log('Lab Code:', testLab.labCode);
    console.log('Lab Name:', testLab.labName);
    console.log('Admin Email:', adminUser.email);
    console.log('Admin Password: password123');

    await mongoose.connection.close();
    console.log('\n✅ Done! MongoDB connection closed.');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

createTestLab();

