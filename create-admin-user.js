const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/hospital_management');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// User Schema (simplified)
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, required: true },
  firstName: String,
  lastName: String,
  phone: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  lastLogin: Date
});

// Password comparison method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

// Create Admin User
const createAdminUser = async () => {
  try {
    console.log('🔄 Creating admin user...');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@hospital.com' });
    if (existingAdmin) {
      console.log('✅ Admin user already exists');
      console.log('📧 Email: admin@hospital.com');
      console.log('🔑 Password: admin123');
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('admin123', 10);

    // Create admin user
    const adminUser = new User({
      username: 'admin',
      email: 'admin@hospital.com',
      password: hashedPassword,
      role: 'Admin',
      firstName: 'Admin',
      lastName: 'User',
      phone: '9999999999',
      isActive: true
    });

    await adminUser.save();
    console.log('🎉 Admin user created successfully!');
    console.log('📧 Email: admin@hospital.com');
    console.log('🔑 Password: admin123');

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
  }
};

// Create Doctor User
const createDoctorUser = async () => {
  try {
    console.log('🔄 Creating doctor user...');

    // Check if doctor already exists
    const existingDoctor = await User.findOne({ email: 'doctor@hospital.com' });
    if (existingDoctor) {
      console.log('✅ Doctor user already exists');
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('doctor123', 10);

    // Create doctor user
    const doctorUser = new User({
      username: 'doctor',
      email: 'doctor@hospital.com',
      password: hashedPassword,
      role: 'Doctor',
      firstName: 'Dr. John',
      lastName: 'Smith',
      phone: '9999999998',
      isActive: true
    });

    await doctorUser.save();
    console.log('🎉 Doctor user created successfully!');
    console.log('📧 Email: doctor@hospital.com');
    console.log('🔑 Password: doctor123');

  } catch (error) {
    console.error('❌ Error creating doctor user:', error);
  }
};

// Create Reception User
const createReceptionUser = async () => {
  try {
    console.log('🔄 Creating reception user...');

    // Check if reception already exists
    const existingReception = await User.findOne({ email: 'reception@hospital.com' });
    if (existingReception) {
      console.log('✅ Reception user already exists');
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('reception123', 10);

    // Create reception user
    const receptionUser = new User({
      username: 'reception',
      email: 'reception@hospital.com',
      password: hashedPassword,
      role: 'Receptionist',
      firstName: 'Reception',
      lastName: 'Staff',
      phone: '9999999997',
      isActive: true
    });

    await receptionUser.save();
    console.log('🎉 Reception user created successfully!');
    console.log('📧 Email: reception@hospital.com');
    console.log('🔑 Password: reception123');

  } catch (error) {
    console.error('❌ Error creating reception user:', error);
  }
};

// Main function
const main = async () => {
  try {
    console.log('========================================');
    console.log('🏥 Hospital Management System - User Setup');
    console.log('========================================');

    await connectDB();
    await createAdminUser();
    await createDoctorUser();
    await createReceptionUser();

    console.log('');
    console.log('🎉 All users created successfully!');
    console.log('');
    console.log('📋 Login Credentials:');
    console.log('👨‍💼 Admin: admin@hospital.com / admin123');
    console.log('👨‍⚕️ Doctor: doctor@hospital.com / doctor123');
    console.log('🏥 Reception: reception@hospital.com / reception123');
    console.log('');
    console.log('🚀 You can now login to the application!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };
