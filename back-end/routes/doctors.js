const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Doctor = require('../models/Doctor');
const Department = require('../models/Department');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/doctors';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'doctor-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Allow common image types including WEBP
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype.toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpg, jpeg, png, gif, webp, svg)'));
    }
  }
});

// Public routes (no authentication required)

// Temporary route to fix doctor names
router.get('/fix-names', async (req, res) => {
  try {
    const doctors = await Doctor.find({});
    const updates = [];

    for (const doctor of doctors) {
      let newName = '';

      if (doctor.name && doctor.name.trim()) {
        continue; // Skip if name already exists
      }

      if (doctor.firstName && doctor.lastName) {
        newName = `${doctor.firstName} ${doctor.lastName}`;
      } else if (doctor.firstName) {
        newName = doctor.firstName;
      } else if (doctor.lastName) {
        newName = doctor.lastName;
      } else if (doctor.doctorId) {
        newName = `Doctor ${doctor.doctorId}`;
      } else {
        newName = `Doctor ${doctor._id.toString().slice(-6)}`;
      }

      await Doctor.findByIdAndUpdate(doctor._id, { name: newName });
      updates.push({ id: doctor._id, oldName: doctor.name, newName });
    }

    res.json({ message: 'Names fixed', updates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check if phone number already exists (public)
router.get('/check-phone', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone is required', exists: false });
    }
    const exists = !!(await Doctor.findOne({ phone }));
    res.json({ success: true, exists });
  } catch (error) {
    console.error('Error checking phone uniqueness:', error);
    res.status(500).json({ success: false, message: error.message, exists: false });
  }
});


// Get all doctors (public list for appointments)
router.get('/list', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', department = '', specialization = '' } = req.query;

    let query = { isActive: true };

    // Add search filters
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') },
        { specialization: new RegExp(search, 'i') },
        { qualification: new RegExp(search, 'i') }
      ];
    }

    if (department) {
      query.department = department;
    }

    if (specialization) {
      query.specialization = new RegExp(specialization, 'i');
    }

    const doctors = await Doctor.find(query)
      .populate('department', 'name code')
      .select('doctorId name firstName lastName email phone specialization qualification experience department licenseNumber registrationDate isActive imageUrl age gender dateOfBirth createdAt fee')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Doctor.countDocuments(query);

    res.json({
      doctors,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Error fetching doctors:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get doctor by ID (public)
router.get('/public/:id', async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id)
      .populate('department', 'name code')
      .select('-email -phone -licenseNumber -address');

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    res.json(doctor);
  } catch (error) {
    console.error('Error fetching doctor:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get doctors by department (public)
router.get('/department/:departmentId', async (req, res) => {
  try {
    const doctors = await Doctor.findByDepartment(req.params.departmentId);
    res.json(doctors);
  } catch (error) {
    console.error('Error fetching doctors by department:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get available slots for a doctor
router.get('/:id/available-slots', async (req, res) => {
  try {
    const { date } = req.query;
    const doctor = await Doctor.findById(req.params.id);

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    if (date) {
      const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
      const daySlots = doctor.getAvailableSlotsForDay(dayName);
      res.json(daySlots);
    } else {
      res.json(doctor.availableSlots);
    }
  } catch (error) {
    console.error('Error fetching available slots:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get meta data
router.get('/meta/departments', async (req, res) => {
  try {
    const departments = await Doctor.distinct('department');
    const populatedDepartments = await Department.find({ _id: { $in: departments } }).select('name');
    res.json(populatedDepartments.map(dept => dept.name));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/meta/specializations', async (req, res) => {
  try {
    const specializations = await Doctor.distinct('specialization');
    res.json(specializations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Protected routes (authentication required)
router.use(authenticateToken);

// Get all doctors (accessible to all authenticated users)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', department = '', specialization = '' } = req.query;

    let query = {};

    // Add search filters
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { specialization: new RegExp(search, 'i') },
        { qualification: new RegExp(search, 'i') },
        { doctorId: new RegExp(search, 'i') }
      ];
    }

    if (department) {
      query.department = department;
    }

    if (specialization) {
      query.specialization = new RegExp(specialization, 'i');
    }

    const doctors = await Doctor.find(query)
      .populate('department', 'name code')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Doctor.countDocuments(query);

    res.json({
      doctors,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Error fetching doctors:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get doctor by ID (accessible to all authenticated users)
router.get('/:id', async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id).populate('department', 'name code');

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    res.json(doctor);
  } catch (error) {
    console.error('Error fetching doctor:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create new doctor (accessible to all authenticated users)
router.post('/', upload.single('image'), async (req, res) => {
  try {
    console.log('Creating new doctor with data:', req.body);

    const doctorData = { ...req.body };

    // Parse JSON fields if they come as strings
    if (typeof doctorData.address === 'string') {
      doctorData.address = JSON.parse(doctorData.address);
    }
    if (typeof doctorData.availableSlots === 'string') {
      doctorData.availableSlots = JSON.parse(doctorData.availableSlots);
    }

    // Handle file upload
    if (req.file) {
      doctorData.imageUrl = `/uploads/doctors/${req.file.filename}`;
    }

    // Validate department exists
    if (doctorData.department) {
      const department = await Department.findById(doctorData.department);
      if (!department) {
        return res.status(400).json({ message: 'Invalid department ID' });
      }
    }

    // Server-side check: ensure phone is unique before save
    if (doctorData.phone) {
      const existing = await Doctor.findOne({ phone: doctorData.phone.trim() });
      if (existing) {
        return res.status(400).json({ message: 'Doctor with this phone already exists' });
      }
    }

    const doctor = new Doctor({ ...doctorData, phone: doctorData.phone?.trim() });
    await doctor.save();

    // Populate department before sending response
    await doctor.populate('department', 'name code');

    console.log('Doctor created successfully:', doctor.doctorId);
    res.status(201).json({
      message: 'Doctor registered successfully',
      doctor
    });
  } catch (error) {
    console.error('Error creating doctor:', error);

    // Delete uploaded file if doctor creation fails
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      res.status(400).json({
        message: `Doctor with this ${field} already exists`
      });
    } else if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      res.status(400).json({
        message: 'Validation error: ' + messages.join(', ')
      });
    } else {
      res.status(500).json({
        message: 'Failed to register doctor: ' + error.message
      });
    }
  }
});

// Update doctor
router.put('/:id', authorizeRoles('Admin'), upload.single('image'), async (req, res) => {
  try {
    console.log('Updating doctor with ID:', req.params.id);
    console.log('Update data:', req.body);

    const doctorData = { ...req.body };

    // Parse JSON fields if they come as strings
    if (typeof doctorData.address === 'string') {
      doctorData.address = JSON.parse(doctorData.address);
    }
    if (typeof doctorData.availableSlots === 'string') {
      doctorData.availableSlots = JSON.parse(doctorData.availableSlots);
    }

    // Handle file upload
    if (req.file) {
      doctorData.imageUrl = `/uploads/doctors/${req.file.filename}`;
    }

    // Validate department exists if provided
    if (doctorData.department) {
      const department = await Department.findById(doctorData.department);
      if (!department) {
        return res.status(400).json({ message: 'Invalid department ID' });
      }
    }

    // If phone is being changed, ensure uniqueness
    if (doctorData.phone) {
      const existing = await Doctor.findOne({ phone: doctorData.phone.trim(), _id: { $ne: req.params.id } });
      if (existing) {
        return res.status(400).json({ message: 'Doctor with this phone already exists' });
      }
    }

    const doctor = await Doctor.findByIdAndUpdate(
      req.params.id,
      { ...doctorData, phone: doctorData.phone?.trim() },
      { new: true, runValidators: true }
    ).populate('department', 'name code');

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    console.log('Doctor updated successfully:', doctor.doctorId);
    res.json({
      message: 'Doctor updated successfully',
      doctor
    });
  } catch (error) {
    console.error('Error updating doctor:', error);

    // Delete uploaded file if update fails
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      res.status(400).json({
        message: `Doctor with this ${field} already exists`
      });
    } else if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      res.status(400).json({
        message: 'Validation error: ' + messages.join(', ')
      });
    } else {
      res.status(500).json({
        message: 'Failed to update doctor: ' + error.message
      });
    }
  }
});

// Delete doctor
router.delete('/:id', authorizeRoles('Admin'), async (req, res) => {
  try {
    console.log('🗑️ DELETE DOCTOR API - ID:', req.params.id);

    const doctor = await Doctor.findById(req.params.id);

    if (!doctor) {
      console.log('❌ Doctor not found:', req.params.id);
      return res.status(404).json({ message: 'Doctor not found' });
    }

    console.log('✅ Doctor found, deleting:', doctor.doctorId, doctor.name);

    // Note: imageUrl is just a URL path, no file deletion needed

    await Doctor.findByIdAndDelete(req.params.id);

    console.log('✅ Doctor deleted successfully from database:', doctor.doctorId);
    res.json({ message: 'Doctor deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting doctor:', error);
    res.status(500).json({ message: error.message });
  }
});

// Toggle doctor active status
router.patch('/:id/toggle-status', authorizeRoles('Admin'), async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    doctor.isActive = !doctor.isActive;
    await doctor.save();

    res.json({
      message: `Doctor ${doctor.isActive ? 'activated' : 'deactivated'} successfully`,
      doctor
    });
  } catch (error) {
    console.error('Error toggling doctor status:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
