const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/hospital_management')
  .then(async () => {
    console.log('Connected to MongoDB');
    
    try {
      // Drop all indexes on patients collection except _id
      const collection = mongoose.connection.db.collection('patients');
      
      // Get all indexes
      const indexes = await collection.indexes();
      console.log('Current indexes:', indexes);
      
      // Drop all indexes except _id
      for (const index of indexes) {
        if (index.name !== '_id_') {
          try {
            await collection.dropIndex(index.name);
            console.log(`Dropped index: ${index.name}`);
          } catch (error) {
            console.log(`Could not drop index ${index.name}:`, error.message);
          }
        }
      }
      
      // Clear patients collection
      const result = await collection.deleteMany({});
      console.log(`Deleted ${result.deletedCount} patients`);
      
      console.log('Database cleaned successfully');
    } catch (error) {
      console.error('Error:', error);
    }
    
    mongoose.connection.close();
    console.log('Connection closed');
  })
  .catch(err => {
    console.error('Connection error:', err);
    mongoose.connection.close();
  });
