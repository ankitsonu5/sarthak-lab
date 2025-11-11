const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = require('./back-end/config/database');
const Department = require('./back-end/models/Department');

const checkDepartments = async () => {
  try {
    console.log('🔗 Connecting to database...');
    await connectDB();
    
    console.log('📋 Checking departments...');
    const departments = await Department.find({});
    
    console.log('✅ Found departments:', departments.length);
    departments.forEach(dept => {
      console.log(`📁 ${dept.name} (${dept.code}) - ID: ${dept._id}`);
    });
    
    if (departments.length === 0) {
      console.log('⚠️ No departments found! Creating sample department...');
      
      const sampleDept = new Department({
        name: 'Cardiology',
        code: 'CARD',
        description: 'Heart and cardiovascular diseases'
      });
      
      await sampleDept.save();
      console.log('✅ Sample department created:', sampleDept._id);
    }
    
    mongoose.disconnect();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    mongoose.disconnect();
  }
};

checkDepartments();
