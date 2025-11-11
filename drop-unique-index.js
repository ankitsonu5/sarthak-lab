const mongoose = require('mongoose');
require('dotenv').config();


// MongoDB connection
const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) { throw new Error('MONGODB_URI environment variable is required'); }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Drop unique index on name field
const dropUniqueIndex = async () => {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection('testdefinitions');

    // Get all indexes
    const indexes = await collection.indexes();
    console.log('📋 Current indexes:', JSON.stringify(indexes, null, 2));

    // Try to drop all indexes except _id
    for (const idx of indexes) {
      if (idx.name !== '_id_') {
        try {
          await collection.dropIndex(idx.name);
          console.log(`✅ Dropped index: ${idx.name}`);
        } catch (error) {
          console.log(`ℹ️ Could not drop index ${idx.name}:`, error.message);
        }
      }
    }

    console.log('✅ Index cleanup completed');

    // Show final indexes
    const finalIndexes = await collection.indexes();
    console.log('📋 Final indexes:', JSON.stringify(finalIndexes, null, 2));

  } catch (error) {
    console.error('❌ Error dropping indexes:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await dropUniqueIndex();

  console.log('🔄 Closing database connection...');
  await mongoose.connection.close();
  console.log('✅ Database connection closed');
  process.exit(0);
};

main().catch(error => {
  console.error('❌ Script execution error:', error);
  process.exit(1);
});
