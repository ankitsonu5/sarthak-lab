/**
 * Multi-Tenant Middleware for MongoDB
 * Automatically injects labId into all database queries for data isolation
 */

const Lab = require('../models/Lab');

/**
 * Middleware to enforce lab-level data isolation
 * Extracts labId from JWT token and adds it to request context
 */
const multiTenantMiddleware = async (req, res, next) => {
  try {
    const user = req.user; // Set by auth middleware
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    // Super Admin has no labId and can access all data
    if (user.role === 'SuperAdmin') {
      req.isSuperAdmin = true;
      req.labId = null;
      req.lab = null;
      return next();
    }
    
    // All other users must have a labId
    if (!user.labId) {
      return res.status(403).json({
        success: false,
        message: 'Lab context not found. Please contact administrator.'
      });
    }
    
    // Get lab details
    const lab = await Lab.findById(user.labId);
    
    if (!lab) {
      return res.status(404).json({
        success: false,
        message: 'Lab not found'
      });
    }
    
    // Check if lab is approved
    if (lab.approvalStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Your lab is pending approval. Please wait for admin approval.',
        approvalStatus: lab.approvalStatus
      });
    }
    
    // Check if lab has valid subscription
    if (!lab.hasValidSubscription()) {
      return res.status(403).json({
        success: false,
        message: 'Your subscription has expired. Please renew to continue.',
        subscriptionStatus: lab.subscriptionStatus,
        subscriptionPlan: lab.subscriptionPlan
      });
    }
    
    // Inject lab context into request
    req.labId = user.labId;
    req.lab = lab;
    req.isSuperAdmin = false;
    
    // Add labId to query parameters (for automatic filtering)
    if (!req.query) req.query = {};
    req.query.labId = user.labId.toString();
    
    // Add labId to body (for create/update operations)
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      req.body.labId = user.labId;
    }
    
    console.log(`🏢 Lab context set: ${lab.labName} (${lab.labCode}) for user: ${user.email}`);
    
    next();
  } catch (error) {
    console.error('❌ Multi-tenant middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error in multi-tenant middleware'
    });
  }
};

/**
 * Middleware to check subscription limits
 */
const checkSubscriptionLimits = (resource) => {
  return async (req, res, next) => {
    try {
      // Super Admin bypass
      if (req.isSuperAdmin) {
        return next();
      }
      
      const lab = req.lab;
      
      if (!lab) {
        return res.status(400).json({
          success: false,
          message: 'Lab context not found'
        });
      }
      
      // Check resource-specific limits
      switch (resource) {
        case 'patients':
          if (!lab.canAddPatient()) {
            const maxPatients = lab.planDetails.maxPatients;
            return res.status(403).json({
              success: false,
              message: `Patient limit reached (${maxPatients}). Please upgrade your plan.`,
              limit: maxPatients,
              current: lab.totalPatients,
              plan: lab.subscriptionPlan
            });
          }
          break;
          
        case 'reports':
          if (!lab.canCreateReport()) {
            const maxReports = lab.planDetails.maxReportsPerMonth;
            return res.status(403).json({
              success: false,
              message: `Monthly report limit reached (${maxReports}). Please upgrade your plan.`,
              limit: maxReports,
              current: lab.monthlyReports,
              plan: lab.subscriptionPlan
            });
          }
          break;
          
        case 'users':
          if (!lab.canAddUser()) {
            const maxUsers = lab.planDetails.maxUsers;
            return res.status(403).json({
              success: false,
              message: `User limit reached (${maxUsers}). Please upgrade your plan.`,
              limit: maxUsers,
              current: lab.totalUsers,
              plan: lab.subscriptionPlan
            });
          }
          break;
      }
      
      next();
    } catch (error) {
      console.error('❌ Subscription limit check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking subscription limits'
      });
    }
  };
};

/**
 * Middleware to validate lab ownership of a resource
 * Use this for update/delete operations to ensure user can only modify their lab's data
 */
const validateLabOwnership = (Model, idParam = 'id') => {
  return async (req, res, next) => {
    try {
      // Super Admin bypass
      if (req.isSuperAdmin) {
        return next();
      }
      
      const resourceId = req.params[idParam];
      const labId = req.labId;
      
      if (!resourceId) {
        return res.status(400).json({
          success: false,
          message: 'Resource ID is required'
        });
      }
      
      // Check if resource belongs to the lab
      const resource = await Model.findById(resourceId);
      
      if (!resource) {
        return res.status(404).json({
          success: false,
          message: 'Resource not found'
        });
      }
      
      // Check if resource has labId field
      if (resource.labId && resource.labId.toString() !== labId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. This resource belongs to another lab.'
        });
      }
      
      // Attach resource to request for further use
      req.resource = resource;
      
      next();
    } catch (error) {
      console.error('❌ Lab ownership validation error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error validating resource ownership'
      });
    }
  };
};

/**
 * Helper function to add labId filter to MongoDB query
 */
const addLabFilter = (labId, existingFilter = {}) => {
  if (!labId) return existingFilter;
  
  return {
    ...existingFilter,
    labId: labId
  };
};

/**
 * Helper to get base query with lab filter
 */
const getLabQuery = (req, additionalFilter = {}) => {
  if (req.isSuperAdmin) {
    return additionalFilter;
  }
  
  return {
    ...additionalFilter,
    labId: req.labId
  };
};

module.exports = {
  multiTenantMiddleware,
  checkSubscriptionLimits,
  validateLabOwnership,
  addLabFilter,
  getLabQuery
};

