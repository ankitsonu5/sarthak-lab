/**
 * Multi-Tenant Middleware
 * Automatically injects lab_id into all database queries for data isolation
 */

const { setLabContext } = require('../config/postgres');

/**
 * Middleware to enforce lab-level data isolation
 * Extracts lab_id from JWT token and adds it to request context
 */
const multiTenantMiddleware = (req, res, next) => {
  try {
    const user = req.user; // Set by auth middleware
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    // Super Admin has no lab_id and can access all data
    if (user.role === 'SuperAdmin') {
      req.isSuperAdmin = true;
      req.labId = null;
      return next();
    }
    
    // All other users must have a lab_id
    if (!user.labId) {
      return res.status(403).json({
        success: false,
        message: 'Lab context not found. Please contact administrator.'
      });
    }
    
    // Inject lab_id into request
    req.labId = user.labId;
    req.isSuperAdmin = false;
    
    // Add lab_id to query parameters (for automatic filtering)
    if (!req.query) req.query = {};
    req.query.lab_id = user.labId;
    
    // Add lab_id to body (for create/update operations)
    if (req.body && typeof req.body === 'object') {
      req.body.lab_id = user.labId;
    }
    
    console.log(`🏢 Lab context set: ${user.labId} for user: ${user.email}`);
    
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
 * Middleware to check subscription status and limits
 */
const checkSubscriptionLimits = (resource) => {
  return async (req, res, next) => {
    try {
      // Super Admin bypass
      if (req.isSuperAdmin) {
        return next();
      }
      
      const { query } = require('../config/postgres');
      const labId = req.labId;
      
      // Get lab subscription details
      const labResult = await query(
        'SELECT subscription_plan, subscription_status, total_patients, total_reports, total_users FROM labs WHERE id = $1',
        [labId]
      );
      
      if (labResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Lab not found'
        });
      }
      
      const lab = labResult.rows[0];
      
      // Check if subscription is active
      if (lab.subscription_status !== 'active') {
        return res.status(403).json({
          success: false,
          message: 'Subscription is not active. Please renew your subscription.',
          subscriptionStatus: lab.subscription_status
        });
      }
      
      // Get plan limits
      const planResult = await query(
        'SELECT features FROM subscription_plans WHERE plan_name = $1',
        [lab.subscription_plan]
      );
      
      if (planResult.rows.length === 0) {
        return next(); // No plan found, allow access
      }
      
      const features = planResult.rows[0].features;
      
      // Check resource-specific limits
      switch (resource) {
        case 'patients':
          const maxPatients = features.max_patients || -1;
          if (maxPatients !== -1 && lab.total_patients >= maxPatients) {
            return res.status(403).json({
              success: false,
              message: `Patient limit reached (${maxPatients}). Please upgrade your plan.`,
              limit: maxPatients,
              current: lab.total_patients
            });
          }
          break;
          
        case 'reports':
          const maxReports = features.max_reports_per_month || -1;
          if (maxReports !== -1 && lab.total_reports >= maxReports) {
            return res.status(403).json({
              success: false,
              message: `Monthly report limit reached (${maxReports}). Please upgrade your plan.`,
              limit: maxReports,
              current: lab.total_reports
            });
          }
          break;
          
        case 'users':
          const maxUsers = features.max_users || -1;
          if (maxUsers !== -1 && lab.total_users >= maxUsers) {
            return res.status(403).json({
              success: false,
              message: `User limit reached (${maxUsers}). Please upgrade your plan.`,
              limit: maxUsers,
              current: lab.total_users
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
const validateLabOwnership = (tableName, idParam = 'id') => {
  return async (req, res, next) => {
    try {
      // Super Admin bypass
      if (req.isSuperAdmin) {
        return next();
      }
      
      const { query } = require('../config/postgres');
      const resourceId = req.params[idParam];
      const labId = req.labId;
      
      if (!resourceId) {
        return res.status(400).json({
          success: false,
          message: 'Resource ID is required'
        });
      }
      
      // Check if resource belongs to the lab
      const result = await query(
        `SELECT lab_id FROM ${tableName} WHERE id = $1 AND deleted_at IS NULL`,
        [resourceId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Resource not found'
        });
      }
      
      const resourceLabId = result.rows[0].lab_id;
      
      if (resourceLabId !== labId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. This resource belongs to another lab.'
        });
      }
      
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
 * Helper function to add lab_id filter to SQL WHERE clause
 */
const addLabFilter = (labId, existingWhere = '') => {
  if (!labId) return existingWhere;
  
  const labFilter = `lab_id = '${labId}'`;
  
  if (!existingWhere || existingWhere.trim() === '') {
    return `WHERE ${labFilter}`;
  }
  
  if (existingWhere.trim().toUpperCase().startsWith('WHERE')) {
    return `${existingWhere} AND ${labFilter}`;
  }
  
  return `WHERE ${labFilter} AND (${existingWhere})`;
};

module.exports = {
  multiTenantMiddleware,
  checkSubscriptionLimits,
  validateLabOwnership,
  addLabFilter
};

