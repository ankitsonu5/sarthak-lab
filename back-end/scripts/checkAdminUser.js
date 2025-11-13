const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/Lab-E-commerce';

async function checkAdminUser() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find admin user
    const admin = await User.findOne({ email: 'admin@hospital.com' });
    
    if (!admin) {
      console.log('❌ Admin user not found!');
      console.log('Creating admin user...');
      
      const newAdmin = new User({
        username: 'admin',
        email: 'admin@hospital.com',
        password: 'admin123',
        role: 'Admin',
        firstName: 'Admin',
        lastName: 'User',
        phone: '9999999999',
        isActive: true,
        permissions: ['all']
      });
      
      await newAdmin.save();
      console.log('✅ Admin user created successfully!');
    } else {
      console.log('✅ Admin user found:');
      console.log('   Email:', admin.email);
      console.log('   Username:', admin.username);
      console.log('   Role:', admin.role);
      console.log('   Active:', admin.isActive);
      console.log('   Created:', admin.createdAt);
      
      // Test password
      const bcrypt = require('bcryptjs');
      const isValid = await admin.comparePassword('admin123');
      console.log('   Password valid:', isValid ? '✅ YES' : '❌ NO');
      
      if (!isValid) {
        console.log('\n🔄 Resetting password to admin123...');
        admin.password = 'admin123';
        await admin.save();
        console.log('✅ Password reset successful!');
        
        // Verify again
        const admin2 = await User.findOne({ email: 'admin@hospital.com' });
        const isValid2 = await admin2.comparePassword('admin123');
        console.log('🔐 Password verification after reset:', isValid2 ? '✅ SUCCESS' : '❌ FAILED');
      }
    }

    await mongoose.disconnect();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkAdminUser();

