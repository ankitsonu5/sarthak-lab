const mongoose = require('mongoose');
require('dotenv').config();

const Patient = require('./back-end/models/Patient');

// MongoDB connection
const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) { throw new Error('MONGODB_URI environment variable is required'); }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Get first patient ID
const getPatientId = async () => {
  try {
    const patient = await Patient.findOne();
    if (patient) {
      console.log('👤 Found patient:', patient.firstName, patient.lastName);
      console.log('🆔 Patient ID:', patient._id);
      console.log('🆔 Patient ID (string):', patient._id.toString());
    } else {
      console.log('❌ No patients found');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await getPatientId();

  console.log('🔄 Closing database connection...');
  await mongoose.connection.close();
  console.log('✅ Database connection closed');
  process.exit(0);
};

main().catch(error => {
  console.error('❌ Script execution error:', error);
  process.exit(1);
});
