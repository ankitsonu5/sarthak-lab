const mongoose = require('mongoose');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/Lab-E-commerce';

async function checkSuperAdmin() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all SuperAdmins
    const superAdmins = await User.find({ role: 'SuperAdmin' });

    console.log('\n📊 SuperAdmin Users Found:', superAdmins.length);
    console.log('─────────────────────────────────────────');

    for (const admin of superAdmins) {
      console.log('\n👤 SuperAdmin:');
      console.log('   ID:', admin._id);
      console.log('   Email:', admin.email);
      console.log('   Username:', admin.username);
      console.log('   First Name:', admin.firstName);
      console.log('   Last Name:', admin.lastName);
      console.log('   Role:', admin.role);
      console.log('   Active:', admin.isActive);
      console.log('   Lab ID:', admin.labId);
      
      // Test password
      const testPassword = 'SuperAdmin@123';
      const isValid = await admin.comparePassword(testPassword);
      console.log('   Password "SuperAdmin@123" valid:', isValid ? '✅ YES' : '❌ NO');
    }

    await mongoose.connection.close();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkSuperAdmin();

