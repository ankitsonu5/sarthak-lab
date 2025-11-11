const { MongoClient } = require('mongodb');
require('dotenv').config();

async function detailedCheck() {
  const mongoUri = process.env.MONGODB_URI;
  
  console.log('🔍 Detailed Database Check...');
  console.log('============================');
  
  try {
    const client = await MongoClient.connect(mongoUri);
    
    // List all databases
    const adminDb = client.db().admin();
    const databases = await adminDb.listDatabases();
    
    console.log('\n📊 Available Databases:');
    databases.databases.forEach((db, index) => {
      console.log(`${index + 1}. ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
    });
    
    // Check HospitalManagementSystem database
    const db = client.db('HospitalManagementSystem');
    const collections = await db.listCollections().toArray();
    
    console.log('\n📋 Collections in HospitalManagementSystem:');
    console.log('==========================================');
    
    for (const collection of collections) {
      const coll = db.collection(collection.name);
      const count = await coll.countDocuments();
      console.log(`📁 ${collection.name}: ${count} documents`);
      
      if (collection.name === 'pathologyreports' && count > 0) {
        console.log('   📄 Sample document:');
        const sample = await coll.findOne({});
        console.log('   ', JSON.stringify(sample, null, 2).substring(0, 200) + '...');
      }
    }
    
    await client.close();
    console.log('\n✅ Detailed check completed');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

detailedCheck();
