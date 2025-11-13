const mongoose = require('mongoose');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/Lab-E-commerce';

async function resetSuperAdminPassword() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find SuperAdmin
    const email = 'superadmin@pathologysaas.com';
    const newPassword = 'SuperAdmin@123';

    const superAdmin = await User.findOne({ email, role: 'SuperAdmin' });

    if (!superAdmin) {
      console.log('❌ SuperAdmin not found with email:', email);
      process.exit(1);
    }

    console.log('✅ Found SuperAdmin:', superAdmin.email);
    console.log('🔄 Resetting password...');

    // Set new password (will be hashed by pre-save hook)
    superAdmin.password = newPassword;
    await superAdmin.save();

    console.log('✅ Password reset successfully!');
    
    // Verify password
    const isValid = await superAdmin.comparePassword(newPassword);
    console.log('🔐 Password verification:', isValid ? '✅ SUCCESS' : '❌ FAILED');

    console.log('\n📋 Login Credentials:');
    console.log('   Email:', email);
    console.log('   Password:', newPassword);

    await mongoose.connection.close();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

resetSuperAdminPassword();

