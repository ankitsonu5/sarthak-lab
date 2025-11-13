const mongoose = require('mongoose');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/Lab-E-commerce';

async function updateSuperAdminEmail() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find SuperAdmin with old email
    const oldEmail = 'superadmin@hospital.com';
    const newEmail = 'superadmin@pathologysaas.com';

    const superAdmin = await User.findOne({ email: oldEmail, role: 'SuperAdmin' });

    if (!superAdmin) {
      console.log('❌ SuperAdmin not found with email:', oldEmail);
      process.exit(1);
    }

    console.log('✅ Found SuperAdmin:', superAdmin.email);
    console.log('🔄 Updating email to:', newEmail);

    superAdmin.email = newEmail;
    await superAdmin.save();

    console.log('✅ SuperAdmin email updated successfully!');
    console.log('📧 New email:', newEmail);
    console.log('🔑 Password: SuperAdmin@123');

    await mongoose.connection.close();
    console.log('✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateSuperAdminEmail();

