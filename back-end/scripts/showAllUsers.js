const mongoose = require('mongoose');
const User = require('../models/User');
const Lab = require('../models/Lab');

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/Lab-E-commerce';

async function showAllUsers() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all users
    const users = await User.find({}).populate('labId').select('-password');
    
    console.log(`📋 Total Users: ${users.length}\n`);
    console.log('=' .repeat(80));

    for (const user of users) {
      console.log(`\n👤 User: ${user.email}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Name: ${user.firstName} ${user.lastName || ''}`);
      console.log(`   Active: ${user.isActive ? '✅ Yes' : '❌ No'}`);
      
      if (user.labId) {
        console.log(`   Lab: ${user.labId.labName} (${user.labId.labCode})`);
        console.log(`   Lab Status: ${user.labId.approvalStatus}`);
        console.log(`   Subscription: ${user.labId.subscriptionPlan} (${user.labId.subscriptionStatus})`);
        
        if (user.labId.trialEndsAt) {
          const trialEndsAt = new Date(user.labId.trialEndsAt);
          const now = new Date();
          const daysLeft = Math.ceil((trialEndsAt - now) / (1000 * 60 * 60 * 24));
          console.log(`   Trial Ends: ${trialEndsAt.toLocaleDateString()} (${daysLeft} days left)`);
        }
      } else {
        console.log(`   Lab: None (SuperAdmin)`);
      }
      
      console.log(`   Routes: ${user.allowedRoutes?.length || 0} routes`);
      console.log('-'.repeat(80));
    }

    console.log('\n\n🔑 **LOGIN CREDENTIALS:**\n');
    console.log('=' .repeat(80));
    
    // SuperAdmin
    const superAdmin = users.find(u => u.role === 'SuperAdmin');
    if (superAdmin) {
      console.log('\n🔐 **SuperAdmin:**');
      console.log(`   Email: ${superAdmin.email}`);
      console.log(`   Password: SuperAdmin@123`);
      console.log(`   Dashboard: /super-admin/dashboard`);
    }

    // Lab Admins
    const labAdmins = users.filter(u => u.role === 'LabAdmin');
    if (labAdmins.length > 0) {
      console.log('\n\n🧪 **Lab Admins:**');
      for (const admin of labAdmins) {
        console.log(`\n   Lab: ${admin.labId?.labName || 'Unknown'} (${admin.labId?.labCode || 'N/A'})`);
        console.log(`   Email: ${admin.email}`);
        console.log(`   Password: admin123`);
        console.log(`   Dashboard: /dashboard/pathology`);
        console.log(`   Status: ${admin.labId?.approvalStatus === 'approved' ? '✅ Approved' : '⚠️ Pending'}`);
      }
    }

    // Other users
    const otherUsers = users.filter(u => u.role !== 'SuperAdmin' && u.role !== 'LabAdmin');
    if (otherUsers.length > 0) {
      console.log('\n\n👥 **Other Users:**');
      for (const user of otherUsers) {
        console.log(`\n   Email: ${user.email}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   Lab: ${user.labId?.labName || 'None'}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ All users listed successfully!\n');

    await mongoose.connection.close();
    console.log('✅ Database connection closed');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

showAllUsers();

