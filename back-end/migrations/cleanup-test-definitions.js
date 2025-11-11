const mongoose = require('mongoose');
const TestDefinition = require('../models/TestDefinition');

// Connect to MongoDB
mongoose.connect('mongodb+srv://cluster0.vbwumpm.mongodb.net/hospital_management', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function cleanupTestDefinitions() {
  try {
    console.log('🧹 Starting cleanup of test definitions...');
    
    // Find all test definitions
    const testDefinitions = await TestDefinition.find({});
    console.log(`📋 Found ${testDefinitions.length} test definitions to process`);
    
    let updatedCount = 0;
    
    for (const testDef of testDefinitions) {
      let needsUpdate = false;
      const updateData = {};
      
      // Clean up parameters
      if (testDef.parameters && Array.isArray(testDef.parameters)) {
        const cleanedParameters = testDef.parameters.map(param => {
          const cleanParam = { ...param.toObject() };
          
          // Remove groupBy for non-nested test types
          if (testDef.testType !== 'nested' && cleanParam.groupBy !== undefined) {
            delete cleanParam.groupBy;
            needsUpdate = true;
            console.log(`  🧹 Removing groupBy from parameter "${cleanParam.name}" in test "${testDef.name}"`);
          }
          
          // Clean up normalValues - remove old ageUnit field
          if (cleanParam.normalValues && Array.isArray(cleanParam.normalValues)) {
            cleanParam.normalValues = cleanParam.normalValues.map(nv => {
              const cleanNV = { ...nv };
              if (cleanNV.ageUnit !== undefined) {
                delete cleanNV.ageUnit;
                needsUpdate = true;
                console.log(`  🧹 Removing ageUnit from normal value in parameter "${cleanParam.name}"`);
              }
              return cleanNV;
            });
          }
          
          return cleanParam;
        });
        
        if (needsUpdate) {
          updateData.parameters = cleanedParameters;
        }
      }
      
      // Update the document if needed
      if (needsUpdate) {
        await TestDefinition.findByIdAndUpdate(testDef._id, updateData);
        updatedCount++;
        console.log(`✅ Updated test definition: ${testDef.name}`);
      }
    }
    
    console.log(`🎉 Cleanup completed! Updated ${updatedCount} test definitions`);
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the cleanup
cleanupTestDefinitions();
