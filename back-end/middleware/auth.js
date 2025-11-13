const jwt = require('jsonwebtoken');
// const { query } = require('../config/postgres'); // ❌ Not using PostgreSQL - using MongoDB

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Generate JWT token for user
 */
const generateToken = (user, lab = null) => {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    labId: user.lab_id || null,
    permissions: user.permissions || [],
    subscriptionPlan: lab?.subscription_plan || null
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Verify JWT token
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

/**
 * Authentication Middleware
 * Verifies JWT token and attaches user to request
 */
const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Authentication required.'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // Get user from database to ensure they still exist and are active
    const userResult = await query(
      `SELECT 
        u.id, u.lab_id, u.email, u.first_name, u.last_name, u.role, u.permissions, u.is_active,
        l.subscription_plan, l.subscription_status, l.approval_status
      FROM users u
      LEFT JOIN labs l ON u.lab_id = l.id
      WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found or has been deleted'
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

    // Check if lab is approved (for non-SuperAdmin users)
    if (user.role !== 'SuperAdmin' && user.approval_status !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Your lab is pending approval. Please wait for admin approval.',
        approvalStatus: user.approval_status
      });
    }

    // Check if subscription is active (for non-SuperAdmin users)
    if (user.role !== 'SuperAdmin' && user.subscription_status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Your subscription is not active. Please renew your subscription.',
        subscriptionStatus: user.subscription_status
      });
    }

    // Attach user to request
    req.user = {
      userId: user.id,
      labId: user.lab_id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      fullName: `${user.first_name} ${user.last_name || ''}`.trim(),
      role: user.role,
      permissions: user.permissions || [],
      subscriptionPlan: user.subscription_plan,
      subscriptionStatus: user.subscription_status
    };

    // Update last login time (async, don't wait)
    query(
      'UPDATE users SET last_login = NOW(), login_count = login_count + 1 WHERE id = $1',
      [user.id]
    ).catch(err => console.error('Error updating last login:', err));

    next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
};

/**
 * Role-based authorization middleware
 * @param {Array} allowedRoles - Array of roles that can access the route
 */
const roleMiddleware = (allowedRoles) => {
  return (req, res, next) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
        userRole: user.role
      });
    }

    next();
  };
};

/**
 * Permission-based authorization middleware
 * @param {Array} requiredPermissions - Array of permissions required
 */
const permissionMiddleware = (requiredPermissions) => {
  return (req, res, next) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Super Admin has all permissions
    if (user.role === 'SuperAdmin') {
      return next();
    }

    const userPermissions = user.permissions || [];

    // Check if user has all required permissions
    const hasAllPermissions = requiredPermissions.every(permission =>
      userPermissions.includes(permission)
    );

    if (!hasAllPermissions) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        required: requiredPermissions,
        userPermissions
      });
    }

    next();
  };
};

/**
 * Super Admin only middleware
 */
const superAdminOnly = (req, res, next) => {
  const user = req.user;

  if (!user || user.role !== 'SuperAdmin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Super Admin only.'
    });
  }

  next();
};

module.exports = {
  generateToken,
  verifyToken,
  authMiddleware,
  roleMiddleware,
  permissionMiddleware,
  superAdminOnly
};

