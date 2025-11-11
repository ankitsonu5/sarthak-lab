const mongoose = require('mongoose');
const CounterService = require('./back-end/services/counter-service');
require('dotenv').config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) { throw new Error('MONGODB_URI environment variable is required'); }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Fix specific counter issues
const fixSpecificIssues = async () => {
  try {
    console.log('🔧 Fixing specific counter issues...');
    
    const db = mongoose.connection.db;
    const countersCollection = db.collection('counters');
    
    // Fix TestTemplate counter (uses 'sequence' instead of 'value')
    console.log('🔄 Fixing TestTemplate counter...');
    const testTemplateCounter = await countersCollection.findOne({ name: 'testTemplate' });
    if (testTemplateCounter && testTemplateCounter.sequence) {
      await countersCollection.updateOne(
        { name: 'testTemplate' },
        { 
          $set: { value: testTemplateCounter.sequence },
          $unset: { sequence: 1 }
        }
      );
      console.log(`✅ TestTemplate counter fixed: sequence ${testTemplateCounter.sequence} -> value ${testTemplateCounter.sequence}`);
    }
    
    // Fix TestParameter counter (uses 'sequence' instead of 'value')
    console.log('🔄 Fixing TestParameter counter...');
    const testParameterCounter = await countersCollection.findOne({ name: 'testParameter' });
    if (testParameterCounter && testParameterCounter.sequence) {
      await countersCollection.updateOne(
        { name: 'testParameter' },
        { 
          $set: { value: testParameterCounter.sequence },
          $unset: { sequence: 1 }
        }
      );
      console.log(`✅ TestParameter counter fixed: sequence ${testParameterCounter.sequence} -> value ${testParameterCounter.sequence}`);
    }
    
    // Fix pathology daily counters (clean up old daily counters)
    console.log('🔄 Cleaning up old daily counters...');
    const oldDailyCounters = await countersCollection.find({
      name: { $regex: /^pathology_today_\d{4}-\d{2}-\d{2}$/ }
    }).toArray();
    
    console.log(`📊 Found ${oldDailyCounters.length} old daily counters`);
    
    // Keep only last 30 days of daily counters
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    for (const counter of oldDailyCounters) {
      const dateMatch = counter.name.match(/(\d{4}-\d{2}-\d{2})$/);
      if (dateMatch) {
        const counterDate = new Date(dateMatch[1]);
        if (counterDate < thirtyDaysAgo) {
          await countersCollection.deleteOne({ _id: counter._id });
          console.log(`🗑️ Deleted old daily counter: ${counter.name}`);
        }
      }
    }
    
    console.log('✅ Specific counter issues fixed!');
    
  } catch (error) {
    console.error('❌ Error fixing specific issues:', error);
    throw error;
  }
};

// Generate comprehensive report
const generateCounterReport = async () => {
  try {
    console.log('📊 Generating counter report...');
    
    const db = mongoose.connection.db;
    const countersCollection = db.collection('counters');
    
    // Get all counters
    const allCounters = await countersCollection.find({}).sort({ name: 1 }).toArray();
    
    console.log('\n📋 COUNTER REPORT:');
    console.log('==================');
    
    const currentYear = new Date().getFullYear();
    
    // Group counters by type
    const counterGroups = {
      yearly: [],
      daily: [],
      global: [],
      other: []
    };
    
    for (const counter of allCounters) {
      if (counter.name.includes(`_${currentYear}`)) {
        counterGroups.yearly.push(counter);
      } else if (counter.name.includes('_today_')) {
        counterGroups.daily.push(counter);
      } else if (['pharmacySupplier', 'testTemplate', 'testParameter'].includes(counter.name)) {
        counterGroups.global.push(counter);
      } else {
        counterGroups.other.push(counter);
      }
    }
    
    // Display report
    console.log(`\n🗓️ YEARLY COUNTERS (${currentYear}):`);
    for (const counter of counterGroups.yearly) {
      console.log(`   ${counter.name}: ${counter.value}`);
    }
    
    console.log(`\n📅 DAILY COUNTERS:`);
    for (const counter of counterGroups.daily) {
      console.log(`   ${counter.name}: ${counter.value}`);
    }
    
    console.log(`\n🌐 GLOBAL COUNTERS:`);
    for (const counter of counterGroups.global) {
      console.log(`   ${counter.name}: ${counter.value}`);
    }
    
    if (counterGroups.other.length > 0) {
      console.log(`\n❓ OTHER COUNTERS:`);
      for (const counter of counterGroups.other) {
        console.log(`   ${counter.name}: ${counter.value}`);
      }
    }
    
    console.log(`\n📈 SUMMARY:`);
    console.log(`   Total Counters: ${allCounters.length}`);
    console.log(`   Yearly: ${counterGroups.yearly.length}`);
    console.log(`   Daily: ${counterGroups.daily.length}`);
    console.log(`   Global: ${counterGroups.global.length}`);
    console.log(`   Other: ${counterGroups.other.length}`);
    
    return {
      total: allCounters.length,
      yearly: counterGroups.yearly.length,
      daily: counterGroups.daily.length,
      global: counterGroups.global.length,
      other: counterGroups.other.length,
      counters: allCounters
    };
    
  } catch (error) {
    console.error('❌ Error generating report:', error);
    throw error;
  }
};

// Main function
const main = async () => {
  try {
    console.log('🚀 Starting comprehensive counter fix...');
    console.log('=====================================');
    
    await connectDB();
    
    // Step 1: Fix specific issues
    await fixSpecificIssues();
    
    // Step 2: Run universal counter sync
    const results = await CounterService.fixAllCounters();
    
    // Step 3: Generate report
    const report = await generateCounterReport();
    
    // Step 4: Display results
    console.log('\n🎯 FIX RESULTS:');
    console.log('===============');
    
    for (const result of results) {
      if (result.status === 'success') {
        console.log(`✅ ${result.counter}: synced to ${result.syncedTo}`);
      } else {
        console.log(`❌ ${result.counter}: ${result.error}`);
      }
    }
    
    console.log('\n🎉 Counter fix completed successfully!');
    console.log('=====================================');
    
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Counter fix failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

// Run the script
main();
