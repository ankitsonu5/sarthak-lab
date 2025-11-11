const mongoose = require('mongoose');
const User = require('./back-end/models/User');

// MongoDB connection string
const MONGODB_URI = 'mongodb+srv://HospitalManagementSystem:sarthak123@cluster0.vbwumpm.mongodb.net/hospital_management?retryWrites=true&w=majority';

async function createPathologyUser() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB successfully');
    console.log('🗃️ Database:', mongoose.connection.db.databaseName);

    // Delete existing pathology user if exists
    await User.deleteMany({ 
      $or: [
        { email: 'pathology@hospital.com' },
        { username: 'pathology' }
      ]
    });
    console.log('🗑️ Deleted any existing pathology users');

    // Create new pathology user
    const pathologyUser = new User({
      username: 'pathology',
      email: 'pathology@hospital.com',
      password: 'pathology123',
      role: 'Pathology',
      firstName: 'Lab',
      lastName: 'Technician',
      phone: '+91-9876543210',
      isActive: true
    });

    const savedUser = await pathologyUser.save();
    console.log('✅ Pathology user created successfully!');
    console.log('📧 Email:', savedUser.email);
    console.log('👤 Role:', savedUser.role);
    console.log('🔐 Permissions:', savedUser.permissions);

    // Verify user exists
    const verifyUser = await User.findOne({ email: 'pathology@hospital.com' });
    if (verifyUser) {
      console.log('✅ Verification: User exists in database');
    } else {
      console.log('❌ Verification: User NOT found in database');
    }

  } catch (error) {
    console.error('❌ Error creating pathology user:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    console.log('🔌 Disconnecting from MongoDB');
    await mongoose.disconnect();
  }
}

createPathologyUser();
