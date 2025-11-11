const mongoose = require('mongoose');
const User = require('./back-end/models/User');
require('dotenv').config();

async function createTestUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hospital_management');
    console.log('Connected to MongoDB');

    // Check if admin user already exists
    const existingAdmin = await User.findOne({ email: 'admin@hospital.com' });
    if (existingAdmin) {
      console.log('Admin user already exists');
      return;
    }

    // Create admin user
    const adminUser = new User({
      username: 'admin',
      email: 'admin@hospital.com',
      password: 'admin123',
      role: 'Admin',
      firstName: 'System',
      lastName: 'Administrator',
      phone: '+1234567890'
    });

    await adminUser.save();
    console.log('✅ Admin user created successfully');
    console.log('Email: admin@hospital.com');
    console.log('Password: admin123');

    // Create a test doctor
    const doctorUser = new User({
      username: 'doctor1',
      email: 'doctor@hospital.com',
      password: 'doctor123',
      role: 'Doctor',
      firstName: 'Dr. John',
      lastName: 'Smith',
      phone: '+1234567891'
    });

    await doctorUser.save();
    console.log('✅ Doctor user created successfully');
    console.log('Email: doctor@hospital.com');
    console.log('Password: doctor123');

    // Create a test patient
    const patientUser = new User({
      username: 'patient1',
      email: 'patient@hospital.com',
      password: 'patient123',
      role: 'Patient',
      firstName: 'Jane',
      lastName: 'Doe',
      phone: '+1234567892'
    });

    await patientUser.save();
    console.log('✅ Patient user created successfully');
    console.log('Email: patient@hospital.com');
    console.log('Password: patient123');

  } catch (error) {
    console.error('Error creating test users:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

createTestUser();
