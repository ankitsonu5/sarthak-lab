require('dotenv').config();
const mongoose = require('mongoose');
const Lab = require('../models/Lab');
const User = require('../models/User');
const PathologyInvoice = require('../models/PathologyInvoice');
const PathologyRegistration = require('../models/PathologyRegistration');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hospital-management';

async function migratePathologyLabId() {
  try {
    console.log('🚀 Starting Pathology labId Migration...\n');
    
    // Connect to MongoDB
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Step 1: Check for existing data
    console.log('🔍 Step 1: Checking for existing data...');
    const totalInvoices = await PathologyInvoice.countDocuments();
    const totalRegistrations = await PathologyRegistration.countDocuments();
    const invoicesWithoutLabId = await PathologyInvoice.countDocuments({ labId: { $exists: false } });
    const registrationsWithoutLabId = await PathologyRegistration.countDocuments({ labId: { $exists: false } });
    
    console.log(`   Total PathologyInvoices: ${totalInvoices}`);
    console.log(`   PathologyInvoices without labId: ${invoicesWithoutLabId}`);
    console.log(`   Total PathologyRegistrations: ${totalRegistrations}`);
    console.log(`   PathologyRegistrations without labId: ${registrationsWithoutLabId}`);
    console.log('');

    if (invoicesWithoutLabId === 0 && registrationsWithoutLabId === 0) {
      console.log('✅ All records already have labId. No migration needed.');
      await mongoose.connection.close();
      process.exit(0);
    }

    // Step 2: Find or create Lab 1
    console.log('🔍 Step 2: Finding or creating Lab 1...');
    let lab1 = await Lab.findOne({ labCode: 'LAB00001' });
    
    if (!lab1) {
      console.log('⚠️  Lab 1 not found. Creating default Lab 1...');
      
      // Try to get lab info from first non-SuperAdmin user
      const firstUser = await User.findOne({ role: { $ne: 'SuperAdmin' } });
      
      lab1 = new Lab({
        labCode: 'LAB00001',
        labName: firstUser?.labSettings?.labName || 'Default Lab',
        email: firstUser?.email || 'admin@defaultlab.com',
        phone: firstUser?.phone || '0000000000',
        address: firstUser?.labSettings?.addressLine1 || '',
        city: firstUser?.labSettings?.city || '',
        state: firstUser?.labSettings?.state || '',
        subscriptionPlan: 'premium',
        subscriptionStatus: 'active',
        approvalStatus: 'approved',
        approvedAt: new Date(),
        totalUsers: await User.countDocuments({ role: { $ne: 'SuperAdmin' } }),
        totalPatients: 0,
        totalReports: totalRegistrations
      });
      
      await lab1.save();
      console.log('✅ Lab 1 created:', lab1.labCode, '-', lab1.labName);
    } else {
      console.log('✅ Lab 1 found:', lab1.labCode, '-', lab1.labName);
    }
    console.log('');

    // Step 3: Migrate PathologyInvoice records
    if (invoicesWithoutLabId > 0) {
      console.log('📦 Step 3: Migrating PathologyInvoice records...');
      
      const invoicesUpdated = await PathologyInvoice.updateMany(
        { labId: { $exists: false } },
        { $set: { labId: lab1._id } }
      );
      
      console.log(`✅ Updated ${invoicesUpdated.modifiedCount} PathologyInvoice records with labId`);
      console.log('');
    } else {
      console.log('ℹ️  Step 3: All PathologyInvoice records already have labId\n');
    }

    // Step 4: Migrate PathologyRegistration records
    if (registrationsWithoutLabId > 0) {
      console.log('📦 Step 4: Migrating PathologyRegistration records...');
      
      const registrationsUpdated = await PathologyRegistration.updateMany(
        { labId: { $exists: false } },
        { $set: { labId: lab1._id } }
      );
      
      console.log(`✅ Updated ${registrationsUpdated.modifiedCount} PathologyRegistration records with labId`);
      console.log('');
    } else {
      console.log('ℹ️  Step 4: All PathologyRegistration records already have labId\n');
    }

    // Step 5: Verify migration
    console.log('🔍 Step 5: Verifying migration...');
    const remainingInvoicesWithoutLabId = await PathologyInvoice.countDocuments({ labId: { $exists: false } });
    const remainingRegistrationsWithoutLabId = await PathologyRegistration.countDocuments({ labId: { $exists: false } });
    
    console.log(`   PathologyInvoices without labId: ${remainingInvoicesWithoutLabId}`);
    console.log(`   PathologyRegistrations without labId: ${remainingRegistrationsWithoutLabId}`);
    console.log('');

    // Step 6: Summary
    console.log('📊 Migration Summary:');
    console.log(`   Lab: ${lab1.labCode} - ${lab1.labName}`);
    console.log(`   PathologyInvoices migrated: ${invoicesWithoutLabId}`);
    console.log(`   PathologyRegistrations migrated: ${registrationsWithoutLabId}`);
    console.log('');

    if (remainingInvoicesWithoutLabId === 0 && remainingRegistrationsWithoutLabId === 0) {
      console.log('✅ Migration completed successfully! All records now have labId.');
    } else {
      console.log('⚠️  Migration completed with warnings. Some records still missing labId.');
    }

    // Close connection
    await mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run migration
migratePathologyLabId();

