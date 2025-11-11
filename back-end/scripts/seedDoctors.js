const mongoose = require('mongoose');
const Doctor = require('../models/Doctor');

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/hospital_management', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB Connected for seeding doctors');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// 10 Doctors Data with Different Departments
const doctorsData = [
  {
    doctorId: 'DOC000001',
    firstName: 'Rajesh',
    lastName: 'Sharma',
    email: 'rajesh.sharma@hospital.com',
    phone: '9876543210',
    specialization: 'Cardiology',
    qualification: 'MD Cardiology, MBBS',
    experience: 15,
    department: 'Cardiology',
    licenseNumber: 'MH12345678',
    availableSlots: [
      { day: 'Monday', startTime: '09:00', endTime: '17:00' },
      { day: 'Tuesday', startTime: '09:00', endTime: '17:00' },
      { day: 'Wednesday', startTime: '09:00', endTime: '17:00' },
      { day: 'Thursday', startTime: '09:00', endTime: '17:00' },
      { day: 'Friday', startTime: '09:00', endTime: '17:00' }
    ],
    address: {
      street: '123 Medical Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      zipCode: '400001',
      country: 'India'
    }
  },
  {
    doctorId: 'DOC000002',
    firstName: 'Priya',
    lastName: 'Patel',
    email: 'priya.patel@hospital.com',
    phone: '9876543211',
    specialization: 'Pediatrics',
    qualification: 'MD Pediatrics, MBBS',
    experience: 12,
    department: 'Pediatrics',
    licenseNumber: 'MH12345679',
    availableSlots: [
      { day: 'Monday', startTime: '10:00', endTime: '18:00' },
      { day: 'Tuesday', startTime: '10:00', endTime: '18:00' },
      { day: 'Wednesday', startTime: '10:00', endTime: '18:00' },
      { day: 'Thursday', startTime: '10:00', endTime: '18:00' },
      { day: 'Saturday', startTime: '10:00', endTime: '14:00' }
    ],
    address: {
      street: '456 Children Avenue',
      city: 'Delhi',
      state: 'Delhi',
      zipCode: '110001',
      country: 'India'
    }
  },
  {
    doctorId: 'DOC000003',
    firstName: 'Amit',
    lastName: 'Singh',
    email: 'amit.singh@hospital.com',
    phone: '9876543212',
    specialization: 'Orthopedics',
    qualification: 'MS Orthopedics, MBBS',
    experience: 18,
    department: 'Orthopedics',
    licenseNumber: 'MH12345680',
    availableSlots: [
      { day: 'Monday', startTime: '08:00', endTime: '16:00' },
      { day: 'Tuesday', startTime: '08:00', endTime: '16:00' },
      { day: 'Wednesday', startTime: '08:00', endTime: '16:00' },
      { day: 'Thursday', startTime: '08:00', endTime: '16:00' },
      { day: 'Friday', startTime: '08:00', endTime: '16:00' }
    ],
    address: {
      street: '789 Bone Care Road',
      city: 'Bangalore',
      state: 'Karnataka',
      zipCode: '560001',
      country: 'India'
    }
  },
  {
    doctorId: 'DOC000004',
    firstName: 'Sunita',
    lastName: 'Gupta',
    email: 'sunita.gupta@hospital.com',
    phone: '9876543213',
    specialization: 'Gynecology',
    qualification: 'MD Gynecology, MBBS',
    experience: 14,
    department: 'Gynecology',
    licenseNumber: 'MH12345681',
    availableSlots: [
      { day: 'Monday', startTime: '09:30', endTime: '17:30' },
      { day: 'Tuesday', startTime: '09:30', endTime: '17:30' },
      { day: 'Wednesday', startTime: '09:30', endTime: '17:30' },
      { day: 'Thursday', startTime: '09:30', endTime: '17:30' },
      { day: 'Saturday', startTime: '09:30', endTime: '13:30' }
    ],
    address: {
      street: '321 Women Health Center',
      city: 'Chennai',
      state: 'Tamil Nadu',
      zipCode: '600001',
      country: 'India'
    }
  },
  {
    doctorId: 'DOC000005',
    firstName: 'Vikram',
    lastName: 'Joshi',
    email: 'vikram.joshi@hospital.com',
    phone: '9876543214',
    specialization: 'Neurology',
    qualification: 'DM Neurology, MD Medicine, MBBS',
    experience: 20,
    department: 'Neurology',
    licenseNumber: 'MH12345682',
    availableSlots: [
      { day: 'Monday', startTime: '10:00', endTime: '18:00' },
      { day: 'Tuesday', startTime: '10:00', endTime: '18:00' },
      { day: 'Wednesday', startTime: '10:00', endTime: '18:00' },
      { day: 'Thursday', startTime: '10:00', endTime: '18:00' },
      { day: 'Friday', startTime: '10:00', endTime: '18:00' }
    ],
    address: {
      street: '654 Brain Care Institute',
      city: 'Pune',
      state: 'Maharashtra',
      zipCode: '411001',
      country: 'India'
    }
  },
  {
    doctorId: 'DOC000006',
    firstName: 'Kavita',
    lastName: 'Reddy',
    email: 'kavita.reddy@hospital.com',
    phone: '9876543215',
    specialization: 'Dermatology',
    qualification: 'MD Dermatology, MBBS',
    experience: 10,
    department: 'Dermatology',
    licenseNumber: 'MH12345683',
    availableSlots: [
      { day: 'Monday', startTime: '11:00', endTime: '19:00' },
      { day: 'Tuesday', startTime: '11:00', endTime: '19:00' },
      { day: 'Wednesday', startTime: '11:00', endTime: '19:00' },
      { day: 'Thursday', startTime: '11:00', endTime: '19:00' },
      { day: 'Saturday', startTime: '11:00', endTime: '15:00' }
    ],
    address: {
      street: '987 Skin Care Clinic',
      city: 'Hyderabad',
      state: 'Telangana',
      zipCode: '500001',
      country: 'India'
    }
  },
  {
    doctorId: 'DOC000007',
    firstName: 'Ravi',
    lastName: 'Kumar',
    email: 'ravi.kumar@hospital.com',
    phone: '9876543216',
    specialization: 'General Surgery',
    qualification: 'MS General Surgery, MBBS',
    experience: 16,
    department: 'Surgery',
    licenseNumber: 'MH12345684',
    availableSlots: [
      { day: 'Monday', startTime: '07:00', endTime: '15:00' },
      { day: 'Tuesday', startTime: '07:00', endTime: '15:00' },
      { day: 'Wednesday', startTime: '07:00', endTime: '15:00' },
      { day: 'Thursday', startTime: '07:00', endTime: '15:00' },
      { day: 'Friday', startTime: '07:00', endTime: '15:00' }
    ],
    address: {
      street: '147 Surgery Center',
      city: 'Kolkata',
      state: 'West Bengal',
      zipCode: '700001',
      country: 'India'
    }
  },
  {
    doctorId: 'DOC000008',
    firstName: 'Meera',
    lastName: 'Agarwal',
    email: 'meera.agarwal@hospital.com',
    phone: '9876543217',
    specialization: 'Ophthalmology',
    qualification: 'MS Ophthalmology, MBBS',
    experience: 13,
    department: 'Ophthalmology',
    licenseNumber: 'MH12345685',
    availableSlots: [
      { day: 'Monday', startTime: '09:00', endTime: '17:00' },
      { day: 'Tuesday', startTime: '09:00', endTime: '17:00' },
      { day: 'Wednesday', startTime: '09:00', endTime: '17:00' },
      { day: 'Thursday', startTime: '09:00', endTime: '17:00' },
      { day: 'Saturday', startTime: '09:00', endTime: '13:00' }
    ],
    address: {
      street: '258 Eye Care Hospital',
      city: 'Jaipur',
      state: 'Rajasthan',
      zipCode: '302001',
      country: 'India'
    }
  },
  {
    doctorId: 'DOC000009',
    firstName: 'Arjun',
    lastName: 'Nair',
    email: 'arjun.nair@hospital.com',
    phone: '9876543218',
    specialization: 'Psychiatry',
    qualification: 'MD Psychiatry, MBBS',
    experience: 11,
    department: 'Psychiatry',
    licenseNumber: 'MH12345686',
    availableSlots: [
      { day: 'Monday', startTime: '10:00', endTime: '18:00' },
      { day: 'Tuesday', startTime: '10:00', endTime: '18:00' },
      { day: 'Wednesday', startTime: '10:00', endTime: '18:00' },
      { day: 'Thursday', startTime: '10:00', endTime: '18:00' },
      { day: 'Friday', startTime: '10:00', endTime: '18:00' }
    ],
    address: {
      street: '369 Mental Health Center',
      city: 'Kochi',
      state: 'Kerala',
      zipCode: '682001',
      country: 'India'
    }
  },
  {
    doctorId: 'DOC000010',
    firstName: 'Deepika',
    lastName: 'Verma',
    email: 'deepika.verma@hospital.com',
    phone: '9876543219',
    specialization: 'Ayurveda',
    qualification: 'BAMS, MD Ayurveda',
    experience: 8,
    department: 'KAYACHIKITSHA',
    licenseNumber: 'MH12345687',
    availableSlots: [
      { day: 'Monday', startTime: '08:00', endTime: '16:00' },
      { day: 'Tuesday', startTime: '08:00', endTime: '16:00' },
      { day: 'Wednesday', startTime: '08:00', endTime: '16:00' },
      { day: 'Thursday', startTime: '08:00', endTime: '16:00' },
      { day: 'Friday', startTime: '08:00', endTime: '16:00' },
      { day: 'Saturday', startTime: '08:00', endTime: '12:00' }
    ],
    address: {
      street: '741 Ayurveda Clinic',
      city: 'Varanasi',
      state: 'Uttar Pradesh',
      zipCode: '221001',
      country: 'India'
    }
  }
];

// Seed function
const seedDoctors = async () => {
  try {
    console.log('🌱 Starting doctor seeding...');
    
    // Clear existing doctors (optional)
    await Doctor.deleteMany({});
    console.log('🗑️ Cleared existing doctors');
    
    // Insert new doctors
    const insertedDoctors = await Doctor.insertMany(doctorsData);
    console.log(`✅ Successfully inserted ${insertedDoctors.length} doctors`);
    
    // Display inserted doctors
    insertedDoctors.forEach((doctor, index) => {
      console.log(`${index + 1}. Dr. ${doctor.firstName} ${doctor.lastName} - ${doctor.department} (${doctor.doctorId})`);
    });
    
    console.log('🎉 Doctor seeding completed successfully!');
    
  } catch (error) {
    console.error('❌ Error seeding doctors:', error);
  } finally {
    mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
};

// Run the seeding
const runSeed = async () => {
  await connectDB();
  await seedDoctors();
};

// Execute if run directly
if (require.main === module) {
  runSeed();
}

module.exports = { seedDoctors, doctorsData };
