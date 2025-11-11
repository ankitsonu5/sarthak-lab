const mongoose = require('mongoose');
const TestDefinition = require('./back-end/models/TestDefinition');

// MongoDB connection
const MONGODB_URI = 'mongodb+srv://HospitalManagementSystem:sarthak123@cluster0.vbwumpm.mongodb.net/hospital_management?retryWrites=true&w=majority';

async function testNormalValues() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find a test definition with normal values
    const testWithNormalValues = await TestDefinition.findOne({
      'parameters.normalValues': { $exists: true, $ne: [] }
    });

    if (testWithNormalValues) {
      console.log('\n📋 Test Definition:', testWithNormalValues.name);
      console.log('🔍 Parameters with Normal Values:');
      
      testWithNormalValues.parameters.forEach((param, index) => {
        if (param.normalValues && param.normalValues.length > 0) {
          console.log(`\n  Parameter ${index + 1}: ${param.name}`);
          console.log('  Normal Values:');
          
          param.normalValues.forEach((nv, nvIndex) => {
            console.log(`    Range ${nvIndex + 1}:`);
            console.log(`      Type: ${nv.type}`);
            console.log(`      Gender: ${nv.gender}`);
            console.log(`      Min Age: ${nv.minAge} (${typeof nv.minAge})`);
            console.log(`      Max Age: ${nv.maxAge} (${typeof nv.maxAge})`);
            console.log(`      Age Unit: ${nv.ageUnit}`);
            console.log(`      Lower Value: ${nv.lowerValue}`);
            console.log(`      Upper Value: ${nv.upperValue}`);
            console.log(`      Display In Report: ${nv.displayInReport}`);
            console.log('      ---');
          });
        }
      });
    } else {
      console.log('❌ No test definitions with normal values found');
    }

    // Create a test normal value to verify the format
    console.log('\n🧪 Testing Normal Value Creation...');
    
    const testNormalValue = {
      type: 'Numeric range',
      gender: 'Any',
      minAge: '14 Years',
      maxAge: '100 Years',
      ageUnit: 'Years',
      lowerValue: '1000',
      upperValue: '5000',
      displayInReport: '1000-5000'
    };

    console.log('Test Normal Value Object:');
    console.log(JSON.stringify(testNormalValue, null, 2));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

testNormalValues();
