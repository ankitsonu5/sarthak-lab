const express = require('express');
const Prescription = require('../models/Prescription');
const { authenticateToken, requirePermissions, authorizeRoles } = require('../middlewares/auth');
const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get all prescriptions (Role-based access)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, status = '', patientId = '' } = req.query;
    
    let query = {};
    
    // Role-based filtering
    if (req.user.role === 'Patient') {
      query.patient = req.user._id;
    } else if (req.user.role === 'Doctor') {
      query.doctor = req.user._id;
    }
    // Admin can see all prescriptions
    
    if (status) query.status = status;
    if (patientId && req.user.role !== 'Patient') query.patient = patientId;

    const prescriptions = await Prescription.find(query)
      .populate('patient', 'firstName lastName patientId email phone')
      .populate('doctor', 'firstName lastName doctorId specialization')
      .populate('appointment', 'appointmentId appointmentDate')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ prescribedDate: -1 });

    const total = await Prescription.countDocuments(query);

    res.json({
      prescriptions,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get prescription by ID
router.get('/:id', async (req, res) => {
  try {
    let query = { _id: req.params.id };
    
    // Role-based access control
    if (req.user.role === 'Patient') {
      query.patient = req.user._id;
    } else if (req.user.role === 'Doctor') {
      query.doctor = req.user._id;
    }
    
    const prescription = await Prescription.findOne(query)
      .populate('patient', 'firstName lastName patientId email phone dateOfBirth')
      .populate('doctor', 'firstName lastName doctorId specialization qualification')
      .populate('appointment', 'appointmentId appointmentDate appointmentTime');
      
    if (!prescription) {
      return res.status(404).json({ message: 'Prescription not found or access denied' });
    }
    
    res.json(prescription);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new prescription (Only Doctors and Admin)
router.post('/', requirePermissions('create_prescriptions', 'manage_prescriptions'), async (req, res) => {
  try {
    const prescriptionData = {
      ...req.body,
      doctor: req.user.role === 'Doctor' ? req.user._id : req.body.doctor,
      prescribedDate: new Date()
    };
    
    const prescription = new Prescription(prescriptionData);
    await prescription.save();
    
    await prescription.populate('patient', 'firstName lastName patientId');
    await prescription.populate('doctor', 'firstName lastName doctorId specialization');
    await prescription.populate('appointment', 'appointmentId appointmentDate');
    
    res.status(201).json({
      message: 'Prescription created successfully',
      prescription
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update prescription (Only the prescribing doctor or Admin)
router.put('/:id', async (req, res) => {
  try {
    let query = { _id: req.params.id };
    
    // Only the prescribing doctor or admin can update
    if (req.user.role === 'Doctor') {
      query.doctor = req.user._id;
    }
    
    const prescription = await Prescription.findOneAndUpdate(
      query,
      req.body,
      { new: true, runValidators: true }
    ).populate('patient', 'firstName lastName patientId')
     .populate('doctor', 'firstName lastName doctorId specialization');
    
    if (!prescription) {
      return res.status(404).json({ message: 'Prescription not found or access denied' });
    }
    
    res.json({
      message: 'Prescription updated successfully',
      prescription
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});


// Cancel prescription (Only the prescribing doctor or Admin)
router.patch('/:id/cancel', async (req, res) => {
  try {
    let query = { _id: req.params.id };
    
    if (req.user.role === 'Doctor') {
      query.doctor = req.user._id;
    }
    
    const prescription = await Prescription.findOneAndUpdate(
      query,
      { status: 'Cancelled' },
      { new: true }
    ).populate('patient', 'firstName lastName patientId')
     .populate('doctor', 'firstName lastName doctorId specialization');
    
    if (!prescription) {
      return res.status(404).json({ message: 'Prescription not found or access denied' });
    }
    
    res.json({
      message: 'Prescription cancelled successfully',
      prescription
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get prescriptions by patient (Doctors and Admin only)
router.get('/patient/:patientId', requirePermissions('view_patients', 'manage_patients'), async (req, res) => {
  try {
    const prescriptions = await Prescription.find({ patient: req.params.patientId })
      .populate('doctor', 'firstName lastName doctorId specialization')
      .populate('appointment', 'appointmentId appointmentDate')
      .sort({ prescribedDate: -1 });
    
    res.json(prescriptions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get active prescriptions for a patient
router.get('/patient/:patientId/active', async (req, res) => {
  try {
    let query = { 
      patient: req.params.patientId, 
      status: 'Active',
      validUntil: { $gte: new Date() }
    };
    
    // Patients can only see their own active prescriptions
    if (req.user.role === 'Patient' && req.user._id.toString() !== req.params.patientId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const prescriptions = await Prescription.find(query)
      .populate('doctor', 'firstName lastName doctorId specialization')
      .sort({ prescribedDate: -1 });
    
    res.json(prescriptions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete prescription (Only Admin)
router.delete('/:id', authorizeRoles('Admin'), async (req, res) => {
  try {
    const prescription = await Prescription.findByIdAndDelete(req.params.id);
    
    if (!prescription) {
      return res.status(404).json({ message: 'Prescription not found' });
    }
    
    res.json({ message: 'Prescription deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
