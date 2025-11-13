const mongoose = require('mongoose');
const User = require('../models/User');
const Lab = require('../models/Lab'); // Need to import Lab for populate
const bcrypt = require('bcryptjs');

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/Lab-E-commerce';

async function testSgLogin() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const email = 'sg@gmail.com';
    const password = 'admin123';

    console.log('🔐 Testing login for:', email);
    console.log('🔑 Password:', password);
    console.log('');

    // Find user
    const user = await User.findOne({ email }).populate('labId');
    
    if (!user) {
      console.log('❌ User not found!');
      await mongoose.connection.close();
      return;
    }

    console.log('✅ User found:', user.email);
    console.log('   Role:', user.role);
    console.log('   Active:', user.isActive);
    console.log('   Lab:', user.labId?.labName);
    console.log('');

    // Check password
    console.log('🔍 Checking password...');
    console.log('   Stored hash:', user.password ? user.password.substring(0, 20) + '...' : 'NO PASSWORD!');
    
    if (!user.password) {
      console.log('❌ User has no password hash!');
      await mongoose.connection.close();
      return;
    }

    try {
      const isMatch = await bcrypt.compare(password, user.password);
      console.log('   Password match:', isMatch ? '✅ YES' : '❌ NO');
      
      if (!isMatch) {
        console.log('\n❌ Password does not match!');
        console.log('   Trying to reset password to admin123...');
        
        // Reset password
        user.password = password; // Will be hashed by pre-save hook
        await user.save();
        
        console.log('✅ Password reset successful!');
        console.log('   Try logging in again with: admin123');
      } else {
        console.log('\n✅ Password is correct!');
        console.log('   Login should work!');
      }
    } catch (error) {
      console.log('❌ Error comparing password:', error.message);
    }

    await mongoose.connection.close();
    console.log('\n✅ Test completed');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testSgLogin();

