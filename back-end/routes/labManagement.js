const express = require('express');
const router = express.Router();
const Lab = require('../models/Lab');
const User = require('../models/User');
const Patient = require('../models/Patient');
const PathologyRegistration = require('../models/PathologyRegistration');
const { authenticateToken } = require('../middlewares/auth');

/**
 * @route   POST /api/lab-management/register
 * @desc    Register a new lab (public endpoint)
 * @access  Public
 */
router.post('/register', async (req, res) => {
  try {
    const {
      labName,
      email,
      phone,
      address,
      city,
      state,
      country,
      pincode,
      adminFirstName,
      adminLastName,
      adminEmail,
      adminPhone,
      password
    } = req.body;

    console.log('🏥 New lab registration request:', { labName, email });

    // Validation
    if (!labName || !email || !password || !adminFirstName || !adminEmail) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: labName, email, password, adminFirstName, adminEmail'
      });
    }

    // Check if lab email already exists
    const existingLab = await Lab.findOne({ email: email.toLowerCase() });
    if (existingLab) {
      return res.status(409).json({
        success: false,
        message: 'A lab with this email already exists'
      });
    }

    // Check if admin email already exists
    const existingUser = await User.findOne({ email: adminEmail.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email already exists'
      });
    }

    // Generate unique lab code
    const labCode = await Lab.generateLabCode();

    // Calculate trial end date (30 days / 1 month from now)
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 30);

    // Calculate subscription end date (same as trial for now)
    const subscriptionEndsAt = new Date(trialEndsAt);

    // Create lab with auto-approval and active trial
    const lab = new Lab({
      labCode,
      labName,
      email: email.toLowerCase(),
      phone,
      address,
      city,
      state,
      country: country || 'India',
      pincode,
      subscriptionPlan: 'trial',
      subscriptionStatus: 'active', // Auto-activate trial
      trialEndsAt,
      subscriptionEndsAt,
      approvalStatus: 'approved', // Auto-approve new registrations
      approvedAt: new Date(),
      totalUsers: 1 // Will be created below
    });

    await lab.save();

    // Default routes for LabAdmin - full pathology access
    const defaultLabAdminRoutes = [
      // Setup
      '/setup/doctors', '/setup/doctors/doctor-list', '/setup/category-heads', '/setup/prefixes',
      '/setup/pathology/test-master', '/setup/pathology/test-entry', '/setup/pathology/test-database',
      '/setup/pathology/test-panels', '/setup/pathology/reference-ranges',
      // Patients
      '/reception/search-patient', '/reception/patient-registration',
      // Tests / Lab Reports
      '/pathology/test-report', '/pathology/all-reports', '/pathology/reports-records', '/pathology/test-summary',
      // Appointments / Sample Collection
      '/appointments', '/pathology/scheduled-tests', '/pathology/registration',
      // Billing / Payments
      '/cash-receipt/register-opt-ipd', '/billing', '/cash-receipt/edit-history',
      // Inventory
      '/inventory/manage', '/inventory/stock-expiry',
      // Analytics / Reports
      '/reporting/daily-cash-report', '/reporting/daily-cash-summary',
      // Lab Setup
      '/lab-setup', '/lab-setup/template-setup'
    ];

    // Create lab admin user
    const adminUser = new User({
      labId: lab._id,
      username: adminEmail.split('@')[0],
      email: adminEmail.toLowerCase(),
      password, // Will be hashed by pre-save hook
      role: 'LabAdmin',
      firstName: adminFirstName,
      lastName: adminLastName || '',
      phone: adminPhone || phone,
      isActive: true,
      allowedRoutes: defaultLabAdminRoutes
    });

    await adminUser.save();

    console.log('✅ Lab registered successfully:', labCode);
    console.log('🎉 Auto-approved with 30-day free trial');

    res.status(201).json({
      success: true,
      message: 'Lab registered successfully! Your 30-day free trial has started. You can login now.',
      lab: {
        id: lab._id,
        labCode: lab.labCode,
        labName: lab.labName,
        email: lab.email,
        subscriptionPlan: lab.subscriptionPlan,
        subscriptionStatus: lab.subscriptionStatus,
        approvalStatus: lab.approvalStatus,
        trialEndsAt: lab.trialEndsAt
      },
      admin: {
        id: adminUser._id,
        email: adminUser.email,
        name: `${adminUser.firstName} ${adminUser.lastName}`.trim(),
        role: adminUser.role
      },
      trial: {
        duration: '30 days',
        endsAt: lab.trialEndsAt,
        daysRemaining: 30
      }
    });

  } catch (error) {
    console.error('❌ Lab registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register lab',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/lab-management/labs
 * @desc    Get all labs (Super Admin only)
 * @access  Private (SuperAdmin)
 */
router.get('/labs', authenticateToken, async (req, res) => {
  try {
    console.log('🔍 Fetching labs for SuperAdmin...');
    const user = req.user;

    if (user.role !== 'SuperAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super Admin only.'
      });
    }

    const { status, plan, page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    let filter = { deletedAt: null };

    if (status) {
      filter.approvalStatus = status;
    }

    if (plan) {
      filter.subscriptionPlan = plan;
    }

    // Get total count
    console.log('📊 Counting labs with filter:', filter);
    const total = await Lab.countDocuments(filter);
    console.log('📊 Total labs found:', total);

    // Get labs with pagination
    console.log('🔍 Fetching labs from database...');
    const labs = await Lab.find(filter)
      .select('-settings -deletedAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    console.log('✅ Labs fetched:', labs.length);

    // Fetch admin user for each lab
    console.log('👤 Fetching admin users for labs...');
    const labsWithAdmin = await Promise.all(labs.map(async (lab) => {
      const labObj = lab.toObject();

      try {
        // Find the lab admin user
        const adminUser = await User.findOne({
          labId: lab._id,
          role: 'LabAdmin'
        }).select('firstName lastName email profilePicture').lean();

        if (adminUser) {
          labObj.adminUser = {
            _id: adminUser._id,
            firstName: adminUser.firstName,
            lastName: adminUser.lastName,
            email: adminUser.email,
            profilePicture: adminUser.profilePicture
          };
        }
      } catch (err) {
        console.error(`⚠️ Error fetching admin for lab ${lab._id}:`, err.message);
        // Continue without admin user data
      }

      return labObj;
    }));

    console.log('✅ Admin users fetched. Sending response...');
    res.json({
      success: true,
      labs: labsWithAdmin,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    console.log('✅ Response sent successfully!');

  } catch (error) {
    console.error('❌ Error fetching labs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch labs',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/lab-management/my-lab
 * @desc    Get current user's lab details
 * @access  Private (Lab users)
 */
router.get('/my-lab', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (!user.labId) {
      return res.status(400).json({
        success: false,
        message: 'Lab context not found'
      });
    }

    const lab = await Lab.findById(user.labId);

    if (!lab) {
      return res.status(404).json({
        success: false,
        message: 'Lab not found'
      });
    }

    res.json({
      success: true,
      lab
    });

  } catch (error) {
    console.error('❌ Error fetching lab details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch lab details',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/lab-management/labs/:id/approve
 * @desc    Approve a lab (Super Admin only)
 * @access  Private (SuperAdmin)
 */
router.put('/labs/:id/approve', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== 'SuperAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super Admin only.'
      });
    }

    const labId = req.params.id;

    const lab = await Lab.findOneAndUpdate(
      { _id: labId, approvalStatus: 'pending' },
      {
        approvalStatus: 'approved',
        subscriptionStatus: 'active',
        approvedBy: user.userId,
        approvedAt: new Date()
      },
      { new: true }
    );

    if (!lab) {
      return res.status(404).json({
        success: false,
        message: 'Lab not found or already processed'
      });
    }

    console.log('✅ Lab approved:', lab.labCode);

    res.json({
      success: true,
      message: 'Lab approved successfully',
      lab: {
        id: lab._id,
        labName: lab.labName,
        labCode: lab.labCode,
        email: lab.email
      }
    });

  } catch (error) {
    console.error('❌ Error approving lab:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve lab',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/lab-management/labs/:id/reject
 * @desc    Reject a lab (Super Admin only)
 * @access  Private (SuperAdmin)
 */
router.put('/labs/:id/reject', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== 'SuperAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super Admin only.'
      });
    }

    const labId = req.params.id;
    const { reason } = req.body;

    const lab = await Lab.findOneAndUpdate(
      { _id: labId, approvalStatus: 'pending' },
      {
        approvalStatus: 'rejected',
        rejectionReason: reason || 'No reason provided',
        approvedBy: user.userId,
        approvedAt: new Date()
      },
      { new: true }
    );

    if (!lab) {
      return res.status(404).json({
        success: false,
        message: 'Lab not found or already processed'
      });
    }

    console.log('❌ Lab rejected:', lab.labCode);

    res.json({
      success: true,
      message: 'Lab rejected',
      lab: {
        id: lab._id,
        labName: lab.labName,
        labCode: lab.labCode,
        email: lab.email,
        rejectionReason: lab.rejectionReason
      }
    });

  } catch (error) {
    console.error('❌ Error rejecting lab:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject lab',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/lab-management/labs/:id
 * @desc    Get single lab profile (Super Admin only)
 * @access  Private (SuperAdmin)
 */
router.get('/labs/:id', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    // Only Super Admin can access
    if (user.role !== 'SuperAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super Admin only.'
      });
    }

    const lab = await Lab.findById(req.params.id)
      .populate('approvedBy', 'firstName lastName email');

    if (!lab) {
      return res.status(404).json({
        success: false,
        message: 'Lab not found'
      });
    }

    // Get usage stats
    // Note: Multi-tenant labId filtering will be added when models are updated
    const totalUsers = await User.countDocuments({ labId: lab.labCode }).catch(() => 0);
    const totalPatients = await Patient.countDocuments({}).catch(() => 0); // No labId field yet
    const totalReports = await PathologyRegistration.countDocuments({}).catch(() => 0); // No labId field yet

    // Get monthly reports (current month)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const monthlyReports = await PathologyRegistration.countDocuments({
      createdAt: { $gte: startOfMonth }
    }).catch(() => 0);

    // Add stats to lab object
    const labData = lab.toObject();
    labData.totalUsers = totalUsers || 0;
    labData.totalPatients = totalPatients || 0;
    labData.totalReports = totalReports || 0;
    labData.monthlyReports = monthlyReports || 0;

    res.json({
      success: true,
      lab: labData
    });

  } catch (error) {
    console.error('❌ Error fetching lab profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/lab-management/labs/:id/users
 * @desc    Get all users of a specific lab (Super Admin only)
 * @access  Private (SuperAdmin)
 */
router.get('/labs/:id/users', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    // Only Super Admin can access
    if (user.role !== 'SuperAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super Admin only.'
      });
    }

    const users = await User.find({ labId: req.params.id })
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      users,
      count: users.length
    });

  } catch (error) {
    console.error('❌ Error fetching lab users:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;

