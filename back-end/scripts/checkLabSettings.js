require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Lab = require('../models/Lab');

async function checkLabSettings() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Lab-E-commerce');
    console.log('✅ Connected to MongoDB');

    // Find all users
    const users = await User.find({}).select('email role labSettings labId').populate('labId');

    console.log('\n📊 User Lab Settings:\n');
    console.log('='.repeat(80));

    for (const user of users) {
      console.log(`\n👤 ${user.email} (${user.role})`);
      console.log(`   Lab ID: ${user.labId?._id || 'None'}`);
      console.log(`   Lab Name (from labId): ${user.labId?.labName || 'None'}`);
      console.log(`   Lab Settings:`, user.labSettings ? JSON.stringify(user.labSettings, null, 2) : 'None');
    }

    console.log('\n' + '='.repeat(80));

    await mongoose.connection.close();
    console.log('\n✅ Done');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkLabSettings();

