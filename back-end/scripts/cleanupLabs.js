const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/Lab-E-commerce';

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// Import models
const User = require('../models/User');
const Lab = require('../models/Lab');
const PathologyInvoice = require('../models/PathologyInvoice');
const PathologyRegistration = require('../models/PathologyRegistration');
const Patient = require('../models/Patient');

async function cleanupLabs() {
  try {
    console.log('🧹 Starting lab cleanup...\n');

    // Find all labs
    const labs = await Lab.find({});
    console.log(`📊 Found ${labs.length} labs in database`);

    if (labs.length > 0) {
      console.log('\n📋 Labs to be deleted:');
      labs.forEach(lab => {
        console.log(`   - ${lab.labCode}: ${lab.labName} (${lab.email})`);
      });
    }

    // Find all lab users (users with labId)
    const labUsers = await User.find({ labId: { $ne: null } });
    console.log(`\n👥 Found ${labUsers.length} lab users in database`);

    if (labUsers.length > 0) {
      console.log('\n📋 Lab users to be deleted:');
      labUsers.forEach(user => {
        console.log(`   - ${user.email} (${user.role})`);
      });
    }

    // Count lab-related data
    const invoiceCount = await PathologyInvoice.countDocuments({ labId: { $exists: true } });
    const registrationCount = await PathologyRegistration.countDocuments({ labId: { $exists: true } });
    const patientCount = await Patient.countDocuments({ labId: { $exists: true } });

    console.log(`\n📊 Lab-related data to be deleted:`);
    console.log(`   - PathologyInvoices: ${invoiceCount}`);
    console.log(`   - PathologyRegistrations: ${registrationCount}`);
    console.log(`   - Patients: ${patientCount}`);

    // Delete all lab-related data
    console.log('\n🗑️  Deleting lab-related data...');

    const invoiceDeleteResult = await PathologyInvoice.deleteMany({ labId: { $exists: true } });
    console.log(`✅ Deleted ${invoiceDeleteResult.deletedCount} PathologyInvoices`);

    const registrationDeleteResult = await PathologyRegistration.deleteMany({ labId: { $exists: true } });
    console.log(`✅ Deleted ${registrationDeleteResult.deletedCount} PathologyRegistrations`);

    const patientDeleteResult = await Patient.deleteMany({ labId: { $exists: true } });
    console.log(`✅ Deleted ${patientDeleteResult.deletedCount} Patients`);

    // Delete all lab users
    const userDeleteResult = await User.deleteMany({ labId: { $ne: null } });
    console.log(`✅ Deleted ${userDeleteResult.deletedCount} lab users`);

    // Delete all labs
    const labDeleteResult = await Lab.deleteMany({});
    console.log(`✅ Deleted ${labDeleteResult.deletedCount} labs`);

    // Verify cleanup
    const remainingLabs = await Lab.countDocuments({});
    const remainingLabUsers = await User.countDocuments({ labId: { $ne: null } });

    console.log('\n📊 Cleanup Summary:');
    console.log(`   - Remaining Labs: ${remainingLabs}`);
    console.log(`   - Remaining Lab Users: ${remainingLabUsers}`);

    // Show remaining users (should only be SuperAdmin and Admin)
    const remainingUsers = await User.find({}, 'email role');
    console.log('\n👥 Remaining Users:');
    remainingUsers.forEach(user => {
      console.log(`   - ${user.email} (${user.role})`);
    });

    console.log('\n✅ Lab cleanup completed successfully!');
    console.log('🎯 Ready for fresh lab registration testing!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

// Run cleanup
cleanupLabs();

