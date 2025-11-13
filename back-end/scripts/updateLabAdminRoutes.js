const mongoose = require('mongoose');
const User = require('../models/User');

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/Lab-E-commerce';

// Default routes for LabAdmin - full pathology access
const defaultLabAdminRoutes = [
  // Setup
  '/setup/doctors', '/setup/doctors/doctor-list', '/setup/category-heads', '/setup/prefixes',
  '/setup/pathology/test-master', '/setup/pathology/test-entry', '/setup/pathology/test-database',
  '/setup/pathology/test-panels', '/setup/pathology/reference-ranges',
  // Patients
  '/reception/search-patient', '/reception/patient-registration',
  // Tests / Lab Reports
  '/pathology/test-report', '/pathology/all-reports', '/pathology/reports-records', '/pathology/test-summary',
  // Appointments / Sample Collection
  '/appointments', '/pathology/scheduled-tests', '/pathology/registration',
  // Billing / Payments
  '/cash-receipt/register-opt-ipd', '/billing', '/cash-receipt/edit-history',
  // Inventory
  '/inventory/manage', '/inventory/stock-expiry',
  // Analytics / Reports
  '/reporting/daily-cash-report', '/reporting/daily-cash-summary',
  // Lab Setup
  '/lab-setup'
];

async function updateLabAdminRoutes() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all LabAdmin users
    const labAdmins = await User.find({ role: 'LabAdmin' });
    console.log(`\n📋 Found ${labAdmins.length} LabAdmin users`);

    if (labAdmins.length === 0) {
      console.log('⚠️  No LabAdmin users found');
      await mongoose.connection.close();
      return;
    }

    // Update each LabAdmin with default routes
    for (const admin of labAdmins) {
      console.log(`\n🔄 Updating: ${admin.email}`);
      
      admin.allowedRoutes = defaultLabAdminRoutes;
      await admin.save();
      
      console.log(`✅ Updated ${admin.email} with ${defaultLabAdminRoutes.length} routes`);
    }

    console.log('\n✅ All LabAdmin users updated successfully!');
    console.log(`\n📊 Summary:`);
    console.log(`   - Updated: ${labAdmins.length} LabAdmin users`);
    console.log(`   - Routes per user: ${defaultLabAdminRoutes.length}`);

    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateLabAdminRoutes();

