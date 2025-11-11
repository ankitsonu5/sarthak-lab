const express = require('express');
const Room = require('../models/Room');
const router = express.Router();

// Get all rooms with pagination and search
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const departmentFilter = req.query.department || '';

    // Build query
    let query = {};
    
    if (search) {
      query.$or = [
        { roomNumber: { $regex: search, $options: 'i' } }
      ];
    }

    if (departmentFilter && departmentFilter !== 'all') {
      query.department = departmentFilter;
    }

    const rooms = await Room.find(query)
      .populate('department', 'name code')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Room.countDocuments(query);

    res.json({
      rooms,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ message: 'Error fetching rooms', error: error.message });
  }
});

// Get rooms by department (public route for dropdowns)
router.get('/department/:departmentId', async (req, res) => {
  try {
    const { departmentId } = req.params;
    console.log('🏠 Fetching rooms for department:', departmentId);

    const rooms = await Room.find({
      department: departmentId
    })
      .populate('department', 'name code')
      .select('roomNumber department')
      .sort({ roomNumber: 1 });

    console.log('🏠 Found rooms:', rooms.length);
    res.json(rooms);
  } catch (error) {
    console.error('❌ Error fetching rooms by department:', error);
    res.status(500).json({ message: 'Error fetching rooms by department', error: error.message });
  }
});

// Get room by ID
router.get('/:id', async (req, res) => {
  try {
    const room = await Room.findById(req.params.id).populate('department', 'name code');

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    res.json(room);
  } catch (error) {
    console.error('Error fetching room:', error);
    res.status(500).json({ message: 'Error fetching room', error: error.message });
  }
});

// Create new room
router.post('/', async (req, res) => {
  try {
    const { roomNumber, department } = req.body;

    // Validate required fields
    if (!roomNumber || !department) {
      return res.status(400).json({ 
        message: 'Room number and department are required' 
      });
    }

    // Check if room number already exists
    const existingRoom = await Room.findOne({ 
      roomNumber: roomNumber.startsWith('RN-') ? roomNumber : 'RN-' + roomNumber 
    });
    
    if (existingRoom) {
      return res.status(400).json({ 
        message: 'Room number already exists' 
      });
    }

    const room = new Room({
      roomNumber,
      department,
      isActive: true
    });

    const savedRoom = await room.save();
    const populatedRoom = await Room.findById(savedRoom._id).populate('department', 'name code');

    res.status(201).json(populatedRoom);
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ message: 'Error creating room', error: error.message });
  }
});

// Update room
router.put('/:id', async (req, res) => {
  try {
    const { roomNumber, department, isActive } = req.body;

    // Check if room number already exists (excluding current room)
    if (roomNumber) {
      const formattedRoomNumber = roomNumber.startsWith('RN-') ? roomNumber : 'RN-' + roomNumber;
      const existingRoom = await Room.findOne({ 
        roomNumber: formattedRoomNumber,
        _id: { $ne: req.params.id }
      });
      
      if (existingRoom) {
        return res.status(400).json({ 
          message: 'Room number already exists' 
        });
      }
    }

    // Format room number with RN- prefix
    const formattedRoomNumber = roomNumber.startsWith('RN-') ? roomNumber : 'RN-' + roomNumber;

    const updatedRoom = await Room.findByIdAndUpdate(
      req.params.id,
      { roomNumber: formattedRoomNumber, department, isActive, updatedAt: Date.now() },
      { new: true, runValidators: true }
    ).populate('department', 'name code');

    if (!updatedRoom) {
      return res.status(404).json({ message: 'Room not found' });
    }

    res.json(updatedRoom);
  } catch (error) {
    console.error('Error updating room:', error);
    res.status(500).json({ message: 'Error updating room', error: error.message });
  }
});

// Delete room (permanent delete)
router.delete('/:id', async (req, res) => {
  try {
    const deletedRoom = await Room.findByIdAndDelete(req.params.id);

    if (!deletedRoom) {
      return res.status(404).json({ message: 'Room not found' });
    }

    res.json({ message: 'Room deleted successfully', room: deletedRoom });
  } catch (error) {
    console.error('Error deleting room:', error);
    res.status(500).json({ message: 'Error deleting room', error: error.message });
  }
});

// Restore room
router.patch('/:id/restore', async (req, res) => {
  try {
    const restoredRoom = await Room.findByIdAndUpdate(
      req.params.id,
      { isActive: true, updatedAt: Date.now() },
      { new: true }
    ).populate('department', 'name code');

    if (!restoredRoom) {
      return res.status(404).json({ message: 'Room not found' });
    }

    res.json({ message: 'Room restored successfully', room: restoredRoom });
  } catch (error) {
    console.error('Error restoring room:', error);
    res.status(500).json({ message: 'Error restoring room', error: error.message });
  }
});

module.exports = router;
