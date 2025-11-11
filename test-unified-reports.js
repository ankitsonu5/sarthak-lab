/**
 * Test Script for Unified Reports by Receipt Number
 * 
 * This script tests the new unified report functionality
 */

const { MongoClient } = require('mongodb');

const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://HospitalManagementSystem:sarthak123@cluster0.vbwumpm.mongodb.net/hospital_management';
const dbName = 'hospital_management';

async function testUnifiedReports() {
  const client = await MongoClient.connect(mongoUri);
  const db = client.db(dbName);
  
  console.log('🧪 Testing Unified Reports Functionality\n');
  
  // Test 1: Check for duplicate receiptNos
  console.log('📋 Test 1: Checking for duplicate receiptNos...');
  const duplicates = await db.collection('reports').aggregate([
    { $match: { reportType: 'pathology', receiptNo: { $exists: true, $ne: '' } } },
    { $group: { 
        _id: '$receiptNo', 
        count: { $sum: 1 },
        reportIds: { $push: '$reportId' }
    }},
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  
  if (duplicates.length > 0) {
    console.log(`⚠️  Found ${duplicates.length} receiptNos with multiple reports:`);
    duplicates.forEach(dup => {
      console.log(`   - Receipt ${dup._id}: ${dup.count} reports (${dup.reportIds.join(', ')})`);
    });
  } else {
    console.log('✅ No duplicate receiptNos found!');
  }
  
  // Test 2: Check specific receiptNo "132"
  console.log('\n📋 Test 2: Checking receiptNo "132"...');
  const receipt132Reports = await db.collection('reports')
    .find({ receiptNo: "132", reportType: 'pathology' })
    .toArray();
  
  if (receipt132Reports.length > 0) {
    console.log(`   Found ${receipt132Reports.length} report(s) for receiptNo "132":`);
    receipt132Reports.forEach(r => {
      console.log(`   - ${r.reportId}: ${r.testResults?.length || 0} tests`);
    });
    
    // Calculate total tests if merged
    const totalTests = receipt132Reports.reduce((sum, r) => sum + (r.testResults?.length || 0), 0);
    console.log(`   📊 Total tests if merged: ${totalTests}`);
  } else {
    console.log('   ℹ️  No reports found for receiptNo "132"');
  }
  
  // Test 3: Simulate unified grouping (like backend does)
  console.log('\n📋 Test 3: Simulating unified grouping...');
  const allReports = await db.collection('reports')
    .find({ reportType: 'pathology' })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
  
  const groupedByReceipt = new Map();
  for (const report of allReports) {
    const receiptKey = String(report.receiptNo || '').trim();
    if (!receiptKey) {
      groupedByReceipt.set(report._id.toString(), report);
      continue;
    }
    
    if (groupedByReceipt.has(receiptKey)) {
      const existing = groupedByReceipt.get(receiptKey);
      if (Array.isArray(report.testResults)) {
        existing.testResults = [...(existing.testResults || []), ...report.testResults];
      }
    } else {
      groupedByReceipt.set(receiptKey, { ...report });
    }
  }
  
  console.log(`   📊 Original reports: ${allReports.length}`);
  console.log(`   📊 After grouping: ${groupedByReceipt.size}`);
  console.log(`   ✅ Reduction: ${allReports.length - groupedByReceipt.size} duplicate entries merged`);
  
  // Test 4: Check for reports without receiptNo
  console.log('\n📋 Test 4: Checking reports without receiptNo...');
  const noReceiptCount = await db.collection('reports').countDocuments({
    reportType: 'pathology',
    $or: [
      { receiptNo: { $exists: false } },
      { receiptNo: '' },
      { receiptNo: null }
    ]
  });
  
  if (noReceiptCount > 0) {
    console.log(`   ⚠️  Found ${noReceiptCount} reports without receiptNo`);
  } else {
    console.log('   ✅ All reports have receiptNo!');
  }
  
  // Test 5: Summary
  console.log('\n📊 Summary:');
  const totalReports = await db.collection('reports').countDocuments({ reportType: 'pathology' });
  const uniqueReceipts = await db.collection('reports').distinct('receiptNo', { 
    reportType: 'pathology',
    receiptNo: { $exists: true, $ne: '' }
  });
  
  console.log(`   Total pathology reports: ${totalReports}`);
  console.log(`   Unique receipt numbers: ${uniqueReceipts.length}`);
  console.log(`   Duplicate reports: ${totalReports - uniqueReceipts.length - noReceiptCount}`);
  
  await client.close();
  console.log('\n✅ Testing completed!');
}

// Run tests
testUnifiedReports()
  .then(() => {
    console.log('\n🎉 All tests completed!');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Error:', err);
    process.exit(1);
  });

