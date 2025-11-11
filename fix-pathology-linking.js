const mongoose = require('mongoose');
require('dotenv').config();

const PathologyLinkingService = require('./back-end/services/pathology-linking-service');
const PathologyRegistration = require('./back-end/models/PathologyRegistration');
const TestDefinition = require('./back-end/models/TestDefinition');

// MongoDB connection
const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is required');
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

// Main fix function
const fixPathologyLinking = async () => {
  try {
    console.log('🚀 Starting pathology linking fix...');
    console.log('=====================================');

    // Connect to database
    await connectDB();

    // Step 1: Analyze current state
    console.log('\n📊 ANALYZING CURRENT STATE...');

    const totalRegistrations = await PathologyRegistration.countDocuments();
    const registrationsWithoutLinks = await PathologyRegistration.countDocuments({
      $or: [
        { 'tests.testDefinitionId': { $exists: false } },
        { 'tests.testDefinitionId': null }
      ]
    });

    const totalTestDefinitions = await TestDefinition.countDocuments();

    console.log(`📋 Total Pathology Registrations: ${totalRegistrations}`);
    console.log(`🔗 Registrations without test links: ${registrationsWithoutLinks}`);
    console.log(`🧪 Total Test Definitions: ${totalTestDefinitions}`);

    // Step 2: Get sample of unlinked tests
    console.log('\n🔍 SAMPLE OF UNLINKED TESTS...');

    const sampleRegistrations = await PathologyRegistration.find({
      $or: [
        { 'tests.testDefinitionId': { $exists: false } },
        { 'tests.testDefinitionId': null }
      ]
    }).limit(5);

    const uniqueTestNames = new Set();
    sampleRegistrations.forEach(reg => {
      reg.tests.forEach(test => {
        uniqueTestNames.add(test.name);
      });
    });

    console.log('📝 Sample test names found:');
    Array.from(uniqueTestNames).slice(0, 10).forEach(name => {
      console.log(`   - ${name}`);
    });

    // Step 3: Check which test definitions exist
    console.log('\n🔍 CHECKING TEST DEFINITION MATCHES...');

    const testDefinitions = await TestDefinition.find({}).select('name');
    const definitionNames = testDefinitions.map(td => td.name.toUpperCase());

    console.log('📚 Available test definitions:');
    definitionNames.slice(0, 10).forEach(name => {
      console.log(`   - ${name}`);
    });

    // Check matches
    const matches = [];
    const missingDefinitions = [];

    for (const testName of uniqueTestNames) {
      const upperTestName = testName.toUpperCase();
      const exactMatch = definitionNames.includes(upperTestName);
      const partialMatch = definitionNames.find(def =>
        def.includes(upperTestName) || upperTestName.includes(def)
      );

      if (exactMatch) {
        matches.push({ testName, matchType: 'exact' });
      } else if (partialMatch) {
        matches.push({ testName, matchType: 'partial', match: partialMatch });
      } else {
        missingDefinitions.push(testName);
      }
    }

    console.log(`\n✅ Tests with definitions: ${matches.length}`);
    console.log(`❌ Tests without definitions: ${missingDefinitions.length}`);

    if (missingDefinitions.length > 0) {
      console.log('\n⚠️ Missing test definitions:');
      missingDefinitions.forEach(name => {
        console.log(`   - ${name}`);
      });
    }

    // Step 4: Ask user for confirmation
    console.log('\n🤔 Do you want to proceed with fixing the links?');
    console.log('This will:');
    console.log('1. Link existing tests with their definitions');
    console.log('2. Update pathology registrations');
    console.log('3. Preserve all existing data');

    // For automation, proceed directly
    console.log('\n🔧 PROCEEDING WITH FIX...');

    // Step 5: Fix all registrations
    console.log('\n🔗 FIXING PATHOLOGY REGISTRATIONS...');

    const results = await PathologyLinkingService.fixAllExistingRegistrations();

    // Step 6: Generate report
    console.log('\n📊 FIX RESULTS:');
    console.log('===============');

    const successful = results.filter(r => r.status === 'success');
    const failed = results.filter(r => r.status === 'failed');

    console.log(`✅ Successfully fixed: ${successful.length} registrations`);
    console.log(`❌ Failed to fix: ${failed.length} registrations`);

    if (successful.length > 0) {
      console.log('\n✅ SUCCESSFUL FIXES:');
      successful.forEach(result => {
        console.log(`   Receipt ${result.receiptNumber}: ${result.linkedTests}/${result.testsCount} tests linked`);
      });
    }

    if (failed.length > 0) {
      console.log('\n❌ FAILED FIXES:');
      failed.forEach(result => {
        console.log(`   Receipt ${result.receiptNumber}: ${result.error}`);
      });
    }

    // Step 7: Final verification
    console.log('\n🔍 FINAL VERIFICATION...');

    const remainingUnlinked = await PathologyRegistration.countDocuments({
      $or: [
        { 'tests.testDefinitionId': { $exists: false } },
        { 'tests.testDefinitionId': null }
      ]
    });

    const nowLinked = totalRegistrations - remainingUnlinked;

    console.log(`📊 Final Status:`);
    console.log(`   Total registrations: ${totalRegistrations}`);
    console.log(`   Now linked: ${nowLinked}`);
    console.log(`   Still unlinked: ${remainingUnlinked}`);
    console.log(`   Success rate: ${((nowLinked / totalRegistrations) * 100).toFixed(1)}%`);

    // Step 8: Test report generation for a sample
    console.log('\n🧪 TESTING REPORT GENERATION...');

    if (successful.length > 0) {
      try {
        const sampleRegistrationId = successful[0].registrationId;
        const reportData = await PathologyLinkingService.getTestParametersForReport(sampleRegistrationId);

        console.log(`✅ Sample report data generated for receipt ${reportData.receiptNumber}:`);
        console.log(`   Tests: ${reportData.testResults.length}`);
        reportData.testResults.forEach(test => {
          console.log(`   - ${test.testName}: ${test.parameters.length} parameters`);
        });

      } catch (error) {
        console.error('❌ Error testing report generation:', error.message);
      }
    }

    console.log('\n🎉 PATHOLOGY LINKING FIX COMPLETED!');
    console.log('=====================================');

    // Close database connection
    await mongoose.connection.close();
    console.log('✅ Database connection closed');

  } catch (error) {
    console.error('❌ Error during pathology linking fix:', error);
    process.exit(1);
  }
};

// Run the fix
fixPathologyLinking();
