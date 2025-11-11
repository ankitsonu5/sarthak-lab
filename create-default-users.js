const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hospital_management');
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  role: { type: String, enum: ['Admin', 'Doctor', 'Patient'], required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phone: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  permissions: [String],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastLogin: Date
});

const User = mongoose.model('User', userSchema);

// Create Default Users
const createDefaultUsers = async () => {
  try {
    await connectDB();
    
    // Clear existing users
    await User.deleteMany({});
    console.log('🗑️  Cleared existing users');
    
    // Default users data
    const defaultUsers = [
      {
        username: 'admin',
        email: 'admin@hospital.com',
        password: 'admin123',
        role: 'Admin',
        firstName: 'System',
        lastName: 'Administrator',
        phone: '+1234567890',
        permissions: [
          'manage_users', 'manage_doctors', 'manage_patients', 'manage_appointments',
          'manage_reports', 'manage_prescriptions', 'view_all_data', 'manage_system'
        ]
      },
      {
        username: 'doctor1',
        email: 'doctor1@hospital.com',
        password: 'doctor123',
        role: 'Doctor',
        firstName: 'Dr. John',
        lastName: 'Smith',
        phone: '+1234567891',
        permissions: [
          'view_patients', 'view_appointments', 'create_prescriptions', 'create_reports',
          'view_medical_history', 'update_appointments'
        ]
      },
      {
        username: 'patient1',
        email: 'patient1@hospital.com',
        password: 'patient123',
        role: 'Patient',
        firstName: 'Jane',
        lastName: 'Doe',
        phone: '+1234567892',
        permissions: [
          'view_own_data', 'view_own_appointments', 'view_own_prescriptions', 'view_own_reports'
        ]
      }
    ];
    
    // Create users
    for (const userData of defaultUsers) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(userData.password, salt);
      
      const user = new User({
        ...userData,
        password: hashedPassword
      });
      
      await user.save();
      console.log(`✅ Created ${userData.role}: ${userData.email}`);
    }
    
    console.log('\n🎉 Default users created successfully!');
    console.log('\n🔑 Login Credentials:');
    console.log('👨‍💼 Admin:   admin@hospital.com / admin123');
    console.log('👨‍⚕️ Doctor:  doctor1@hospital.com / doctor123');
    console.log('🏥 Patient: patient1@hospital.com / patient123');
    
    mongoose.connection.close();
    
  } catch (error) {
    console.error('❌ Error creating default users:', error);
    mongoose.connection.close();
  }
};

console.log('🔄 Creating default users...');
createDefaultUsers();
