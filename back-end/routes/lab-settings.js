const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
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

module.exports = router;

