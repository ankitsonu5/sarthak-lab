/**
 * Cleanup Script for Duplicate Pathology Reports
 * 
 * This script merges duplicate reports with the same receiptNo
 * into a single unified report.
 */

const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://HospitalManagementSystem:sarthak123@cluster0.vbwumpm.mongodb.net/hospital_management';
const dbName = 'hospital_management';

async function cleanupDuplicateReports() {
  const client = await MongoClient.connect(mongoUri);
  const db = client.db(dbName);
  
  console.log('🔍 Finding duplicate reports by receiptNo...');
  
  // Find all receiptNos with multiple reports
  const duplicates = await db.collection('reports').aggregate([
    { $match: { reportType: 'pathology', receiptNo: { $exists: true, $ne: '' } } },
    { $group: { 
        _id: '$receiptNo', 
        count: { $sum: 1 },
        reports: { $push: '$$ROOT' }
    }},
    { $match: { count: { $gt: 1 } } }
  ]).toArray();
  
  console.log(`📊 Found ${duplicates.length} receiptNos with duplicate reports`);
  
  for (const dup of duplicates) {
    console.log(`\n🔄 Processing receiptNo: ${dup._id}`);
    console.log(`   Found ${dup.count} reports`);
    
    // Sort by createdAt to keep the first one
    const sortedReports = dup.reports.sort((a, b) => 
      new Date(a.createdAt) - new Date(b.createdAt)
    );
    
    const primaryReport = sortedReports[0];
    const duplicateReports = sortedReports.slice(1);
    
    // Merge all testResults into primary report
    let allTests = [...(primaryReport.testResults || [])];
    
    for (const dupReport of duplicateReports) {
      if (Array.isArray(dupReport.testResults)) {
        allTests = [...allTests, ...dupReport.testResults];
      }
    }
    
    console.log(`   Primary Report: ${primaryReport.reportId}`);
    console.log(`   Total tests after merge: ${allTests.length}`);
    
    // Update primary report with merged tests
    await db.collection('reports').updateOne(
      { _id: primaryReport._id },
      { 
        $set: { 
          testResults: allTests,
          updatedAt: new Date(),
          mergedFrom: duplicateReports.map(r => r.reportId)
        } 
      }
    );
    
    // Delete duplicate reports
    for (const dupReport of duplicateReports) {
      console.log(`   ❌ Deleting duplicate: ${dupReport.reportId}`);
      await db.collection('reports').deleteOne({ _id: dupReport._id });
    }
    
    console.log(`   ✅ Merged into ${primaryReport.reportId}`);
  }
  
  console.log('\n✅ Cleanup completed!');
  await client.close();
}

// Run cleanup
cleanupDuplicateReports()
  .then(() => {
    console.log('🎉 All done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });

