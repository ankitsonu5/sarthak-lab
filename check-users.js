const mongoose = require('mongoose');
const User = require('./back-end/models/User');

// MongoDB connection string
const MONGODB_URI = 'mongodb+srv://HospitalManagementSystem:sarthak123@cluster0.vbwumpm.mongodb.net/hospital_management?retryWrites=true&w=majority';

async function checkUsers() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB successfully');
    console.log('🗃️ Database:', mongoose.connection.db.databaseName);

    // Find all users
    const users = await User.find({}, 'email role firstName lastName permissions');
    
    console.log('👥 All users in database:');
    users.forEach((user, index) => {
      console.log(`${index + 1}. Email: ${user.email}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Name: ${user.firstName} ${user.lastName}`);
      console.log(`   Permissions: ${user.permissions.join(', ')}`);
      console.log('---');
    });

    console.log(`📊 Total users: ${users.length}`);

  } catch (error) {
    console.error('❌ Error checking users:', error.message);
  } finally {
    console.log('🔌 Disconnecting from MongoDB');
    await mongoose.disconnect();
  }
}

checkUsers();
