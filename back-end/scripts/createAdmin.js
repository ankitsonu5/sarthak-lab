const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const createDefaultAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hospital_management');
    console.log('Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: 'Admin' });
    if (existingAdmin) {
      console.log('Admin user already exists:', existingAdmin.email);
      process.exit(0);
    }

    // Create default admin user
    const adminUser = new User({
      username: 'admin',
      email: 'admin@hospital.com',
      password: 'admin@123',
      role: 'Admin',
      firstName: 'System',
      lastName: 'Administrator',
      phone: '9999999999'
    });

    await adminUser.save();
    console.log('Default admin user created successfully!');
    console.log('Email: admin@hospital.com');
    console.log('Password: admin@123');
    console.log('Please change the password after first login.');

  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    mongoose.connection.close();
  }
};

createDefaultAdmin();
