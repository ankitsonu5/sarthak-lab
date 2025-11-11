const mongoose = require('mongoose');
const Room = require('./back-end/models/Room');

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

// Get first room ID
const getRoomId = async () => {
  try {
    const room = await Room.findOne();
    if (room) {
      console.log('🏥 Found room:', room.roomNumber);
      console.log('🆔 Room ID:', room._id);
      console.log('🆔 Room ID (string):', room._id.toString());
    } else {
      console.log('❌ No rooms found');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await getRoomId();
  
  console.log('🔄 Closing database connection...');
  await mongoose.connection.close();
  console.log('✅ Database connection closed');
  process.exit(0);
};

main().catch(error => {
  console.error('❌ Script execution error:', error);
  process.exit(1);
});
