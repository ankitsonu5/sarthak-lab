const mongoose = require('mongoose');
require('dotenv').config();

const Appointment = require('./back-end/models/Appointment');
const Counter = require('./back-end/models/Counter');

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

// Initialize counter with current appointment count
const initializeCounter = async () => {
  try {
    console.log('🔢 Initializing appointment counter...');

    // Get current appointment count
    const currentCount = await Appointment.countDocuments();
    console.log(`📊 Current appointment count: ${currentCount}`);

    // Check if counter already exists
    let counter = await Counter.findOne({ name: 'appointmentId' });

    if (counter) {
      console.log(`📊 Existing counter value: ${counter.value}`);

      // Update counter to current count if it's less
      if (counter.value < currentCount) {
        counter.value = currentCount;
        await counter.save();
        console.log(`✅ Updated counter to: ${counter.value}`);
      } else {
        console.log('✅ Counter is already up to date');
      }
    } else {
      // Create new counter
      counter = new Counter({
        name: 'appointmentId',
        value: currentCount
      });
      await counter.save();
      console.log(`✅ Created new counter with value: ${counter.value}`);
    }

    console.log(`🎯 Next appointment ID will be: APT${String(counter.value + 1).padStart(6, '0')}`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await initializeCounter();

  console.log('\n🔄 Closing database connection...');
  await mongoose.connection.close();
  console.log('✅ Database connection closed');
  process.exit(0);
};

main().catch(error => {
  console.error('❌ Script execution error:', error);
  process.exit(1);
});
