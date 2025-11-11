const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/hospital_management')
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Clear patients collection
    const result = await mongoose.connection.db.collection('patients').deleteMany({});
    console.log(`Deleted ${result.deletedCount} patients`);
    
    mongoose.connection.close();
    console.log('Database cleared and connection closed');
  })
  .catch(err => {
    console.error('Error:', err);
    mongoose.connection.close();
  });
