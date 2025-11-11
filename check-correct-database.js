const { MongoClient } = require('mongodb');

const mongoUri = 'mongodb+srv://HospitalManagementSystem:sarthak123@cluster0.vbwumpm.mongodb.net/hospital_management';

async function checkCorrectDatabase() {
  try {
    console.log('🔍 Checking Correct Database: hospital_management');
    console.log('==============================================');
    
    const client = await MongoClient.connect(mongoUri);
    const db = client.db('hospital_management');
    
    // Check reports collection
    const reportsCollection = db.collection('reports');
    const pathologyReports = await reportsCollection.find({ reportType: 'pathology' }).toArray();
    
    console.log(`📊 Total Pathology Reports: ${pathologyReports.length}`);
    
    if (pathologyReports.length > 0) {
      console.log('\n📄 Pathology Reports:');
      console.log('====================');
      
      pathologyReports.forEach((report, index) => {
        console.log(`\n${index + 1}. Report ID: ${report.reportId}`);
        console.log(`   Receipt No: ${report.receiptNo}`);
        console.log(`   Patient: ${report.patientData?.fullName || 'N/A'}`);
        console.log(`   Department: ${report.department}`);
        console.log(`   Doctor: ${report.doctor}`);
        console.log(`   Status: ${report.reportStatus}`);
        console.log(`   Created: ${report.createdAt}`);
      });
    }
    
    // Check all collections in hospital_management
    console.log('\n📋 All Collections in hospital_management:');
    console.log('==========================================');
    const collections = await db.listCollections().toArray();
    collections.forEach((collection, index) => {
      console.log(`${index + 1}. ${collection.name}`);
    });
    
    await client.close();
    console.log('\n✅ Check completed');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkCorrectDatabase();
