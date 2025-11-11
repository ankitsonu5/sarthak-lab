console.log('🔍 Simple Test Starting...');

const { MongoClient } = require('mongodb');

const mongoUri = 'mongodb+srv://HospitalManagementSystem:sarthak123@cluster0.vbwumpm.mongodb.net/?retryWrites=true&w=majority&connectTimeoutMS=60000&socketTimeoutMS=60000&serverSelectionTimeoutMS=60000';

async function simpleTest() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    const client = await MongoClient.connect(mongoUri);
    console.log('✅ Connected successfully');
    
    const db = client.db('HospitalManagementSystem');
    const collection = db.collection('pathologyreports');
    
    const count = await collection.countDocuments();
    console.log(`📊 Total documents: ${count}`);
    
    const docs = await collection.find({}).toArray();
    console.log(`📄 Found ${docs.length} documents`);
    
    docs.forEach((doc, index) => {
      console.log(`${index + 1}. ${doc.reportId} - ${doc.receiptNo}`);
    });
    
    await client.close();
    console.log('✅ Test completed');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

simpleTest();
