const mongoose = require('mongoose');
const Appointment = require('./back-end/models/Appointment');

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/hospital_management');
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Check appointment IDs
const checkAppointmentIds = async () => {
  try {
    console.log('🔍 Checking appointment IDs...');
    
    const appointments = await Appointment.find({}, 'appointmentId createdAt')
      .sort({ createdAt: 1 });
    
    console.log(`📋 Total appointments: ${appointments.length}`);
    console.log('\n📊 Appointment IDs in order:');
    
    appointments.forEach((apt, index) => {
      console.log(`${index + 1}. ${apt.appointmentId} - Created: ${apt.createdAt}`);
    });
    
    // Check for duplicates
    const ids = appointments.map(apt => apt.appointmentId);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    
    if (duplicates.length > 0) {
      console.log('\n❌ Duplicate IDs found:', duplicates);
    } else {
      console.log('\n✅ No duplicate IDs found');
    }
    
    // Check sequence
    console.log('\n🔢 Checking sequence...');
    let sequenceIssues = [];
    
    for (let i = 0; i < appointments.length; i++) {
      const expectedId = `APT${String(i + 1).padStart(6, '0')}`;
      const actualId = appointments[i].appointmentId;
      
      if (expectedId !== actualId) {
        sequenceIssues.push({
          position: i + 1,
          expected: expectedId,
          actual: actualId
        });
      }
    }
    
    if (sequenceIssues.length > 0) {
      console.log('❌ Sequence issues found:');
      sequenceIssues.forEach(issue => {
        console.log(`  Position ${issue.position}: Expected ${issue.expected}, Got ${issue.actual}`);
      });
    } else {
      console.log('✅ Sequence is correct');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await checkAppointmentIds();
  
  console.log('\n🔄 Closing database connection...');
  await mongoose.connection.close();
  console.log('✅ Database connection closed');
  process.exit(0);
};

main().catch(error => {
  console.error('❌ Script execution error:', error);
  process.exit(1);
});
