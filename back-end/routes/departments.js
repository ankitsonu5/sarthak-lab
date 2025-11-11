const express = require('express');
const Department = require('../models/Department');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');
const router = express.Router();

// Get all departments (public route for dropdowns)
router.get('/list', async (req, res) => {
  try {
    const departments = await Department.find({})
      .select('_id name code')
      .sort({ name: 1 });

    // Return direct array instead of object
    res.json(departments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Migration endpoint to add departmentId to existing departments (public for setup)
router.post('/migrate-department-ids', async (req, res) => {
  try {
    console.log('🔄 Starting department ID migration...');

    // Find all departments without departmentId
    const departmentsWithoutId = await Department.find({
      $or: [
        { departmentId: { $exists: false } },
        { departmentId: null },
        { departmentId: '' }
      ]
    }).sort({ createdAt: 1 });

    console.log(`📋 Found ${departmentsWithoutId.length} departments without departmentId`);

    if (departmentsWithoutId.length === 0) {
      return res.json({
        message: 'All departments already have departmentId',
        updated: 0
      });
    }

    // Update each department with new departmentId
    let updated = 0;
    for (let i = 0; i < departmentsWithoutId.length; i++) {
      const department = departmentsWithoutId[i];
      const departmentId = `DEP${(i + 1).toString().padStart(5, '0')}`;

      await Department.findByIdAndUpdate(department._id, {
        departmentId: departmentId
      });

      console.log(`✅ Updated ${department.name} with ID: ${departmentId}`);
      updated++;
    }

    console.log(`🎉 Migration completed! Updated ${updated} departments`);

    res.json({
      message: `Successfully updated ${updated} departments with departmentId`,
      updated: updated
    });
  } catch (error) {
    console.error('❌ Migration failed:', error);
    res.status(500).json({ message: error.message });
  }
});

// Test endpoint for creating department (temporarily public)
router.post('/test-create', async (req, res) => {
  try {
    const { name, code } = req.body;

    const department = new Department({
      name,
      code
    });

    const savedDepartment = await department.save();
    res.status(201).json(savedDepartment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Protected routes (authentication required)
router.use(authenticateToken);

// Get all departments with pagination and search
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;

    // Build search query
    let query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }

    // Execute query with pagination
    const departments = await Department.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Get total count for pagination
    const total = await Department.countDocuments(query);

    res.json({
      departments,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get department by ID
router.get('/:id', async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);
    
    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }
    
    res.json(department);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new department
router.post('/', async (req, res) => {
  try {
    const { name, code } = req.body;

    // Check if department with same name already exists
    const existingDepartment = await Department.findOne({
      name: { $regex: new RegExp(`^${name}$`, 'i') }
    });

    if (existingDepartment) {
      return res.status(400).json({ message: 'Department with this name already exists' });
    }

    // Check if code is provided and unique
    if (code) {
      const existingCode = await Department.findOne({
        code: { $regex: new RegExp(`^${code}$`, 'i') }
      });

      if (existingCode) {
        return res.status(400).json({ message: 'Department with this code already exists' });
      }
    }

    const department = new Department({
      name,
      code
    });

    const savedDepartment = await department.save();
    res.status(201).json(savedDepartment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update department
router.put('/:id', async (req, res) => {
  try {
    const { name, code } = req.body;
    
    // Check if department exists
    const department = await Department.findById(req.params.id);
    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }
    
    // Check if name is being changed and if new name already exists
    if (name && name !== department.name) {
      const existingDepartment = await Department.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: req.params.id }
      });
      
      if (existingDepartment) {
        return res.status(400).json({ message: 'Department with this name already exists' });
      }
    }
    
    // Check if code is being changed and if new code already exists
    if (code && code !== department.code) {
      const existingCode = await Department.findOne({ 
        code: { $regex: new RegExp(`^${code}$`, 'i') },
        _id: { $ne: req.params.id }
      });
      
      if (existingCode) {
        return res.status(400).json({ message: 'Department with this code already exists' });
      }
    }
    
    // Update department
    const updatedDepartment = await Department.findByIdAndUpdate(
      req.params.id,
      { name, code, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );
    
    res.json(updatedDepartment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete department (hard delete - permanently remove)
router.delete('/:id', async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);

    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }

    // Hard delete - permanently remove from database
    await Department.findByIdAndDelete(req.params.id);

    res.json({ message: 'Department deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Restore department (set isActive to true)
router.patch('/:id/restore', async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);
    
    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }
    
    // Restore - set isActive to true
    const restoredDepartment = await Department.findByIdAndUpdate(
      req.params.id,
      { isActive: true, updatedAt: Date.now() },
      { new: true }
    );
    
    res.json(restoredDepartment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get department statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const totalDepartments = await Department.countDocuments();

    res.json({
      total: totalDepartments
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
