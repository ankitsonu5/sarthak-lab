const mongoose = require('mongoose');
const Doctor = require('../models/Doctor');

const verifyDoctors = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/hospital_management');
    console.log('✅ Connected to MongoDB');
    
    const doctors = await Doctor.find({}, 'doctorId firstName lastName department specialization').sort({doctorId: 1});
    
    console.log('\n📋 Doctors in Database:');
    console.log('='.repeat(60));
    
    doctors.forEach((doc, i) => {
      console.log(`${i+1}. ${doc.doctorId} - Dr. ${doc.firstName} ${doc.lastName}`);
      console.log(`   Department: ${doc.department}`);
      console.log(`   Specialization: ${doc.specialization}`);
      console.log('');
    });
    
    console.log(`\n✅ Total Doctors: ${doctors.length}`);
    
    // Group by department
    const departments = {};
    doctors.forEach(doc => {
      if (!departments[doc.department]) {
        departments[doc.department] = [];
      }
      departments[doc.department].push(`Dr. ${doc.firstName} ${doc.lastName}`);
    });
    
    console.log('\n🏥 Doctors by Department:');
    console.log('='.repeat(60));
    Object.keys(departments).forEach(dept => {
      console.log(`${dept}:`);
      departments[dept].forEach(doctor => {
        console.log(`  - ${doctor}`);
      });
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
};

verifyDoctors();
