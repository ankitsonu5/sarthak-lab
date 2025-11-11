const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://HospitalManagementSystem:sarthak123@cluster0.vbwumpm.mongodb.net/hospital_management?retryWrites=true&w=majority';

async function initPatientCounter() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const currentYear = new Date().getFullYear();
    const counterName = `patientId_${currentYear}`;

    // Count existing patients for current year
    const patientsCollection = db.collection('patients');
    const existingPatients = await patientsCollection.find({
      patientId: { $regex: /^PAT\d{6}$/ }
    }).toArray();

    console.log(`📊 Found ${existingPatients.length} existing patients`);

    // Find the highest patient ID number
    let maxPatientNumber = 0;
    existingPatients.forEach(patient => {
      if (patient.patientId && patient.patientId.startsWith('PAT')) {
        const numStr = patient.patientId.replace('PAT', '').replace(/^0+/, '') || '0';
        const num = parseInt(numStr);
        if (!isNaN(num) && num > maxPatientNumber) {
          maxPatientNumber = num;
        }
      }
    });

    console.log(`📊 Highest patient number found: ${maxPatientNumber}`);

    // Create or update counter
    const countersCollection = db.collection('counters');
    const result = await countersCollection.findOneAndUpdate(
      { name: counterName },
      { 
        $set: { 
          name: counterName,
          value: maxPatientNumber,
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true, returnDocument: 'after' }
    );

    console.log(`✅ Counter initialized: ${counterName} = ${maxPatientNumber}`);
    console.log(`📝 Next patient will get: PAT${String(maxPatientNumber + 1).padStart(6, '0')}`);

    // Verify counter was created
    const counter = await countersCollection.findOne({ name: counterName });
    console.log('✅ Counter verified:', counter);

    await mongoose.connection.close();
    console.log('✅ Script completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the script
initPatientCounter();

