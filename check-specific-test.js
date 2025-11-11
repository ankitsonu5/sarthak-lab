const mongoose = require('mongoose');
const TestDefinition = require('./back-end/models/TestDefinition');

// MongoDB connection
const MONGODB_URI = 'mongodb+srv://HospitalManagementSystem:sarthak123@cluster0.vbwumpm.mongodb.net/hospital_management?retryWrites=true&w=majority';

async function checkSpecificTest() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find the specific test definition
    const testDefinition = await TestDefinition.findById('6891ef1085f9927abbdf7b20');
    
    if (testDefinition) {
      console.log(`\n📋 Test Definition: ${testDefinition.name}`);
      console.log(`   ID: ${testDefinition._id}`);
      
      if (testDefinition.parameters && testDefinition.parameters.length > 0) {
        testDefinition.parameters.forEach((param, pIndex) => {
          console.log(`\n  Parameter ${pIndex + 1}: ${param.name}`);
          console.log(`    Input Type: ${param.inputType}`);
          console.log(`    Unit: ${param.unit}`);
          console.log(`    Normal Values Count: ${param.normalValues?.length || 0}`);
          
          if (param.normalValues && param.normalValues.length > 0) {
            param.normalValues.forEach((nv, nvIndex) => {
              console.log(`\n    Normal Value ${nvIndex + 1}:`);
              console.log(`      _id: ${nv._id}`);
              console.log(`      Type: ${nv.type}`);
              console.log(`      Gender: ${nv.gender}`);
              console.log(`      Min Age: "${nv.minAge}" (${typeof nv.minAge})`);
              console.log(`      Max Age: "${nv.maxAge}" (${typeof nv.maxAge})`);
              console.log(`      Age Unit: ${nv.ageUnit}`);
              console.log(`      Lower Value: ${nv.lowerValue}`);
              console.log(`      Upper Value: ${nv.upperValue}`);
              console.log(`      Text Value: ${nv.textValue}`);
              console.log(`      Display In Report: "${nv.displayInReport}"`);
            });
          }
        });
      }
    } else {
      console.log('❌ Test definition not found');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

checkSpecificTest();
