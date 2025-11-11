const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Connect to MongoDB Atlas
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error('❌ MONGODB_URI environment variable is not set!');
  process.exit(1);
}

mongoose.connect(mongoUri)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// User Schema (simplified)
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['Admin', 'Doctor', 'Patient'], required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phone: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  permissions: [String],
  lastLogin: Date
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
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

// Create admin user
const createAdmin = async () => {
  try {
    console.log('🔄 Creating admin user...');
    
    // Delete existing admin if exists
    await User.deleteOne({ email: 'admin@hospital.com' });
    console.log('🗑️ Removed existing admin user');
    
    // Create new admin
    const adminUser = new User({
      username: 'admin',
      email: 'admin@hospital.com',
      password: 'admin123', // Will be hashed by pre-save hook
      role: 'Admin',
      firstName: 'System',
      lastName: 'Administrator',
      phone: '9999999999',
      isActive: true,
      permissions: ['all'] // Admin has ALL permissions
    });
    
    await adminUser.save();
    console.log('✅ Admin user created successfully!');
    console.log('📧 Email: admin@hospital.com');
    console.log('🔑 Password: admin123');
    
    // Test password comparison
    const isPasswordValid = await adminUser.comparePassword('admin123');
    console.log('🔍 Password test:', isPasswordValid ? 'PASS' : 'FAIL');
    
  } catch (error) {
    console.error('❌ Error creating admin:', error);
  } finally {
    mongoose.connection.close();
    console.log('🔌 Disconnected from MongoDB');
  }
};

createAdmin();
