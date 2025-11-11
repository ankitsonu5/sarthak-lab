const mongoose = require('mongoose');
require('dotenv').config();

const PathologyTest = require('./back-end/models/PathologyTest');
const Patient = require('./back-end/models/Patient');
const Doctor = require('./back-end/models/Doctor');

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

// Sample pathology test data
const samplePathologyTests = [
  {
    testCategory: 'PATHOLOGY',
    testType: 'Blood Test',
    selectedTests: [
      {
        testName: 'Complete Blood Count (CBC)',
        testType: 'Blood Test',
        price: 300,
        description: 'Complete blood count with differential',
        parameters: [
          { parameterName: 'Hemoglobin', normalRange: '12-16 g/dL', unit: 'g/dL', isRequired: true },
          { parameterName: 'WBC Count', normalRange: '4000-11000 /μL', unit: '/μL', isRequired: true },
          { parameterName: 'RBC Count', normalRange: '4.5-5.5 million/μL', unit: 'million/μL', isRequired: true }
        ]
      }
    ],
    testNames: 'Complete Blood Count (CBC)',
    collectionDate: new Date('2025-07-06'),
    status: 'Pending',
    mode: 'OPD',
    cost: 300,
    totalCost: 300,
    isPaid: false,
    remarks: 'Routine checkup'
  },
  {
    testCategory: 'PATHOLOGY',
    testType: 'Blood Test',
    selectedTests: [
      {
        testName: 'Blood Sugar (Fasting)',
        testType: 'Blood Test',
        price: 150,
        description: 'Fasting blood glucose test',
        parameters: [
          { parameterName: 'Glucose', normalRange: '70-100 mg/dL', unit: 'mg/dL', isRequired: true }
        ]
      },
      {
        testName: 'Lipid Profile',
        testType: 'Blood Test',
        price: 500,
        description: 'Complete lipid panel',
        parameters: [
          { parameterName: 'Total Cholesterol', normalRange: '<200 mg/dL', unit: 'mg/dL', isRequired: true },
          { parameterName: 'HDL Cholesterol', normalRange: '>40 mg/dL', unit: 'mg/dL', isRequired: true }
        ]
      }
    ],
    testNames: 'Blood Sugar (Fasting), Lipid Profile',
    collectionDate: new Date('2025-07-05'),
    status: 'Sample Collected',
    mode: 'OPD',
    cost: 650,
    totalCost: 650,
    isPaid: true,
    remarks: 'Diabetes screening'
  },
  {
    testCategory: 'X-RAY',
    testType: 'Chest X-Ray',
    selectedTests: [
      {
        testName: 'Chest X-Ray PA View',
        testType: 'Chest X-Ray',
        price: 400,
        description: 'Posterior-anterior chest X-ray',
        parameters: [
          { parameterName: 'Heart Size', normalRange: 'Normal', unit: '', isRequired: true },
          { parameterName: 'Lung Fields', normalRange: 'Clear', unit: '', isRequired: true }
        ]
      }
    ],
    testNames: 'Chest X-Ray PA View',
    collectionDate: new Date('2025-07-04'),
    status: 'Completed',
    mode: 'OPD',
    cost: 400,
    totalCost: 400,
    isPaid: true,
    remarks: 'Pre-employment medical'
  },
  {
    testCategory: 'PATHOLOGY',
    testType: 'Urine Test',
    selectedTests: [
      {
        testName: 'Urine Routine & Microscopy',
        testType: 'Urine Test',
        price: 200,
        description: 'Complete urine analysis',
        parameters: [
          { parameterName: 'Protein', normalRange: 'Negative', unit: '', isRequired: true },
          { parameterName: 'Sugar', normalRange: 'Negative', unit: '', isRequired: true },
          { parameterName: 'Pus Cells', normalRange: '0-5 /hpf', unit: '/hpf', isRequired: true }
        ]
      }
    ],
    testNames: 'Urine Routine & Microscopy',
    collectionDate: new Date('2025-07-03'),
    status: 'Reported',
    mode: 'IPD',
    cost: 200,
    totalCost: 200,
    isPaid: true,
    remarks: 'UTI investigation'
  },
  {
    testCategory: 'ECG',
    testType: 'Resting ECG',
    selectedTests: [
      {
        testName: '12-Lead ECG',
        testType: 'Resting ECG',
        price: 200,
        description: 'Standard 12-lead electrocardiogram',
        parameters: [
          { parameterName: 'Heart Rate', normalRange: '60-100 bpm', unit: 'bpm', isRequired: true },
          { parameterName: 'Rhythm', normalRange: 'Sinus Rhythm', unit: '', isRequired: true }
        ]
      }
    ],
    testNames: '12-Lead ECG',
    collectionDate: new Date('2025-07-02'),
    status: 'In Progress',
    mode: 'Emergency',
    cost: 200,
    totalCost: 200,
    isPaid: false,
    remarks: 'Chest pain evaluation'
  }
];

// Seed pathology data
const seedPathologyData = async () => {
  try {
    console.log('🌱 Seeding pathology test data...');

    // Get first patient and doctor for reference
    const patient = await Patient.findOne();
    const doctor = await Doctor.findOne();

    if (!patient) {
      console.log('❌ No patients found. Please create patients first.');
      return;
    }

    if (!doctor) {
      console.log('❌ No doctors found. Please create doctors first.');
      return;
    }

    console.log(`👤 Using patient: ${patient.firstName} ${patient.lastName} (${patient.patientId})`);
    console.log(`👨‍⚕️ Using doctor: ${doctor.firstName} ${doctor.lastName}`);

    // Clear existing pathology tests
    await PathologyTest.deleteMany({});
    console.log('🗑️ Cleared existing pathology tests');

    // Add patient and doctor references to sample data
    const pathologyTestsWithRefs = samplePathologyTests.map(test => ({
      ...test,
      patient: patient._id,
      doctor: doctor._id
    }));

    // Insert sample data
    const createdTests = await PathologyTest.insertMany(pathologyTestsWithRefs);

    console.log(`✅ Created ${createdTests.length} pathology tests:`);

    // Display created tests
    for (const test of createdTests) {
      console.log(`  📋 ${test.testId} - ${test.testNames} (${test.status}) - ₹${test.totalCost}`);
    }

    console.log('\n📊 Test Status Summary:');
    const statusCounts = await PathologyTest.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    statusCounts.forEach(status => {
      console.log(`  ${status._id}: ${status.count} tests`);
    });

    console.log('\n💰 Revenue Summary:');
    const revenueData = await PathologyTest.aggregate([
      { $group: {
          _id: '$isPaid',
          totalAmount: { $sum: '$totalCost' },
          count: { $sum: 1 }
        }
      }
    ]);

    revenueData.forEach(revenue => {
      const status = revenue._id ? 'Paid' : 'Pending';
      console.log(`  ${status}: ₹${revenue.totalAmount} (${revenue.count} tests)`);
    });

  } catch (error) {
    console.error('❌ Error seeding pathology data:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await seedPathologyData();

  console.log('\n🔄 Closing database connection...');
  await mongoose.connection.close();
  console.log('✅ Database connection closed');
  process.exit(0);
};

main().catch(error => {
  console.error('❌ Script execution error:', error);
  process.exit(1);
});
