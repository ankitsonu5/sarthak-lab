const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Connect to MongoDB Atlas (No localhost fallback)
const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is required');
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Atlas Connected Successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// User Schema (simplified)
const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  role: String,
  firstName: String,
  lastName: String,
  phone: String,
  isActive: { type: Boolean, default: true },
  permissions: [String],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastLogin: Date
});

const User = mongoose.model('User', userSchema);

// Change Admin Password Function
const changeAdminPassword = async (newPassword) => {
  try {
    await connectDB();
    
    // Find admin user
    const adminUser = await User.findOne({ role: 'Admin' });
    
    if (!adminUser) {
      console.log('❌ Admin user not found!');
      console.log('Creating default admin user...');
      
      // Create default admin if not exists
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      
      const newAdmin = new User({
        username: 'admin',
        email: 'admin@hospital.com',
        password: hashedPassword,
        role: 'Admin',
        firstName: 'System',
        lastName: 'Administrator',
        phone: '+1234567890',
        isActive: true,
        permissions: [
          'manage_users', 'manage_doctors', 'manage_patients', 'manage_appointments',
          'manage_reports', 'manage_prescriptions', 'view_all_data', 'manage_system'
        ]
      });
      
      await newAdmin.save();
      console.log('✅ Default admin user created successfully!');
      console.log('📧 Email: admin@hospital.com');
      console.log('🔑 Password:', newPassword);
      
    } else {
      // Update existing admin password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      
      adminUser.password = hashedPassword;
      adminUser.updatedAt = new Date();
      
      await adminUser.save();
      
      console.log('✅ Admin password updated successfully!');
      console.log('📧 Email:', adminUser.email);
      console.log('🔑 New Password:', newPassword);
    }
    
    mongoose.connection.close();
    
  } catch (error) {
    console.error('❌ Error changing admin password:', error);
    mongoose.connection.close();
  }
};

// Get new password from command line or use default
const newPassword = process.argv[2] || 'admin123';

console.log('🔄 Changing admin password...');
console.log('🔑 New Password:', newPassword);

changeAdminPassword(newPassword);
