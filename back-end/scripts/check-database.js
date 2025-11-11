const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/hospital_management', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function checkDatabase() {
  try {
    console.log('Checking database...');
    
    // List all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));
    
    // Check doctors collection
    const doctorsCollection = mongoose.connection.db.collection('doctors');
    const allDoctors = await doctorsCollection.find({}).toArray();
    console.log(`Found ${allDoctors.length} doctors in collection`);
    
    allDoctors.forEach(doctor => {
      console.log(`Doctor ${doctor._id}:`, {
        name: doctor.name,
        firstName: doctor.firstName,
        lastName: doctor.lastName,
        doctorId: doctor.doctorId
      });
    });
    
    // Try to find the specific doctor
    const specificDoctor = await doctorsCollection.findOne({ _id: new mongoose.Types.ObjectId('6873e04cdb1c304c5ae108f0') });
    if (specificDoctor) {
      console.log('Found specific doctor:', specificDoctor);
    } else {
      console.log('Specific doctor not found');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error checking database:', error);
    process.exit(1);
  }
}

checkDatabase();
