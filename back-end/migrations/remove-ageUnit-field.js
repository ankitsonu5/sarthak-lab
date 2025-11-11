const mongoose = require('mongoose');
require('dotenv').config();

async function removeAgeUnitField() {
  try {
    console.log('🔄 Starting migration to remove ageUnit field from TestDefinition collection...');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hospital_management');
    console.log('📡 Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('testdefinitions');
    
    // Find all documents that have normalValues with ageUnit field
    const documentsWithAgeUnit = await collection.find({
      'parameters.normalValues.ageUnit': { $exists: true }
    }).toArray();
    
    console.log(`📋 Found ${documentsWithAgeUnit.length} documents with ageUnit field`);
    
    if (documentsWithAgeUnit.length === 0) {
      console.log('✅ No documents found with ageUnit field. Migration not needed.');
      return;
    }
    
    // Remove ageUnit field from all normalValues in all parameters
    const result = await collection.updateMany(
      {},
      {
        $unset: {
          'parameters.$[].normalValues.$[].ageUnit': ''
        }
      }
    );
    
    console.log(`✅ Migration completed successfully!`);
    console.log(`📊 Modified ${result.modifiedCount} documents`);
    
    // Verify the migration
    const remainingDocuments = await collection.find({
      'parameters.normalValues.ageUnit': { $exists: true }
    }).toArray();
    
    if (remainingDocuments.length === 0) {
      console.log('✅ Verification successful: No documents with ageUnit field remain');
    } else {
      console.log(`⚠️ Warning: ${remainingDocuments.length} documents still have ageUnit field`);
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

async function runMigration() {
  try {
    await removeAgeUnitField();
    console.log('🎉 Migration completed successfully!');
  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('📡 Database connection closed');
  }
}

// Run the migration
runMigration();
