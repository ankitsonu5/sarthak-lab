const mongoose = require('mongoose');
const Doctor = require('../models/Doctor');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/hospital_management', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function fixDoctorNames() {
  try {
    console.log('Starting doctor name fix...');

    // Find all doctors
    const allDoctors = await Doctor.find({});
    console.log(`Found ${allDoctors.length} total doctors`);

    // Also try to find the specific doctor from API response
    const specificDoctor = await Doctor.findById('6873e04cdb1c304c5ae108f0');
    if (specificDoctor) {
      console.log('Found specific doctor:', specificDoctor);
      allDoctors.push(specificDoctor);
    }

    for (const doctor of allDoctors) {
      console.log(`Doctor ${doctor._id}:`, {
        name: doctor.name,
        firstName: doctor.firstName,
        lastName: doctor.lastName,
        doctorId: doctor.doctorId
      });

      let newName = '';

      // Try to construct name from firstName and lastName
      if (doctor.firstName && doctor.lastName) {
        newName = `${doctor.firstName} ${doctor.lastName}`;
      } else if (doctor.firstName) {
        newName = doctor.firstName;
      } else if (doctor.lastName) {
        newName = doctor.lastName;
      } else if (doctor.doctorId) {
        newName = `Doctor ${doctor.doctorId}`;
      } else {
        // Use doctor ID as fallback
        newName = `Doctor ${doctor._id.toString().slice(-6)}`;
      }

      // Update the doctor
      const result = await Doctor.findByIdAndUpdate(
        doctor._id,
        { name: newName },
        { new: true }
      );
      console.log(`Updated doctor ${doctor._id}: ${newName} -> Result:`, result.name);
    }

    console.log('Doctor name fix completed!');
    process.exit(0);
  } catch (error) {
    console.error('Error fixing doctor names:', error);
    process.exit(1);
  }
}

fixDoctorNames();
