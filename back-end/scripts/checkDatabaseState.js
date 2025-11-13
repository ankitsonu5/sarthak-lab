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

async function checkDatabaseState() {
  try {
    console.log('\n📊 DATABASE STATE CHECK\n');
    console.log('='.repeat(60));

    // Check Labs
    const labs = await Lab.find({});
    console.log(`\n🏢 LABS (${labs.length}):`);
    if (labs.length > 0) {
      labs.forEach(lab => {
        console.log(`   - ${lab.labCode}: ${lab.labName} (${lab.email})`);
        console.log(`     Status: ${lab.approvalStatus} | Subscription: ${lab.subscriptionStatus}`);
      });
    } else {
      console.log('   ✅ No labs found (clean state)');
    }

    // Check Users
    const users = await User.find({}, 'email role labId');
    console.log(`\n👥 USERS (${users.length}):`);
    users.forEach(user => {
      console.log(`   - ${user.email} (${user.role}) - labId: ${user.labId || 'NULL'}`);
    });

    // Check PathologyInvoices
    const invoices = await PathologyInvoice.find({});
    console.log(`\n📋 PATHOLOGY INVOICES (${invoices.length}):`);
    if (invoices.length > 0) {
      const byLab = {};
      invoices.forEach(inv => {
        const labId = inv.labId ? inv.labId.toString() : 'NO_LAB_ID';
        byLab[labId] = (byLab[labId] || 0) + 1;
      });
      Object.entries(byLab).forEach(([labId, count]) => {
        console.log(`   - Lab ${labId}: ${count} invoices`);
      });
    } else {
      console.log('   ✅ No invoices found (clean state)');
    }

    // Check PathologyRegistrations
    const registrations = await PathologyRegistration.find({});
    console.log(`\n📝 PATHOLOGY REGISTRATIONS (${registrations.length}):`);
    if (registrations.length > 0) {
      const byLab = {};
      registrations.forEach(reg => {
        const labId = reg.labId ? reg.labId.toString() : 'NO_LAB_ID';
        byLab[labId] = (byLab[labId] || 0) + 1;
      });
      Object.entries(byLab).forEach(([labId, count]) => {
        console.log(`   - Lab ${labId}: ${count} registrations`);
      });
    } else {
      console.log('   ✅ No registrations found (clean state)');
    }

    // Check Patients
    const patients = await Patient.find({});
    console.log(`\n🏥 PATIENTS (${patients.length}):`);
    if (patients.length > 0) {
      const byLab = {};
      patients.forEach(pat => {
        const labId = pat.labId ? pat.labId.toString() : 'NO_LAB_ID';
        byLab[labId] = (byLab[labId] || 0) + 1;
      });
      Object.entries(byLab).forEach(([labId, count]) => {
        console.log(`   - Lab ${labId}: ${count} patients`);
      });
    } else {
      console.log('   ✅ No patients found (clean state)');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Database state check complete!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run check
checkDatabaseState();

