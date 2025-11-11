const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) { throw new Error('MONGODB_URI environment variable is required'); }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Fix patient counter sync
const fixPatientCounter = async () => {
  try {
    console.log('🔧 Starting patient counter sync fix...');
    
    const db = mongoose.connection.db;
    const patientsCollection = db.collection('patients');
    const countersCollection = db.collection('counters');
    
    // Get current year
    const currentYear = new Date().getFullYear();
    const counterName = `patientId_${currentYear}`;
    
    console.log(`📅 Working with year: ${currentYear}`);
    console.log(`🔍 Counter name: ${counterName}`);
    
    // Find all patients with patientId starting with PAT
    const patients = await patientsCollection.find({
      patientId: { $regex: /^PAT\d{6}$/ }
    }).sort({ patientId: -1 }).toArray();
    
    console.log(`📊 Total patients found: ${patients.length}`);
    
    if (patients.length === 0) {
      console.log('⚠️ No patients found with PAT format');
      return;
    }
    
    // Get the highest patient number
    let maxPatientNumber = 0;
    
    for (const patient of patients) {
      const patientNumber = parseInt(patient.patientId.replace('PAT', ''));
      if (patientNumber > maxPatientNumber) {
        maxPatientNumber = patientNumber;
      }
    }
    
    console.log(`🔢 Highest patient number found: ${maxPatientNumber}`);
    console.log(`👤 Latest patient ID: PAT${String(maxPatientNumber).padStart(6, '0')}`);
    
    // Check current counter value
    const currentCounter = await countersCollection.findOne({ name: counterName });
    console.log(`📊 Current counter value: ${currentCounter?.value || 0}`);
    
    // Update counter to match the highest patient number
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
    
    console.log(`✅ Counter updated successfully!`);
    console.log(`📝 Counter name: ${result.name}`);
    console.log(`🔢 Counter value: ${result.value}`);
    console.log(`🎯 Next patient will get: PAT${String(result.value + 1).padStart(6, '0')}`);
    
    // Verify the fix
    const verifyCounter = await countersCollection.findOne({ name: counterName });
    console.log('✅ Verification - Counter after update:', verifyCounter);
    
    console.log('🎉 Patient counter sync completed successfully!');
    
  } catch (error) {
    console.error('❌ Error fixing patient counter:', error);
  }
};

// Main function
const main = async () => {
  await connectDB();
  await fixPatientCounter();
  await mongoose.connection.close();
  console.log('✅ Database connection closed');
  process.exit(0);
};

// Run the script
main().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
