const express = require('express');
const router = express.Router();
const DoctorRoomDirectory = require('../models/DoctorRoomDirectory');
const Doctor = require('../models/Doctor');
const Department = require('../models/Department');
const Room = require('../models/Room');

// Get all doctor room directories with pagination and search
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const department = req.query.department || '';
    const room = req.query.room || '';
    const skip = (page - 1) * limit;

    // Build query (filter by ids only here; name search handled after populate)
    let query = {};

    // Keep directoryId search server-side (cheap and indexed)
    if (search) {
      query.$or = [
        { directoryId: new RegExp(search, 'i') }
      ];
    }
    
    if (department) {
      query.department = department;
    }
    
    if (room) {
      query.room = room;
    }

    // Get directories with population
    let directories = await DoctorRoomDirectory.find(query)
      .populate('doctor', 'name doctorId')
      .populate('department', 'name code')
      .populate('room', 'roomNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // If search text provided, filter on populated names in-memory (after populate)
    if (search) {
      const s = String(search).toLowerCase();
      directories = directories.filter(d => {
        const doc = (d.doctor && d.doctor.name) ? d.doctor.name.toLowerCase() : '';
        const dep = (d.department && d.department.name) ? d.department.name.toLowerCase() : '';
        const rn = (d.room && d.room.roomNumber) ? d.room.roomNumber.toLowerCase() : '';
        const id = d.directoryId ? String(d.directoryId).toLowerCase() : '';
        return `${doc} ${dep} ${rn} ${id}`.includes(s);
      });
    }

    // Get total count for pagination
    const total = await DoctorRoomDirectory.countDocuments(query);

    res.json({
      success: true,
      data: directories,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    console.error('Error fetching doctor room directories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctor room directories',
      error: error.message
    });
  }
});

// Get single doctor room directory by ID
router.get('/:id', async (req, res) => {
  try {
    const directory = await DoctorRoomDirectory.findById(req.params.id)
      .populate('doctor', 'name doctorId')
      .populate('department', 'name code')
      .populate('room', 'roomNumber');

    if (!directory) {
      return res.status(404).json({
        success: false,
        message: 'Doctor room directory not found'
      });
    }

    res.json({
      success: true,
      data: directory
    });
  } catch (error) {
    console.error('Error fetching doctor room directory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctor room directory',
      error: error.message
    });
  }
});

// Create new doctor room directory
router.post('/', async (req, res) => {
  try {
    const { doctor, department, room } = req.body;

    // Validate required fields
    if (!doctor || !department || !room) {
      return res.status(400).json({
        success: false,
        message: 'Doctor, department, and room are required'
      });
    }

    // Check if doctor exists
    const doctorExists = await Doctor.findById(doctor);
    if (!doctorExists) {
      return res.status(400).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Check if department exists
    const departmentExists = await Department.findById(department);
    if (!departmentExists) {
      return res.status(400).json({
        success: false,
        message: 'Department not found'
      });
    }

    // Check if room exists
    const roomExists = await Room.findById(room);
    if (!roomExists) {
      return res.status(400).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Check for duplicate assignment
    const existingAssignment = await DoctorRoomDirectory.checkDuplicateAssignment(doctor, room);
    if (existingAssignment) {
      return res.status(400).json({
        success: false,
        message: 'This doctor is already assigned to this room'
      });
    }

    // Create new directory entry
    const directoryData = {
      doctor,
      department,
      room
    };

    const newDirectory = new DoctorRoomDirectory(directoryData);
    const savedDirectory = await newDirectory.save();

    // Populate the saved directory
    const populatedDirectory = await DoctorRoomDirectory.findById(savedDirectory._id)
      .populate('doctor', 'name doctorId')
      .populate('department', 'name code')
      .populate('room', 'roomNumber');

    res.status(201).json({
      success: true,
      message: 'Doctor room directory created successfully',
      data: populatedDirectory
    });
  } catch (error) {
    console.error('Error creating doctor room directory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create doctor room directory',
      error: error.message
    });
  }
});

// Update doctor room directory
router.put('/:id', async (req, res) => {
  try {
    const { doctor, department, room } = req.body;
    const directoryId = req.params.id;

    // Check if directory exists
    const existingDirectory = await DoctorRoomDirectory.findById(directoryId);
    if (!existingDirectory) {
      return res.status(404).json({
        success: false,
        message: 'Doctor room directory not found'
      });
    }

    // Validate required fields
    if (!doctor || !department || !room) {
      return res.status(400).json({
        success: false,
        message: 'Doctor, department, and room are required'
      });
    }

    // Check for duplicate assignment (excluding current record)
    const duplicateAssignment = await DoctorRoomDirectory.checkDuplicateAssignment(doctor, room, directoryId);
    if (duplicateAssignment) {
      return res.status(400).json({
        success: false,
        message: 'This doctor is already assigned to this room'
      });
    }

    // Update directory
    const updateData = {
      doctor,
      department,
      room
    };

    const updatedDirectory = await DoctorRoomDirectory.findByIdAndUpdate(
      directoryId,
      updateData,
      { new: true, runValidators: true }
    ).populate('doctor', 'name doctorId')
     .populate('department', 'name code')
     .populate('room', 'roomNumber');

    res.json({
      success: true,
      message: 'Doctor room directory updated successfully',
      data: updatedDirectory
    });
  } catch (error) {
    console.error('Error updating doctor room directory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update doctor room directory',
      error: error.message
    });
  }
});

// Delete doctor room directory
router.delete('/:id', async (req, res) => {
  try {
    const directory = await DoctorRoomDirectory.findById(req.params.id);
    
    if (!directory) {
      return res.status(404).json({
        success: false,
        message: 'Doctor room directory not found'
      });
    }

    // Hard delete - permanently remove the document
    await DoctorRoomDirectory.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Doctor room directory deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting doctor room directory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete doctor room directory',
      error: error.message
    });
  }
});

// Get available doctors for dropdown
router.get('/dropdowns/doctors', async (req, res) => {
  try {
    const doctors = await Doctor.find({})
      .populate('department', 'name code')
      .select('_id name doctorId department')
      .sort({ name: 1 });

    res.json({
      success: true,
      data: doctors
    });
  } catch (error) {
    console.error('Error fetching doctors:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctors',
      error: error.message
    });
  }
});

// Get available departments for dropdown
router.get('/dropdowns/departments', async (req, res) => {
  try {
    const departments = await Department.find({})
      .select('_id name code')
      .sort({ name: 1 });

    res.json({
      success: true,
      data: departments
    });
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch departments',
      error: error.message
    });
  }
});

// Get available rooms for dropdown
router.get('/dropdowns/rooms', async (req, res) => {
  try {
    const departmentId = req.query.department;
    let query = {};

    if (departmentId) {
      query.department = departmentId;
    }

    console.log('🏠 Fetching rooms with query:', query);

    const rooms = await Room.find(query)
      .select('_id roomNumber department')
      .populate('department', 'name')
      .sort({ roomNumber: 1 });

    console.log('🏠 Found rooms:', rooms.length);
    console.log('🏠 First room:', rooms[0]);

    res.json({
      success: true,
      data: rooms
    });
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rooms',
      error: error.message
    });
  }
});

module.exports = router;
