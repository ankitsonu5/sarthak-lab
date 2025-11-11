const mongoose = require('mongoose');
const Doctor = require('../models/Doctor');
const Department = require('../models/Department');
require('dotenv').config();

const createSampleDoctors = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hospital_management');
    console.log('Connected to MongoDB');

    // Check if doctors already exist
    const existingDoctors = await Doctor.countDocuments();
    if (existingDoctors > 0) {
      console.log('Doctors already exist in database. Skipping creation.');
      process.exit(0);
    }

    // Get all departments
    const departments = await Department.find({ isActive: true });
    if (departments.length === 0) {
      console.log('No departments found. Please create departments first.');
      process.exit(1);
    }

    console.log(`Found ${departments.length} departments`);

    // Sample doctor data
    const sampleDoctors = [
      {
        firstName: 'Rajesh',
        lastName: 'Sharma',
        email: 'dr.rajesh.sharma@hospital.com',
        phone: '9876543210',
        specialization: 'Interventional Cardiology',
        qualification: 'MBBS, MD (Cardiology), DM (Cardiology)',
        experience: 15,
        department: departments.find(d => d.name === 'Cardiology')?._id,
        licenseNumber: 'MH12345678',
        consultationFee: 1500,
        address: {
          street: '123 Medical Plaza',
          city: 'Mumbai',
          state: 'Maharashtra',
          zipCode: '400001',
          country: 'India'
        },
        availableSlots: [
          { day: 'Monday', startTime: '09:00', endTime: '13:00' },
          { day: 'Tuesday', startTime: '09:00', endTime: '13:00' },
          { day: 'Wednesday', startTime: '09:00', endTime: '13:00' },
          { day: 'Thursday', startTime: '09:00', endTime: '13:00' },
          { day: 'Friday', startTime: '09:00', endTime: '13:00' }
        ],
        isActive: true
      },
      {
        firstName: 'Priya',
        lastName: 'Patel',
        email: 'dr.priya.patel@hospital.com',
        phone: '9876543211',
        specialization: 'Pediatric Neurology',
        qualification: 'MBBS, MD (Pediatrics), DM (Neurology)',
        experience: 12,
        department: departments.find(d => d.name === 'Neurology')?._id,
        licenseNumber: 'MH12345679',
        consultationFee: 1200,
        address: {
          street: '456 Health Center',
          city: 'Pune',
          state: 'Maharashtra',
          zipCode: '411001',
          country: 'India'
        },
        availableSlots: [
          { day: 'Monday', startTime: '14:00', endTime: '18:00' },
          { day: 'Wednesday', startTime: '14:00', endTime: '18:00' },
          { day: 'Friday', startTime: '14:00', endTime: '18:00' },
          { day: 'Saturday', startTime: '09:00', endTime: '13:00' }
        ],
        isActive: true
      },
      {
        firstName: 'Amit',
        lastName: 'Singh',
        email: 'dr.amit.singh@hospital.com',
        phone: '9876543212',
        specialization: 'Joint Replacement Surgery',
        qualification: 'MBBS, MS (Orthopedics)',
        experience: 18,
        department: departments.find(d => d.name === 'Orthopedics')?._id,
        licenseNumber: 'MH12345680',
        consultationFee: 1800,
        address: {
          street: '789 Bone Care Clinic',
          city: 'Delhi',
          state: 'Delhi',
          zipCode: '110001',
          country: 'India'
        },
        availableSlots: [
          { day: 'Tuesday', startTime: '10:00', endTime: '14:00' },
          { day: 'Thursday', startTime: '10:00', endTime: '14:00' },
          { day: 'Saturday', startTime: '10:00', endTime: '14:00' }
        ],
        isActive: true
      },
      {
        firstName: 'Sunita',
        lastName: 'Gupta',
        email: 'dr.sunita.gupta@hospital.com',
        phone: '9876543213',
        specialization: 'Child Development',
        qualification: 'MBBS, MD (Pediatrics)',
        experience: 10,
        department: departments.find(d => d.name === 'Pediatrics')?._id,
        licenseNumber: 'MH12345681',
        consultationFee: 1000,
        address: {
          street: '321 Kids Care Center',
          city: 'Bangalore',
          state: 'Karnataka',
          zipCode: '560001',
          country: 'India'
        },
        availableSlots: [
          { day: 'Monday', startTime: '15:00', endTime: '19:00' },
          { day: 'Tuesday', startTime: '15:00', endTime: '19:00' },
          { day: 'Wednesday', startTime: '15:00', endTime: '19:00' },
          { day: 'Thursday', startTime: '15:00', endTime: '19:00' },
          { day: 'Friday', startTime: '15:00', endTime: '19:00' }
        ],
        isActive: true
      },
      {
        firstName: 'Kavita',
        lastName: 'Reddy',
        email: 'dr.kavita.reddy@hospital.com',
        phone: '9876543214',
        specialization: 'High Risk Pregnancy',
        qualification: 'MBBS, MS (Gynecology)',
        experience: 14,
        department: departments.find(d => d.name === 'Gynecology')?._id,
        licenseNumber: 'MH12345682',
        consultationFee: 1300,
        address: {
          street: '654 Women Care Hospital',
          city: 'Chennai',
          state: 'Tamil Nadu',
          zipCode: '600001',
          country: 'India'
        },
        availableSlots: [
          { day: 'Monday', startTime: '09:00', endTime: '12:00' },
          { day: 'Wednesday', startTime: '09:00', endTime: '12:00' },
          { day: 'Friday', startTime: '09:00', endTime: '12:00' },
          { day: 'Saturday', startTime: '14:00', endTime: '17:00' }
        ],
        isActive: true
      },
      {
        firstName: 'Vikram',
        lastName: 'Joshi',
        email: 'dr.vikram.joshi@hospital.com',
        phone: '9876543215',
        specialization: 'Internal Medicine',
        qualification: 'MBBS, MD (General Medicine)',
        experience: 8,
        department: departments.find(d => d.name === 'General Medicine')?._id,
        licenseNumber: 'MH12345683',
        consultationFee: 800,
        address: {
          street: '987 General Hospital',
          city: 'Hyderabad',
          state: 'Telangana',
          zipCode: '500001',
          country: 'India'
        },
        availableSlots: [
          { day: 'Monday', startTime: '08:00', endTime: '12:00' },
          { day: 'Tuesday', startTime: '08:00', endTime: '12:00' },
          { day: 'Wednesday', startTime: '08:00', endTime: '12:00' },
          { day: 'Thursday', startTime: '08:00', endTime: '12:00' },
          { day: 'Friday', startTime: '08:00', endTime: '12:00' },
          { day: 'Saturday', startTime: '08:00', endTime: '12:00' }
        ],
        isActive: true
      },
      {
        firstName: 'Deepak',
        lastName: 'Kumar',
        email: 'dr.deepak.kumar@hospital.com',
        phone: '9876543216',
        specialization: 'Laparoscopic Surgery',
        qualification: 'MBBS, MS (General Surgery)',
        experience: 16,
        department: departments.find(d => d.name === 'Surgery')?._id,
        licenseNumber: 'MH12345684',
        consultationFee: 2000,
        address: {
          street: '147 Surgical Center',
          city: 'Kolkata',
          state: 'West Bengal',
          zipCode: '700001',
          country: 'India'
        },
        availableSlots: [
          { day: 'Tuesday', startTime: '07:00', endTime: '11:00' },
          { day: 'Thursday', startTime: '07:00', endTime: '11:00' },
          { day: 'Saturday', startTime: '07:00', endTime: '11:00' }
        ],
        isActive: true
      },
      {
        firstName: 'Meera',
        lastName: 'Nair',
        email: 'dr.meera.nair@hospital.com',
        phone: '9876543217',
        specialization: 'Cosmetic Dermatology',
        qualification: 'MBBS, MD (Dermatology)',
        experience: 9,
        department: departments.find(d => d.name === 'Dermatology')?._id,
        licenseNumber: 'MH12345685',
        consultationFee: 1100,
        address: {
          street: '258 Skin Care Clinic',
          city: 'Ahmedabad',
          state: 'Gujarat',
          zipCode: '380001',
          country: 'India'
        },
        availableSlots: [
          { day: 'Monday', startTime: '16:00', endTime: '20:00' },
          { day: 'Wednesday', startTime: '16:00', endTime: '20:00' },
          { day: 'Friday', startTime: '16:00', endTime: '20:00' }
        ],
        isActive: true
      },
      {
        firstName: 'Ravi',
        lastName: 'Agarwal',
        email: 'dr.ravi.agarwal@hospital.com',
        phone: '9876543218',
        specialization: 'Retinal Surgery',
        qualification: 'MBBS, MS (Ophthalmology)',
        experience: 13,
        department: departments.find(d => d.name === 'Ophthalmology')?._id,
        licenseNumber: 'MH12345686',
        consultationFee: 1400,
        address: {
          street: '369 Eye Care Center',
          city: 'Jaipur',
          state: 'Rajasthan',
          zipCode: '302001',
          country: 'India'
        },
        availableSlots: [
          { day: 'Monday', startTime: '10:00', endTime: '14:00' },
          { day: 'Tuesday', startTime: '10:00', endTime: '14:00' },
          { day: 'Thursday', startTime: '10:00', endTime: '14:00' },
          { day: 'Friday', startTime: '10:00', endTime: '14:00' }
        ],
        isActive: true
      },
      {
        firstName: 'Anita',
        lastName: 'Verma',
        email: 'dr.anita.verma@hospital.com',
        phone: '9876543219',
        specialization: 'Cochlear Implant Surgery',
        qualification: 'MBBS, MS (ENT)',
        experience: 11,
        department: departments.find(d => d.name === 'ENT')?._id,
        licenseNumber: 'MH12345687',
        consultationFee: 1250,
        address: {
          street: '741 ENT Specialty Clinic',
          city: 'Lucknow',
          state: 'Uttar Pradesh',
          zipCode: '226001',
          country: 'India'
        },
        availableSlots: [
          { day: 'Tuesday', startTime: '14:00', endTime: '18:00' },
          { day: 'Wednesday', startTime: '14:00', endTime: '18:00' },
          { day: 'Thursday', startTime: '14:00', endTime: '18:00' },
          { day: 'Saturday', startTime: '09:00', endTime: '13:00' }
        ],
        isActive: true
      }
    ];

    // Filter out doctors with invalid departments
    const validDoctors = sampleDoctors.filter(doctor => doctor.department);
    
    if (validDoctors.length === 0) {
      console.log('No valid departments found for doctors. Please check department data.');
      process.exit(1);
    }

    // Create doctors
    const createdDoctors = await Doctor.insertMany(validDoctors);
    
    console.log('✅ Sample doctors created successfully!');
    console.log(`📊 Total doctors created: ${createdDoctors.length}`);
    
    createdDoctors.forEach(doctor => {
      console.log(`   - Dr. ${doctor.firstName} ${doctor.lastName} (${doctor.specialization}) - ${doctor.doctorId}`);
    });

  } catch (error) {
    console.error('❌ Error creating sample doctors:', error);
  } finally {
    mongoose.connection.close();
  }
};

createSampleDoctors();
