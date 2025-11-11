const { MongoClient } = require('mongodb');
require('dotenv').config();

async function checkLatestData() {
  const mongoUri = process.env.MONGODB_URI;
  
  console.log('🔍 Checking Latest Pathology Reports...');
  console.log('====================================');
  
  try {
    const client = await MongoClient.connect(mongoUri);
    const db = client.db('HospitalManagementSystem');
    const collection = db.collection('pathologyreports');
    
    // Get total count
    const count = await collection.countDocuments();
    console.log(`📊 Total Reports: ${count}`);
    
    // Get latest reports
    const reports = await collection.find({}).sort({ createdAt: -1 }).limit(5).toArray();
    
    console.log('\n📄 Latest Reports:');
    console.log('==================');
    
    reports.forEach((report, index) => {
      console.log(`\n${index + 1}. Report ID: ${report.reportId}`);
      console.log(`   Receipt No: ${report.receiptNo}`);
      console.log(`   Registration No: ${report.registrationNo}`);
      console.log(`   Patient Name: ${report.patientData?.fullName || 'N/A'}`);
      console.log(`   Patient First Name: ${report.patientData?.firstName || 'N/A'}`);
      console.log(`   Patient Last Name: ${report.patientData?.lastName || 'N/A'}`);
      console.log(`   Age: ${report.patientData?.age || 'N/A'}`);
      console.log(`   Gender: ${report.patientData?.gender || 'N/A'}`);
      console.log(`   Phone: ${report.patientData?.phone || 'N/A'}`);
      console.log(`   Address: ${report.patientData?.address || 'N/A'}`);
      console.log(`   Department: ${report.department || 'N/A'}`);
      console.log(`   Doctor: ${report.doctor || 'N/A'}`);
      console.log(`   Test Results Count: ${report.testResults?.length || 0}`);
      console.log(`   Created At: ${report.createdAt}`);
    });
    
    await client.close();
    console.log('\n✅ Check completed');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkLatestData();
