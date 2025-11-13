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

async function resetPassword() {
  try {
    const email = 'adminvns@gmail.com';
    const newPassword = 'admin123';

    console.log(`🔄 Resetting password for: ${email}\n`);

    const user = await User.findOne({ email });

    if (!user) {
      console.log('❌ User not found');
      process.exit(1);
    }

    console.log(`👤 User found: ${user.firstName} ${user.lastName}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Current Active: ${user.isActive}`);

    // Clear invalid permissions
    user.permissions = [];

    // Update password (will be hashed by pre-save hook)
    user.password = newPassword;
    await user.save();

    console.log(`\n✅ Password reset successful!`);
    console.log(`\n🔑 New Login Credentials:`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${newPassword}`);
    console.log(`\n🎯 You can now login with these credentials!\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run
resetPassword();

