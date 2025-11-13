const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { query, transaction } = require('../config/postgres');
const { multiTenantMiddleware } = require('../middleware/multiTenant');
const { authMiddleware } = require('../middleware/auth');

/**
 * @route   POST /api/labs/register
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
    const existingLab = await query(
      'SELECT id FROM labs WHERE email = $1',
      [email]
    );

    if (existingLab.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A lab with this email already exists'
      });
    }

    // Check if admin email already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1',
      [adminEmail]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email already exists'
      });
    }

    // Generate unique lab code
    const labCodeResult = await query(
      'SELECT COUNT(*) as count FROM labs'
    );
    const labCount = parseInt(labCodeResult.rows[0].count) + 1;
    const labCode = `LAB${String(labCount).padStart(5, '0')}`;

    // Calculate trial end date (14 days from now)
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create lab and admin user in a transaction
    const result = await transaction(async (client) => {
      // Create lab
      const labResult = await client.query(
        `INSERT INTO labs (
          lab_name, lab_code, email, phone, address, city, state, country, pincode,
          subscription_plan, subscription_status, trial_ends_at, approval_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id, lab_code, lab_name, email, subscription_plan, trial_ends_at`,
        [
          labName, labCode, email, phone, address, city, state, country || 'India', pincode,
          'trial', 'pending', trialEndsAt, 'pending'
        ]
      );

      const lab = labResult.rows[0];

      // Create lab admin user
      const userResult = await client.query(
        `INSERT INTO users (
          lab_id, email, password_hash, first_name, last_name, phone, role, is_active, email_verified
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, email, first_name, last_name, role`,
        [
          lab.id, adminEmail, passwordHash, adminFirstName, adminLastName, adminPhone,
          'LabAdmin', true, false
        ]
      );

      const admin = userResult.rows[0];

      // Update lab's total_users count
      await client.query(
        'UPDATE labs SET total_users = 1 WHERE id = $1',
        [lab.id]
      );

      return { lab, admin };
    });

    console.log('✅ Lab registered successfully:', result.lab.lab_code);

    res.status(201).json({
      success: true,
      message: 'Lab registered successfully. Awaiting admin approval.',
      lab: {
        id: result.lab.id,
        labCode: result.lab.lab_code,
        labName: result.lab.lab_name,
        email: result.lab.email,
        subscriptionPlan: result.lab.subscription_plan,
        trialEndsAt: result.lab.trial_ends_at
      },
      admin: {
        id: result.admin.id,
        email: result.admin.email,
        name: `${result.admin.first_name} ${result.admin.last_name}`,
        role: result.admin.role
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
 * @route   GET /api/labs
 * @desc    Get all labs (Super Admin only)
 * @access  Private (SuperAdmin)
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== 'SuperAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super Admin only.'
      });
    }

    const { status, plan, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE deleted_at IS NULL';
    const params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      whereClause += ` AND approval_status = $${paramCount}`;
      params.push(status);
    }

    if (plan) {
      paramCount++;
      whereClause += ` AND subscription_plan = $${paramCount}`;
      params.push(plan);
    }

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM labs ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Get labs with pagination
    const labsResult = await query(
      `SELECT 
        id, lab_name, lab_code, email, phone, city, state,
        subscription_plan, subscription_status, approval_status,
        total_patients, total_reports, total_users,
        trial_ends_at, created_at
      FROM labs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      labs: labsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

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
 * @route   GET /api/labs/my-lab
 * @desc    Get current user's lab details
 * @access  Private (Lab users)
 */
router.get('/my-lab', authMiddleware, multiTenantMiddleware, async (req, res) => {
  try {
    const labId = req.labId;

    if (!labId) {
      return res.status(400).json({
        success: false,
        message: 'Lab context not found'
      });
    }

    const labResult = await query(
      `SELECT 
        id, lab_name, lab_code, email, phone, address, city, state, country, pincode,
        logo_url, side_logo_url, primary_color, secondary_color, header_note, footer_note,
        subscription_plan, subscription_status, trial_ends_at, subscription_ends_at,
        total_patients, total_reports, total_users,
        created_at
      FROM labs
      WHERE id = $1 AND deleted_at IS NULL`,
      [labId]
    );

    if (labResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lab not found'
      });
    }

    res.json({
      success: true,
      lab: labResult.rows[0]
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
 * @route   PUT /api/labs/:id/approve
 * @desc    Approve a lab (Super Admin only)
 * @access  Private (SuperAdmin)
 */
router.put('/:id/approve', authMiddleware, async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== 'SuperAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super Admin only.'
      });
    }

    const labId = req.params.id;

    const result = await query(
      `UPDATE labs
      SET approval_status = 'approved',
          subscription_status = 'active',
          approved_by = $1,
          approved_at = NOW(),
          updated_at = NOW()
      WHERE id = $2 AND approval_status = 'pending'
      RETURNING id, lab_name, lab_code, email`,
      [user.userId, labId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lab not found or already processed'
      });
    }

    console.log('✅ Lab approved:', result.rows[0].lab_code);

    res.json({
      success: true,
      message: 'Lab approved successfully',
      lab: result.rows[0]
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

module.exports = router;

