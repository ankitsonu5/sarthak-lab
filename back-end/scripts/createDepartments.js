const mongoose = require('mongoose');
const Department = require('../models/Department');
require('dotenv').config();

const createDefaultDepartments = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hospital_management');
    console.log('Connected to MongoDB');

    // Check if departments already exist
    const existingDepartments = await Department.countDocuments();
    if (existingDepartments > 0) {
      console.log('Departments already exist in database');
      process.exit(0);
    }

    // Default departments for hospital
    const departments = [
      { name: 'Cardiology', code: 'CARD' },
      { name: 'Neurology', code: 'NEUR' },
      { name: 'Orthopedics', code: 'ORTH' },
      { name: 'Pediatrics', code: 'PEDI' },
      { name: 'Gynecology', code: 'GYNE' },
      { name: 'General Medicine', code: 'GMED' },
      { name: 'Surgery', code: 'SURG' },
      { name: 'Dermatology', code: 'DERM' },
      { name: 'Ophthalmology', code: 'OPHT' },
      { name: 'ENT', code: 'ENT' },
      { name: 'Psychiatry', code: 'PSYC' },
      { name: 'Radiology', code: 'RADI' },
      { name: 'Emergency', code: 'EMER' },
      { name: 'Anesthesiology', code: 'ANES' },
      { name: 'Pathology', code: 'PATH' }
    ];

    // Create departments
    const createdDepartments = await Department.insertMany(departments);
    
    console.log('✅ Default departments created successfully!');
    console.log(`📊 Total departments created: ${createdDepartments.length}`);
    
    createdDepartments.forEach(dept => {
      console.log(`   - ${dept.name} (${dept.code})`);
    });

  } catch (error) {
    console.error('❌ Error creating departments:', error);
  } finally {
    mongoose.connection.close();
  }
};

createDefaultDepartments();
