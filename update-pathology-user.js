const mongoose = require('mongoose');
const User = require('./back-end/models/User');

// MongoDB connection string
const MONGODB_URI = 'mongodb+srv://HospitalManagementSystem:sarthak123@cluster0.vbwumpm.mongodb.net/hospital_management?retryWrites=true&w=majority';

async function updatePathologyUser() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB successfully');

    // Update pathology user with correct role and permissions
    const result = await User.findOneAndUpdate(
      { email: 'pathology@hospital.com' },
      {
        $set: {
          role: 'Pathology',
          permissions: [
            'manage_pathology', 
            'view_lab_tests', 
            'create_lab_reports', 
            'manage_lab_results',
            'view_patients', 
            'manage_test_categories', 
            'generate_lab_invoices'
          ]
        }
      },
      { new: true }
    );

    if (result) {
      console.log('✅ Pathology user updated successfully');
      console.log('📧 Email:', result.email);
      console.log('👤 Role:', result.role);
      console.log('🔑 Permissions:', result.permissions);
    } else {
      console.log('❌ Pathology user not found');
    }

  } catch (error) {
    console.error('❌ Error updating pathology user:', error.message);
  } finally {
    console.log('🔌 Disconnecting from MongoDB');
    await mongoose.disconnect();
  }
}

updatePathologyUser();
