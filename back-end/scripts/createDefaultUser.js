const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function createDefaultUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hospital_management');
    console.log('Connected to MongoDB');

    // Check if admin user already exists
    const existingAdmin = await User.findOne({ email: 'admin@hospital.com' });
    if (existingAdmin) {
      console.log('✅ Default admin user already exists');
      console.log('Email: admin@hospital.com');
      console.log('Password: admin123');
      return;
    }

    // Create default admin user
    const defaultAdmin = new User({
      username: 'admin',
      email: 'admin@hospital.com',
      password: 'admin123',
      role: 'Admin',
      permissions: [
        'manage_users', 'manage_doctors', 'manage_patients', 'manage_appointments',
        'manage_reports', 'manage_prescriptions', 'view_all_data', 'manage_system'
      ],
      firstName: 'System',
      lastName: 'Administrator',
      phone: '9999999999',
      isActive: true
    });

    await defaultAdmin.save();
    console.log('✅ Default admin user created successfully!');
    console.log('Email: admin@hospital.com');
    console.log('Password: admin123');

  } catch (error) {
    console.error('❌ Error creating default user:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the script
createDefaultUser();
