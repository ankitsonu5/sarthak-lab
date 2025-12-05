const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { query } = require('../config/postgres');
const { generateToken, authMiddleware } = require('../middleware/auth');
const { sendEmail } = require('../utils/mailer');

/**
 * @route   POST /api/auth/login
 * @desc    Login user (works for all roles including SuperAdmin)
 * @access  Public
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 Login attempt for:', email);

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user
    const userResult = await query(
      `SELECT 
        u.id, u.lab_id, u.email, u.password_hash, u.first_name, u.last_name, 
        u.role, u.permissions, u.is_active,
        l.lab_name, l.lab_code, l.subscription_plan, l.subscription_status, 
        l.approval_status, l.trial_ends_at
      FROM users u
      LEFT JOIN labs l ON u.lab_id = l.id
      WHERE u.email = $1 AND u.deleted_at IS NULL`,
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = userResult.rows[0];

    // Check if user is active
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact administrator.'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check lab approval status (for non-SuperAdmin users)
    if (user.role !== 'SuperAdmin') {
      if (user.approval_status === 'pending') {
        return res.status(403).json({
          success: false,
          message: 'Your lab registration is pending approval. Please wait for admin approval.',
          approvalStatus: 'pending'
        });
      }

      if (user.approval_status === 'rejected') {
        return res.status(403).json({
          success: false,
          message: 'Your lab registration has been rejected. Please contact support.',
          approvalStatus: 'rejected'
        });
      }

      // Check subscription status
      if (user.subscription_status === 'expired' || user.subscription_status === 'cancelled') {
        return res.status(403).json({
          success: false,
          message: 'Your subscription has expired. Please renew to continue.',
          subscriptionStatus: user.subscription_status
        });
      }

      // Check trial expiry
      if (user.subscription_plan === 'trial' && user.trial_ends_at) {
        const trialEndsAt = new Date(user.trial_ends_at);
        if (trialEndsAt < new Date()) {
          // Update subscription status to expired
          await query(
            'UPDATE labs SET subscription_status = $1 WHERE id = $2',
            ['expired', user.lab_id]
          );

          return res.status(403).json({
            success: false,
            message: 'Your trial period has expired. Please subscribe to continue.',
            subscriptionStatus: 'expired',
            trialEndsAt: user.trial_ends_at
          });
        }
      }
    }

    // Generate JWT token
    const lab = user.lab_id ? {
      id: user.lab_id,
      name: user.lab_name,
      code: user.lab_code,
      subscription_plan: user.subscription_plan
    } : null;

    const token = generateToken(user, lab);

    console.log('✅ Login successful for:', email, '| Role:', user.role);

    // Return user data and token
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        fullName: `${user.first_name} ${user.last_name || ''}`.trim(),
        role: user.role,
        permissions: user.permissions || [],
        lab: lab
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/auth/register
 * @desc    Register new user (Lab Admin can add staff)
 * @access  Private (LabAdmin)
 */
router.post('/register', authMiddleware, async (req, res) => {
  try {
    const currentUser = req.user;
    const {
      email,
      password,
      firstName,
      lastName,
      phone,
      role,
      permissions
    } = req.body;

    console.log('👤 New user registration by:', currentUser.email);

    // Validation
    if (!email || !password || !firstName || !role) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: email, password, firstName, role'
      });
    }

    // Only LabAdmin can create users for their lab
    if (currentUser.role !== 'LabAdmin' && currentUser.role !== 'SuperAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Only Lab Admin can create new users'
      });
    }

    // Validate role: allow custom roles for LabAdmin/Admin, but reserve 'Admin' and 'SuperAdmin' for SuperAdmin only
    if (!role || typeof role !== 'string' || !role.trim()) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    const roleNorm = String(role).trim();
    if ((roleNorm === 'Admin' || roleNorm === 'SuperAdmin') && currentUser.role !== 'SuperAdmin') {
      return res.status(403).json({ success: false, message: 'Only SuperAdmin can create Admin or SuperAdmin accounts' });
    }

    // Check if email already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email already exists'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const userResult = await query(
      `INSERT INTO users (
        lab_id, email, password_hash, first_name, last_name, phone, role, permissions, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, email, first_name, last_name, role, permissions`,
      [
        currentUser.labId,
        email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        phone,
        role,
        JSON.stringify(permissions || []),
        true
      ]
    );

    const newUser = userResult.rows[0];

    // Update lab's total_users count
    await query(
      'UPDATE labs SET total_users = total_users + 1 WHERE id = $1',
      [currentUser.labId]
    );

    console.log('✅ User created successfully:', newUser.email);

    // Attempt to send welcome email with credentials (best-effort)
    let emailSent = false;
    try {
      const subject = 'Your account has been created';
      const text = `Hello ${newUser.first_name || ''},\n\nAn account has been created for you at ${req.hostname}.\n\nLogin details:\nEmail: ${newUser.email}\nTemporary password: ${password || '(hidden)'}\n\nPlease change your password after first login.`;
      emailSent = await sendEmail({ to: newUser.email, subject, text });
    } catch (mailErr) {
      console.error('❌ Failed to send registration email:', mailErr?.message || mailErr);
      emailSent = false;
    }

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      emailSent,
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        fullName: `${newUser.first_name} ${newUser.last_name || ''}`.trim(),
        role: newUser.role,
        permissions: newUser.permissions
      }
    });

  } catch (error) {
    console.error('❌ User registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const userResult = await query(
      `SELECT 
        u.id, u.lab_id, u.email, u.first_name, u.last_name, u.phone, u.role, u.permissions,
        u.is_active, u.email_verified, u.last_login, u.created_at,
        l.lab_name, l.lab_code, l.subscription_plan, l.subscription_status
      FROM users u
      LEFT JOIN labs l ON u.lab_id = l.id
      WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        fullName: `${user.first_name} ${user.last_name || ''}`.trim(),
        phone: user.phone,
        role: user.role,
        permissions: user.permissions || [],
        isActive: user.is_active,
        emailVerified: user.email_verified,
        lastLogin: user.last_login,
        createdAt: user.created_at,
        lab: user.lab_id ? {
          id: user.lab_id,
          name: user.lab_name,
          code: user.lab_code,
          subscriptionPlan: user.subscription_plan,
          subscriptionStatus: user.subscription_status
        } : null
      }
    });

  } catch (error) {
    console.error('❌ Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile',
      error: error.message
    });
  }
});

module.exports = router;

