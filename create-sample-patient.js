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

// Create sample patient
const createSamplePatient = async () => {
  try {
    console.log('👤 Creating sample patient...');

    const samplePatient = new Patient({
      firstName: 'Test',
      lastName: 'Patient',
      age: 30,
      ageIn: 'Years',
      gender: 'Female',
      phone: '9876543211',
      aadharNo: '123456789013',
      address: 'Delhi, India',
      city: 'Delhi',
      post: '110001'
    });

    const savedPatient = await samplePatient.save();
    console.log('✅ Sample patient created:', savedPatient.patientId);
    console.log('👤 Patient details:', {
      name: `${savedPatient.firstName} ${savedPatient.lastName}`,
      patientId: savedPatient.patientId,
      phone: savedPatient.phone
    });

  } catch (error) {
    console.error('❌ Error creating patient:', error);
  }
};

// Main function
const main = async () => {
  await connectDB();
  await createSamplePatient();
  await mongoose.connection.close();
  console.log('🔚 Script completed');
  process.exit(0);
};

main();
