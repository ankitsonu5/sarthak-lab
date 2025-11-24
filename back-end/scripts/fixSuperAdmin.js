require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function fixSuperAdmin() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    console.log('📍 URI:', process.env.MONGODB_URI || 'mongodb://localhost:27017/Lab-E-commerce');
    
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Lab-E-commerce');
    console.log('✅ Connected to MongoDB\n');

    const email = 'superadmin@pathologysaas.com';
    const password = 'SuperAdmin@123';

    // Find or create SuperAdmin
    let superAdmin = await User.findOne({ email });

    if (!superAdmin) {
      console.log('❌ SuperAdmin not found. Creating new SuperAdmin...');
      superAdmin = new User({
        email: email,
        username: 'superadmin',
        password: password,
        role: 'SuperAdmin',
        firstName: 'Super',
        lastName: 'Admin',
        phone: '9999999999',
        isActive: true,
        labId: null
      });
      await superAdmin.save();
      console.log('✅ SuperAdmin created successfully!');
    } else {
      console.log('✅ SuperAdmin found:', superAdmin.email);
      console.log('🔄 Resetting password to:', password);
      
      // Reset password
      superAdmin.password = password;
      superAdmin.isActive = true;
      superAdmin.role = 'SuperAdmin';
      await superAdmin.save();
      
      console.log('✅ Password reset successfully!');
    }

    // Verify password works
    console.log('\n🔐 Verifying password...');
    const isValid = await superAdmin.comparePassword(password);
    console.log('   Password "' + password + '" valid:', isValid ? '✅ YES' : '❌ NO');

    if (isValid) {
      console.log('\n✅ SUCCESS! SuperAdmin is ready to login:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📧 Email:    ' + email);
      console.log('🔑 Password: ' + password);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } else {
      console.log('\n❌ Password verification failed!');
    }

    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixSuperAdmin();

