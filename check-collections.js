const { MongoClient } = require('mongodb');
require('dotenv').config();

async function checkCollections() {
  const mongoUri = process.env.MONGODB_URI;
  const dbName = 'HospitalManagementSystem';
  
  console.log('🔍 Checking MongoDB Collections...');
  console.log('📍 URI:', mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));
  
  try {
    const client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    
    // List all collections
    const collections = await db.listCollections().toArray();
    console.log('\n📋 Available Collections:');
    console.log('========================');
    
    if (collections.length === 0) {
      console.log('❌ No collections found in database');
    } else {
      collections.forEach((collection, index) => {
        console.log(`${index + 1}. ${collection.name}`);
      });
    }
    
    // Check pathologyreports specifically
    console.log('\n🔍 Checking pathologyreports collection:');
    console.log('=========================================');
    
    const pathologyCollection = db.collection('pathologyreports');
    const count = await pathologyCollection.countDocuments();
    console.log(`📊 Document count: ${count}`);
    
    if (count > 0) {
      console.log('\n📄 Sample documents:');
      const samples = await pathologyCollection.find({}).limit(3).toArray();
      samples.forEach((doc, index) => {
        console.log(`${index + 1}. ID: ${doc._id}, ReportID: ${doc.reportId}, Receipt: ${doc.receiptNo}`);
      });
    }
    
    await client.close();
    console.log('\n✅ Database check completed');
    
  } catch (error) {
    console.error('❌ Error checking database:', error);
  }
}

checkCollections();
