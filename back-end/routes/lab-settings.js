const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Lab = require('../models/Lab');
const router = express.Router();

// Lightweight JWT auth (same as smtp-settings)
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Access token required' });
  jwt.verify(token, process.env.JWT_SECRET || 'hospital_management_secret_key_2025_secure_token', (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// Get current user's Lab Settings
router.get('/me/lab', requireAuth, async (req, res) => {
  try {
    const me = await User.findById(req.user.userId).lean();
    if (!me) return res.status(404).json({ message: 'User not found' });
    return res.json({ lab: me.labSettings || null });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// Save/Update current user's Lab Settings (Admin or above)
router.post('/me/lab', requireAuth, async (req, res) => {
  try {
    const me = await User.findById(req.user.userId);
    if (!me) return res.status(404).json({ message: 'User not found' });

    // Only LabAdmin can update lab settings
    if (!['LabAdmin', 'Admin', 'Pathology'].includes(me.role)) {
      return res.status(403).json({ message: 'Only Lab Admin can update Lab Settings' });
    }

    const incoming = req.body?.lab || req.body || {};

    // Basic sanitize and shape
    const now = new Date();
    me.labSettings = {
      labName: String(incoming.labName || '').trim(),
      shortName: String(incoming.shortName || '').trim(),
      addressLine1: String(incoming.addressLine1 || '').trim(),
      addressLine2: String(incoming.addressLine2 || '').trim(),
      city: String(incoming.city || '').trim(),
      state: String(incoming.state || '').trim(),
      pincode: String(incoming.pincode || '').trim(),
      phone: String(incoming.phone || '').trim(),
      altPhone: String(incoming.altPhone || '').trim(),
      email: String(incoming.email || '').trim(),
      website: String(incoming.website || '').trim(),
      logoDataUrl: String(incoming.logoDataUrl || ''),
      signatureDataUrl: String(incoming.signatureDataUrl || ''),
      headerNote: String(incoming.headerNote || ''),
      footerNote: String(incoming.footerNote || ''),
      reportDisclaimer: String(incoming.reportDisclaimer || ''),
      reportTemplate: ['classic','modern','professional'].includes(String(incoming?.reportTemplate)) ? String(incoming.reportTemplate) : 'classic',
      prefixes: {
        receipt: String(incoming?.prefixes?.receipt || ''),
        report: String(incoming?.prefixes?.report || ''),
        labYearlyPrefix: String(incoming?.prefixes?.labYearlyPrefix || ''),
        labDailyPrefix: String(incoming?.prefixes?.labDailyPrefix || '')
      },
      numbering: {
        receiptStart: Number(incoming?.numbering?.receiptStart ?? 1) || 1,
        reportStart: Number(incoming?.numbering?.reportStart ?? 1) || 1,
        resetRule: ['yearly', 'monthly', 'never'].includes(String(incoming?.numbering?.resetRule)) ? incoming.numbering.resetRule : 'yearly'
      },
      printLayout: {
        template: ['classic','compact','minimal'].includes(String(incoming?.printLayout?.template)) ? String(incoming.printLayout.template) : 'classic',
        showHeader: !!(incoming?.printLayout?.showHeader ?? true),
        showFooter: !!(incoming?.printLayout?.showFooter ?? true),
        showQr: !!(incoming?.printLayout?.showQr ?? false),
        showRefDoctor: !!(incoming?.printLayout?.showRefDoctor ?? true),
        showAmount: !!(incoming?.printLayout?.showAmount ?? true)
      },
      updatedAt: now
    };

    await me.save();
    return res.json({ message: 'Lab settings saved', lab: me.labSettings });
  } catch (e) {
    console.error('Lab settings save error:', e);
    return res.status(500).json({ message: e.message });
  }
});

// Get current lab's subscription info (for LabAdmin dashboard)
router.get('/subscription-info', requireAuth, async (req, res) => {
  try {
    const me = await User.findById(req.user.userId).lean();
    if (!me) return res.status(404).json({ message: 'User not found' });

    // Get lab by user's labCode
    if (!me.labCode) {
      return res.json({
        success: true,
        subscription: {
          subscriptionPlan: 'trial',
          trialEndsAt: null,
          subscriptionStatus: 'pending'
        }
      });
    }

    const lab = await Lab.findOne({ labCode: me.labCode }).lean();
    if (!lab) {
      return res.json({
        success: true,
        subscription: {
          subscriptionPlan: 'trial',
          trialEndsAt: null,
          subscriptionStatus: 'pending'
        }
      });
    }

    return res.json({
      success: true,
      subscription: {
        subscriptionPlan: lab.subscriptionPlan || 'trial',
        subscriptionStatus: lab.subscriptionStatus || 'pending',
        trialEndsAt: lab.trialEndsAt,
        subscriptionEndsAt: lab.subscriptionEndsAt,
        labName: lab.labName,
        labCode: lab.labCode
      }
    });
  } catch (e) {
    console.error('Error getting subscription info:', e);
    return res.status(500).json({ message: e.message });
  }
});

// =====================================================
// CUSTOM ROLE MANAGEMENT ENDPOINTS
// Lab Admin can create unlimited custom roles
// =====================================================

// Get all custom roles for the lab
router.get('/roles', requireAuth, async (req, res) => {
  try {
    const me = await User.findById(req.user.userId).lean();
    if (!me) return res.status(404).json({ message: 'User not found' });

    if (!me.labId) {
      return res.json({ success: true, roles: [] });
    }

    const lab = await Lab.findById(me.labId).lean();
    if (!lab) {
      return res.json({ success: true, roles: [] });
    }

    // Return only active custom roles
    const roles = (lab.customRoles || []).filter(r => r.isActive !== false);
    return res.json({ success: true, roles });
  } catch (e) {
    console.error('Error fetching custom roles:', e);
    return res.status(500).json({ message: e.message });
  }
});

// Create a new custom role
router.post('/roles', requireAuth, async (req, res) => {
  try {
    const me = await User.findById(req.user.userId);
    if (!me) return res.status(404).json({ message: 'User not found' });

    // Only LabAdmin can create roles
    if (!['LabAdmin', 'Admin'].includes(me.role)) {
      return res.status(403).json({ message: 'Only Lab Admin can create roles' });
    }

    if (!me.labId) {
      return res.status(400).json({ message: 'User is not associated with any lab' });
    }

    const lab = await Lab.findById(me.labId);
    if (!lab) {
      return res.status(404).json({ message: 'Lab not found' });
    }

    const { name, label, description, permissions } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Role name is required' });
    }

    const roleName = name.trim();

    // Check for reserved roles
    const reservedRoles = ['SuperAdmin', 'LabAdmin', 'Admin'];
    if (reservedRoles.includes(roleName)) {
      return res.status(400).json({ message: `'${roleName}' is a reserved role name` });
    }

    // Check if role already exists
    const existing = (lab.customRoles || []).find(
      r => r.name.toLowerCase() === roleName.toLowerCase() && r.isActive !== false
    );
    if (existing) {
      return res.status(400).json({ message: `Role '${roleName}' already exists` });
    }

    // Add new role
    if (!lab.customRoles) lab.customRoles = [];
    const newRole = {
      name: roleName,
      label: (label || roleName).trim(),
      description: (description || '').trim(),
      permissions: Array.isArray(permissions) ? permissions : [],
      isActive: true,
      createdAt: new Date()
    };
    lab.customRoles.push(newRole);
    await lab.save();

    console.log(`✅ Custom role '${roleName}' created for lab ${lab.labCode}`);
    return res.json({ success: true, message: 'Role created successfully', role: newRole });
  } catch (e) {
    console.error('Error creating custom role:', e);
    return res.status(500).json({ message: e.message });
  }
});

// Delete a custom role (soft delete)
router.delete('/roles/:roleName', requireAuth, async (req, res) => {
  try {
    const me = await User.findById(req.user.userId);
    if (!me) return res.status(404).json({ message: 'User not found' });

    // Only LabAdmin can delete roles
    if (!['LabAdmin', 'Admin'].includes(me.role)) {
      return res.status(403).json({ message: 'Only Lab Admin can delete roles' });
    }

    if (!me.labId) {
      return res.status(400).json({ message: 'User is not associated with any lab' });
    }

    const lab = await Lab.findById(me.labId);
    if (!lab) {
      return res.status(404).json({ message: 'Lab not found' });
    }

    const roleName = req.params.roleName;
    const roleIndex = (lab.customRoles || []).findIndex(
      r => r.name.toLowerCase() === roleName.toLowerCase() && r.isActive !== false
    );

    if (roleIndex === -1) {
      return res.status(404).json({ message: `Role '${roleName}' not found` });
    }

    // Soft delete
    lab.customRoles[roleIndex].isActive = false;
    await lab.save();

    console.log(`🗑️ Custom role '${roleName}' deleted for lab ${lab.labCode}`);
    return res.json({ success: true, message: 'Role deleted successfully' });
  } catch (e) {
    console.error('Error deleting custom role:', e);
    return res.status(500).json({ message: e.message });
  }
});

// Update a custom role
router.put('/roles/:roleName', requireAuth, async (req, res) => {
  try {
    const me = await User.findById(req.user.userId);
    if (!me) return res.status(404).json({ message: 'User not found' });

    // Only LabAdmin can update roles
    if (!['LabAdmin', 'Admin'].includes(me.role)) {
      return res.status(403).json({ message: 'Only Lab Admin can update roles' });
    }

    if (!me.labId) {
      return res.status(400).json({ message: 'User is not associated with any lab' });
    }

    const lab = await Lab.findById(me.labId);
    if (!lab) {
      return res.status(404).json({ message: 'Lab not found' });
    }

    const roleName = req.params.roleName;
    const roleIndex = (lab.customRoles || []).findIndex(
      r => r.name.toLowerCase() === roleName.toLowerCase() && r.isActive !== false
    );

    if (roleIndex === -1) {
      return res.status(404).json({ message: `Role '${roleName}' not found` });
    }

    const { label, description, permissions } = req.body;

    if (label) lab.customRoles[roleIndex].label = label.trim();
    if (description !== undefined) lab.customRoles[roleIndex].description = description.trim();
    if (Array.isArray(permissions)) lab.customRoles[roleIndex].permissions = permissions;

    await lab.save();

    console.log(`✏️ Custom role '${roleName}' updated for lab ${lab.labCode}`);
    return res.json({ success: true, message: 'Role updated successfully', role: lab.customRoles[roleIndex] });
  } catch (e) {
    console.error('Error updating custom role:', e);
    return res.status(500).json({ message: e.message });
  }
});

module.exports = router;
