const mongoose = require('mongoose');
const User = require('./back-end/models/User');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/hospital_management')
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const testLogin = async () => {
  try {
    console.log('🔍 Testing login functionality...');
    
    // Find admin user
    const user = await User.findOne({ email: 'admin@hospital.com' });
    console.log('👤 User found:', user ? 'YES' : 'NO');
    
    if (user) {
      console.log('📧 Email:', user.email);
      console.log('👤 Username:', user.username);
      console.log('🎭 Role:', user.role);
      console.log('✅ Active:', user.isActive);
      console.log('🔐 Password hash exists:', user.password ? 'YES' : 'NO');
      
      // Test password comparison
      const isPasswordValid = await user.comparePassword('admin123');
      console.log('🔐 Password test (admin123):', isPasswordValid ? 'PASS' : 'FAIL');
      
      if (isPasswordValid) {
        console.log('🎉 Login should work!');
      } else {
        console.log('❌ Password comparison failed');
      }
    } else {
      console.log('❌ No admin user found');
    }
    
  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    mongoose.connection.close();
    console.log('🔌 Disconnected from MongoDB');
  }
};

testLogin();
