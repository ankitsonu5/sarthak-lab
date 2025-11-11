const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { encrypt } = require('../utils/secure');
const router = express.Router();

// Lightweight JWT auth (mirrors auth.js)
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

// Save/Update current user's SMTP settings (SuperAdmin only)
router.post('/me/smtp', requireAuth, async (req, res) => {
  try {
    const me = await User.findById(req.user.userId);
    if (!me || me.role !== 'SuperAdmin') return res.status(403).json({ message: 'Only SuperAdmin can update SMTP' });

    const { host, port, secure, user, pass, from } = req.body || {};
    if (!user) return res.status(400).json({ message: 'user (email) is required' });

    // Preserve existing password if not provided
    const existing = me.smtpSettings || {};
    const passEnc = pass ? encrypt(String(pass)) : existing.passEnc;

    if (!passEnc) {
      return res.status(400).json({ message: 'App password is required for first-time setup' });
    }

    me.smtpSettings = {
      host: host || existing.host || 'smtp.gmail.com',
      port: Number((port ?? existing.port) ?? 587),
      secure: typeof secure === 'boolean' ? !!secure : !!existing.secure,
      user: String(user || existing.user || ''),
      passEnc,
      from: from || existing.from || `${me.firstName || 'HMS'} ${me.lastName || ''} <${user || existing.user}>`
    };

    await me.save();

    const { host: h, port: p, secure: s, user: u, from: f } = me.smtpSettings;
    return res.json({ message: 'SMTP settings saved', smtp: { host: h, port: p, secure: s, user: u, from: f, hasPass: true } });
  } catch (e) {
    console.error('SMTP save error:', e);
    return res.status(500).json({ message: e.message });
  }
});

// Get current user's SMTP settings (mask password)
router.get('/me/smtp', requireAuth, async (req, res) => {
  try {
    const me = await User.findById(req.user.userId).lean();
    if (!me) return res.status(404).json({ message: 'User not found' });
    const smtp = me.smtpSettings || null;
    if (!smtp) return res.json({ smtp: null });
    const { host, port, secure, user, from, passEnc } = smtp;
    return res.json({ smtp: { host, port, secure, user, from, hasPass: !!passEnc } });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

module.exports = router;

