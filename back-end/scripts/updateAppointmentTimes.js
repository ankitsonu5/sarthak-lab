const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/hospital_management', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Function to generate random realistic appointment times
const generateRandomTime = () => {
  const hours = [9, 10, 11, 12, 14, 15, 16, 17]; // 9 AM to 5 PM (excluding lunch 12-2)
  const minutes = ['00', '15', '30', '45']; // 15-minute intervals
  
  const randomHour = hours[Math.floor(Math.random() * hours.length)];
  const randomMinute = minutes[Math.floor(Math.random() * minutes.length)];
  
  return `${randomHour.toString().padStart(2, '0')}:${randomMinute}`;
};

// Update appointment times
const updateAppointmentTimes = async () => {
  try {
    console.log('🔄 Starting appointment time update...');
    
    // Find all appointments with time "10:00"
    const appointments = await Appointment.find({ appointmentTime: '10:00' });
    console.log(`📋 Found ${appointments.length} appointments with time "10:00"`);
    
    if (appointments.length === 0) {
      console.log('✅ No appointments found with time "10:00"');
      return;
    }
    
    // Update each appointment with random realistic time
    for (let appointment of appointments) {
      const newTime = generateRandomTime();
      
      await Appointment.findByIdAndUpdate(
        appointment._id,
        { appointmentTime: newTime },
        { new: true }
      );
      
      console.log(`✅ Updated appointment ${appointment.appointmentId}: ${appointment.appointmentTime} → ${newTime}`);
    }
    
    console.log(`🎉 Successfully updated ${appointments.length} appointment times!`);
    
  } catch (error) {
    console.error('❌ Error updating appointment times:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await updateAppointmentTimes();
  
  console.log('🔄 Closing database connection...');
  await mongoose.connection.close();
  console.log('✅ Database connection closed');
  process.exit(0);
};

// Run the script
main().catch(error => {
  console.error('❌ Script execution error:', error);
  process.exit(1);
});
