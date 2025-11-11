const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// MongoDB connection string
const mongoURI = 'mongodb+srv://HospitalManagementSystem:sarthak123@cluster0.vbwumpm.mongodb.net/hospital_management?retryWrites=true&w=majority';

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  role: { type: String, enum: ['Admin', 'Doctor', 'Patient', 'Pathology'], required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phone: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  permissions: [String],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastLogin: Date
});

// Assign role-based permissions
const assignRolePermissions = (role) => {
  const rolePermissions = {
    'Admin': [
      'manage_users', 'manage_doctors', 'manage_patients', 'manage_appointments',
      'manage_reports', 'manage_prescriptions', 'view_all_data', 'manage_system'
    ],
    'Doctor': [
      'view_patients', 'view_appointments', 'create_prescriptions', 'create_reports',
      'view_medical_history', 'update_appointments'
    ],
    'Patient': [
      'view_own_appointments', 'view_own_prescriptions', 'view_own_reports',
      'update_own_profile'
    ],
    'Pathology': [
      'manage_pathology', 'view_lab_tests', 'create_lab_reports', 'manage_lab_results',
      'view_patients', 'manage_test_categories', 'generate_lab_invoices'
    ]
  };
  return rolePermissions[role] || [];
};

// Hash password and assign permissions before saving
userSchema.pre('save', async function(next) {
  // Assign permissions based on role
  if (this.isModified('role') || this.isNew) {
    this.permissions = assignRolePermissions(this.role);
  }

  // Hash password if modified
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

async function createPathologyUser() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB successfully');

    // Check if pathology user already exists
    const existingUser = await User.findOne({
      $or: [
        { email: 'pathology@hospital.com' },
        { username: 'pathology' }
      ]
    });

    if (existingUser) {
      console.log('⚠️ Pathology user already exists:', existingUser.email);
      console.log('🔄 Deleting existing user and creating new one...');
      await User.deleteOne({ _id: existingUser._id });
    }

    // Create pathology user
    const pathologyUser = new User({
      username: 'pathology',
      email: 'pathology@hospital.com',
      password: 'pathology123',
      role: 'Pathology',
      firstName: 'Lab',
      lastName: 'Technician',
      phone: '+91-9876543210',
      isActive: true
    });

    await pathologyUser.save();
    console.log('✅ Pathology user created successfully!');
    console.log('📧 Email: pathology@hospital.com');
    console.log('🔑 Password: pathology123');
    console.log('👤 Role: Pathology');
    console.log('🔐 Permissions:', pathologyUser.permissions);

  } catch (error) {
    console.error('❌ Error creating pathology user:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
createPathologyUser();
