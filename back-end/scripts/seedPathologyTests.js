const mongoose = require('mongoose');
const ServiceHead = require('../models/ServiceHead');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hospital_management';

const pathologyTests = [
  // PATHOLOGY Tests
  { category: 'PATHOLOGY', testName: 'Complete Blood Count (CBC)', price: 300 },
  { category: 'PATHOLOGY', testName: 'Blood Sugar Fasting', price: 150 },
  { category: 'PATHOLOGY', testName: 'Blood Sugar Random', price: 120 },
  { category: 'PATHOLOGY', testName: 'HbA1c (Glycated Hemoglobin)', price: 500 },
  { category: 'PATHOLOGY', testName: 'Lipid Profile', price: 600 },
  { category: 'PATHOLOGY', testName: 'Liver Function Test (LFT)', price: 450 },
  { category: 'PATHOLOGY', testName: 'Kidney Function Test (KFT)', price: 400 },
  { category: 'PATHOLOGY', testName: 'Thyroid Profile (T3, T4, TSH)', price: 700 },
  { category: 'PATHOLOGY', testName: 'Urine Routine & Microscopy', price: 200 },
  { category: 'PATHOLOGY', testName: 'Stool Routine & Microscopy', price: 180 },
  { category: 'PATHOLOGY', testName: 'ESR (Erythrocyte Sedimentation Rate)', price: 100 },
  { category: 'PATHOLOGY', testName: 'CRP (C-Reactive Protein)', price: 250 },
  { category: 'PATHOLOGY', testName: 'Vitamin D3', price: 800 },
  { category: 'PATHOLOGY', testName: 'Vitamin B12', price: 600 },
  { category: 'PATHOLOGY', testName: 'Iron Studies', price: 550 },
  { category: 'PATHOLOGY', testName: 'Hepatitis B Surface Antigen', price: 300 },
  { category: 'PATHOLOGY', testName: 'HIV Test', price: 400 },
  { category: 'PATHOLOGY', testName: 'Malaria Parasite', price: 200 },
  { category: 'PATHOLOGY', testName: 'Dengue NS1 Antigen', price: 500 },
  { category: 'PATHOLOGY', testName: 'Typhoid Test (Widal)', price: 250 },

  // X-RAY Tests
  { category: 'X-RAY', testName: 'Chest X-Ray PA View', price: 400 },
  { category: 'X-RAY', testName: 'Chest X-Ray Lateral View', price: 450 },
  { category: 'X-RAY', testName: 'Abdomen X-Ray', price: 500 },
  { category: 'X-RAY', testName: 'Spine X-Ray (Cervical)', price: 600 },
  { category: 'X-RAY', testName: 'Spine X-Ray (Lumbar)', price: 650 },
  { category: 'X-RAY', testName: 'Knee Joint X-Ray', price: 550 },
  { category: 'X-RAY', testName: 'Shoulder Joint X-Ray', price: 550 },
  { category: 'X-RAY', testName: 'Hand X-Ray', price: 450 },
  { category: 'X-RAY', testName: 'Foot X-Ray', price: 450 },
  { category: 'X-RAY', testName: 'Pelvis X-Ray', price: 600 },

  // ECG Tests
  { category: 'ECG', testName: 'Resting ECG (12 Lead)', price: 200 },
  { category: 'ECG', testName: 'Exercise Stress Test (TMT)', price: 800 },
  { category: 'ECG', testName: 'Holter Monitoring (24 Hours)', price: 1500 },
  { category: 'ECG', testName: 'Echo Cardiography', price: 1200 },

  // SHALAKYA Tests (ENT/Eye related)
  { category: 'SHALAKYA', testName: 'Visual Acuity Test', price: 150 },
  { category: 'SHALAKYA', testName: 'Fundus Examination', price: 300 },
  { category: 'SHALAKYA', testName: 'Intraocular Pressure (IOP)', price: 250 },
  { category: 'SHALAKYA', testName: 'Audiometry Test', price: 400 },
  { category: 'SHALAKYA', testName: 'Nasal Endoscopy', price: 600 },
  { category: 'SHALAKYA', testName: 'Throat Swab Culture', price: 350 },

  // SHALYA Tests (Surgery related)
  { category: 'SHALYA', testName: 'Pre-operative Profile', price: 1000 },
  { category: 'SHALYA', testName: 'Bleeding Time & Clotting Time', price: 200 },
  { category: 'SHALYA', testName: 'Prothrombin Time (PT/INR)', price: 300 },
  { category: 'SHALYA', testName: 'APTT (Activated Partial Thromboplastin Time)', price: 350 },
  { category: 'SHALYA', testName: 'Blood Grouping & Cross Matching', price: 400 },

  // PANCHKARMA Tests (Ayurvedic treatments)
  { category: 'PANCHKARMA', testName: 'Prakriti Analysis', price: 500 },
  { category: 'PANCHKARMA', testName: 'Pulse Diagnosis (Nadi Pariksha)', price: 300 },
  { category: 'PANCHKARMA', testName: 'Dosha Assessment', price: 400 },
  { category: 'PANCHKARMA', testName: 'Agni Assessment', price: 250 },
  { category: 'PANCHKARMA', testName: 'Ojas Assessment', price: 300 }
];

async function seedPathologyTests() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('🧪 Seeding pathology tests...');

    // Clear existing pathology tests
    await ServiceHead.deleteMany({ 
      category: { 
        $in: ['PATHOLOGY', 'X-RAY', 'ECG', 'SHALAKYA', 'SHALYA', 'PANCHKARMA'] 
      } 
    });
    console.log('🗑️ Cleared existing pathology tests');

    // Insert new tests
    const insertedTests = await ServiceHead.insertMany(pathologyTests);
    console.log(`✅ Successfully seeded ${insertedTests.length} pathology tests`);

    // Display summary by category
    const categories = ['PATHOLOGY', 'X-RAY', 'ECG', 'SHALAKYA', 'SHALYA', 'PANCHKARMA'];
    
    console.log('\n📊 Tests by Category:');
    for (const category of categories) {
      const count = await ServiceHead.countDocuments({ category });
      console.log(`  ${category}: ${count} tests`);
    }

    console.log('\n🎯 Sample tests:');
    const sampleTests = await ServiceHead.find().limit(5);
    sampleTests.forEach(test => {
      console.log(`  📋 ${test.testName} (${test.category}) - ₹${test.price}`);
    });

    console.log('\n✅ Pathology tests seeding completed successfully!');

  } catch (error) {
    console.error('❌ Error seeding pathology tests:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the seeding function
if (require.main === module) {
  seedPathologyTests();
}

module.exports = seedPathologyTests;
