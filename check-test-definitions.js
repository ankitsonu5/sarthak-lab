const mongoose = require('mongoose');
const TestDefinition = require('./back-end/models/TestDefinition');

// MongoDB connection
const MONGODB_URI = 'mongodb+srv://HospitalManagementSystem:sarthak123@cluster0.vbwumpm.mongodb.net/hospital_management?retryWrites=true&w=majority';

async function checkTestDefinitions() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all test definitions
    const testDefinitions = await TestDefinition.find({ isActive: true }).limit(5);
    
    console.log(`\n📋 Found ${testDefinitions.length} test definitions:`);
    
    testDefinitions.forEach((test, index) => {
      console.log(`\n${index + 1}. ${test.name}`);
      console.log(`   ID: ${test._id}`);
      console.log(`   Parameters: ${test.parameters?.length || 0}`);
      
      if (test.parameters && test.parameters.length > 0) {
        test.parameters.forEach((param, pIndex) => {
          console.log(`     ${pIndex + 1}. ${param.name} (${param.inputType})`);
          console.log(`        Normal Values: ${param.normalValues?.length || 0}`);
        });
      }
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

checkTestDefinitions();
