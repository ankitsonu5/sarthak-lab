const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to authenticate token and load user
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'hospital_management_secret_key_2025_secure_token');

    // Load full user data including permissions
    const user = await User.findById(decoded.userId).select('-password');
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'User not found or inactive' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

// Middleware to check user roles
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'Access denied. Insufficient permissions.'
      });
    }

    next();
  };
};

// Middleware to check specific permissions
const requirePermissions = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const hasPermission = req.user.hasAnyPermission(permissions);
    if (!hasPermission) {
      return res.status(403).json({
        message: 'Access denied. Required permissions not found.',
        required: permissions,
        userPermissions: req.user.permissions
      });
    }

    next();
  };
};

// Middleware to check resource ownership for patients
const requireOwnership = (resourceField = 'patient') => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // SuperAdmin/Admin can access everything
    if (req.user.role === 'Admin' || req.user.role === 'SuperAdmin') {
      return next();
    }

    // For patients, check if they're accessing their own data
    if (req.user.role === 'Patient') {
      const resourceId = req.params.id || req.body[resourceField] || req.query[resourceField];

      if (!resourceId) {
        return res.status(400).json({ message: 'Resource ID required' });
      }

      // For patient role, the user ID should match the patient ID in the resource
      if (req.user._id.toString() !== resourceId.toString()) {
        return res.status(403).json({
          message: 'Access denied. You can only access your own data.'
        });
      }
    }

    next();
  };
};

// Middleware to check if user is admin/superadmin
const requireAdmin = (req, res, next) => {
  if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'SuperAdmin')) {
    return res.status(403).json({
      message: 'Access denied. Admin privileges required.'
    });
  }
  next();
};

// Middleware to check if user is doctor
const requireDoctor = (req, res, next) => {
  if (!req.user || req.user.role !== 'Doctor') {
    return res.status(403).json({
      message: 'Access denied. Doctor privileges required.'
    });
  }
  next();
};

// Middleware to validate user exists and is active
const validateUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    req.currentUser = user;
    next();
  } catch (error) {
    res.status(500).json({ message: 'Error validating user' });
  }
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  requirePermissions,
  requireOwnership,
  requireAdmin,
  requireDoctor,
  validateUser
};
