const express = require('express');
const router = express.Router();
const PathologyTest = require('../models/PathologyTest');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');

// Get all pathology tests
router.get('/', async (req, res) => {
  try {
    console.log('📋 Fetching all pathology tests...');
    
    const tests = await PathologyTest.find()
      .populate('patient', 'firstName lastName patientId age gender contact')
      .populate('doctor', 'firstName lastName specialization')
      .sort({ createdAt: -1 });
    
    console.log(`✅ Found ${tests.length} pathology tests`);
    
    res.json({
      success: true,
      tests: tests
    });
  } catch (error) {
    console.error('❌ Error fetching pathology tests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pathology tests',
      error: error.message
    });
  }
});

// Get pathology test by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🔍 Fetching pathology test with ID: ${id}`);
    
    const test = await PathologyTest.findById(id)
      .populate('patient', 'firstName lastName patientId age gender contact')
      .populate('doctor', 'firstName lastName specialization');
    
    if (!test) {
      return res.status(404).json({
        success: false,
        message: 'Pathology test not found'
      });
    }
    
    console.log('✅ Pathology test found:', test.testId);
    
    res.json({
      success: true,
      test: test
    });
  } catch (error) {
    console.error('❌ Error fetching pathology test:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pathology test',
      error: error.message
    });
  }
});

// Create new pathology test
router.post('/', async (req, res) => {
  try {
    console.log('🧪 Creating new pathology test...');
    console.log('📋 Request data:', req.body);
    
    const {
      patient,
      doctor,
      testCategory,
      testType,
      selectedTests,
      testNames,
      collectionDate,
      status,
      mode,
      clinicalHistory,
      testParameters,
      technician,
      pathologist,
      remarks,
      cost,
      totalCost,
      isPaid
    } = req.body;
    
    // Validate required fields
    if (!patient) {
      return res.status(400).json({
        success: false,
        message: 'Patient is required'
      });
    }
    
    if (!doctor) {
      return res.status(400).json({
        success: false,
        message: 'Doctor is required'
      });
    }
    
    if (!testCategory) {
      return res.status(400).json({
        success: false,
        message: 'Test category is required'
      });
    }
    
    // Verify patient exists
    const patientExists = await Patient.findById(patient);
    if (!patientExists) {
      return res.status(400).json({
        success: false,
        message: 'Patient not found'
      });
    }
    
    // Verify doctor exists (optional - can be room ID)
    // const doctorExists = await Doctor.findById(doctor);
    // if (!doctorExists) {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Doctor not found'
    //   });
    // }
    
    // Create pathology test data
    const pathologyTestData = {
      patient,
      doctor,
      testCategory,
      testType: testType || 'General',
      selectedTests: selectedTests || [],
      testNames: testNames || 'General Test',
      collectionDate: collectionDate ? new Date(collectionDate) : new Date(),
      status: status || 'Pending',
      mode: mode || 'OPD',
      clinicalHistory: clinicalHistory || '',
      testParameters: testParameters || [],
      technician: technician || '',
      pathologist: pathologist || '',
      remarks: remarks || '',
      cost: cost || 0,
      totalCost: totalCost || cost || 0,
      isPaid: isPaid || false
    };
    
    console.log('🧪 Creating pathology test with data:', pathologyTestData);
    const pathologyTest = new PathologyTest(pathologyTestData);
    
    console.log('💾 Saving pathology test...');
    await pathologyTest.save();
    
    // Populate the saved test
    const populatedTest = await PathologyTest.findById(pathologyTest._id)
      .populate('patient', 'firstName lastName patientId age gender contact')
      .populate('doctor', 'firstName lastName specialization');
    
    console.log('✅ Pathology test created successfully');
    console.log('✅ Test ID:', populatedTest.testId);
    
    res.status(201).json({
      success: true,
      message: 'Pathology test created successfully',
      test: populatedTest
    });
    
  } catch (error) {
    console.error('❌ Error creating pathology test:', error);
    console.error('❌ Error stack:', error.stack);
    
    // Handle validation errors specifically
    if (error.name === 'ValidationError') {
      const validationErrors = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message
      }));
      console.error('❌ Validation errors:', validationErrors);
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to create pathology test'
    });
  }
});

// Update pathology test
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📝 Updating pathology test with ID: ${id}`);
    console.log('📋 Update data:', req.body);
    
    const test = await PathologyTest.findById(id);
    if (!test) {
      return res.status(404).json({
        success: false,
        message: 'Pathology test not found'
      });
    }
    
    // Update the test
    const updatedTest = await PathologyTest.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    )
    .populate('patient', 'firstName lastName patientId age gender contact')
    .populate('doctor', 'firstName lastName specialization');
    
    console.log('✅ Pathology test updated successfully');
    
    res.json({
      success: true,
      message: 'Pathology test updated successfully',
      test: updatedTest
    });
    
  } catch (error) {
    console.error('❌ Error updating pathology test:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to update pathology test'
    });
  }
});

// Delete pathology test
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🗑️ Deleting pathology test with ID: ${id}`);
    
    const test = await PathologyTest.findById(id);
    if (!test) {
      return res.status(404).json({
        success: false,
        message: 'Pathology test not found'
      });
    }
    
    await PathologyTest.findByIdAndDelete(id);
    
    console.log('✅ Pathology test deleted successfully');
    
    res.json({
      success: true,
      message: 'Pathology test deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Error deleting pathology test:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete pathology test',
      error: error.message
    });
  }
});

module.exports = router;
