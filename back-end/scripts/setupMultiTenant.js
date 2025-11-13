/**
 * Multi-Tenant Setup Script
 * This script helps set up the multi-tenant infrastructure
 */

const mongoose = require('mongoose');
const Lab = require('../models/Lab');
const User = require('../models/User');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const Patient = require('../models/Patient');
const PathologyRegistration = require('../models/PathologyRegistration');
require('dotenv').config();

const setupMultiTenant = async () => {
  try {
    console.log('🚀 Starting Multi-Tenant Setup...\n');

    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI not found in environment variables');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Step 1: Seed Subscription Plans
    console.log('📋 Step 1: Seeding Subscription Plans...');
    await SubscriptionPlan.seedDefaultPlans();
    const plans = await SubscriptionPlan.find();
    console.log(`✅ ${plans.length} subscription plans created\n`);

    // Step 2: Create Super Admin
    console.log('👤 Step 2: Creating Super Admin...');
    const existingSuperAdmin = await User.findOne({ role: 'SuperAdmin' });
    
    if (existingSuperAdmin) {
      console.log('ℹ️  Super Admin already exists:', existingSuperAdmin.email);
    } else {
      const superAdmin = new User({
        labId: null,
        username: 'superadmin',
        email: 'superadmin@pathologysaas.com',
        password: 'SuperAdmin@123',
        role: 'SuperAdmin',
        firstName: 'Super',
        lastName: 'Admin',
        phone: '9999999999',
        isActive: true
      });
      await superAdmin.save();
      console.log('✅ Super Admin created');
      console.log('   Email: superadmin@pathologysaas.com');
      console.log('   Password: SuperAdmin@123');
    }
    console.log('');

    // Step 3: Check for existing data
    console.log('🔍 Step 3: Checking for existing data...');
    const existingUsers = await User.countDocuments({ role: { $ne: 'SuperAdmin' } });
    const existingPatients = await Patient.countDocuments();
    const existingRegistrations = await PathologyRegistration.countDocuments();
    
    console.log(`   Users (non-SuperAdmin): ${existingUsers}`);
    console.log(`   Patients: ${existingPatients}`);
    console.log(`   Registrations: ${existingRegistrations}`);
    console.log('');

    // Step 4: Migrate existing data (if any)
    if (existingUsers > 0 || existingPatients > 0) {
      console.log('📦 Step 4: Migrating existing data to Lab 1...');
      
      // Check if Lab 1 already exists
      let lab1 = await Lab.findOne({ labCode: 'LAB00001' });
      
      if (!lab1) {
        // Create Lab 1 from existing data
        const firstUser = await User.findOne({ role: { $ne: 'SuperAdmin' } });
        
        lab1 = new Lab({
          labCode: 'LAB00001',
          labName: firstUser?.labSettings?.labName || 'Sarthak Diagnostic Network',
          email: firstUser?.email || 'admin@sarthak.com',
          phone: firstUser?.phone || '9876543210',
          address: firstUser?.labSettings?.addressLine1 || '',
          city: firstUser?.labSettings?.city || '',
          state: firstUser?.labSettings?.state || '',
          subscriptionPlan: 'premium',
          subscriptionStatus: 'active',
          approvalStatus: 'approved',
          approvedAt: new Date(),
          totalUsers: existingUsers,
          totalPatients: existingPatients,
          totalReports: existingRegistrations
        });
        
        await lab1.save();
        console.log('✅ Lab 1 created:', lab1.labCode);
      } else {
        console.log('ℹ️  Lab 1 already exists:', lab1.labCode);
      }

      // Update existing users with labId
      const usersUpdated = await User.updateMany(
        { role: { $ne: 'SuperAdmin' }, labId: null },
        { $set: { labId: lab1._id } }
      );
      console.log(`✅ Updated ${usersUpdated.modifiedCount} users with labId`);

      // Update existing patients with labId
      const patientsUpdated = await Patient.updateMany(
        { labId: { $exists: false } },
        { $set: { labId: lab1._id } }
      );
      console.log(`✅ Updated ${patientsUpdated.modifiedCount} patients with labId`);

      // Update existing registrations with labId
      const registrationsUpdated = await PathologyRegistration.updateMany(
        { labId: { $exists: false } },
        { $set: { labId: lab1._id } }
      );
      console.log(`✅ Updated ${registrationsUpdated.modifiedCount} registrations with labId`);
      
      console.log('');
    } else {
      console.log('ℹ️  No existing data to migrate\n');
    }

    // Step 5: Summary
    console.log('📊 Setup Summary:');
    console.log('─────────────────────────────────────────');
    const totalLabs = await Lab.countDocuments();
    const totalUsers = await User.countDocuments();
    const totalPlans = await SubscriptionPlan.countDocuments();
    
    console.log(`   Labs: ${totalLabs}`);
    console.log(`   Users: ${totalUsers}`);
    console.log(`   Subscription Plans: ${totalPlans}`);
    console.log('─────────────────────────────────────────\n');

    console.log('✅ Multi-Tenant Setup Complete!\n');
    console.log('🎯 Next Steps:');
    console.log('   1. Start your server: npm start');
    console.log('   2. Login as Super Admin:');
    console.log('      Email: superadmin@pathologysaas.com');
    console.log('      Password: SuperAdmin@123');
    console.log('   3. Test lab registration endpoint');
    console.log('   4. Approve new labs from Super Admin dashboard\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Setup Error:', error);
    process.exit(1);
  }
};

// Run setup
setupMultiTenant();

