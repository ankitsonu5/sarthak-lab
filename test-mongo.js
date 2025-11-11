const mongoose = require('mongoose');
require('dotenv').config();


async function testConnection() {
  try {
    console.log('Testing MongoDB connection...');

    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is required');
    }
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log('✅ MongoDB connected successfully!');
    console.log('Host:', conn.connection.host);
    console.log('Database:', conn.connection.name);

    // Test a simple operation
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));

    await mongoose.connection.close();
    console.log('Connection closed');

  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.error('Error details:', error);
  }
}

testConnection();
