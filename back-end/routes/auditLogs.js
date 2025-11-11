const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');
const { authenticateToken } = require('../middlewares/auth');

// Protect all routes
router.use(authenticateToken);

// GET /api/audit-logs/daily?date=YYYY-MM-DD&entity=Patient|Appointment|PathologyInvoice|Report
router.get('/daily', async (req, res) => {
  try {
    const { date = '' } = req.query;
    const rawEntities = (req.query.entity || req.query.entities || '').toString();
    const entities = rawEntities
      ? rawEntities.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    if (!date) {
      return res.status(400).json({ success: false, message: 'Missing date param (YYYY-MM-DD)' });
    }

    const start = new Date(date + 'T00:00:00');
    const end = new Date(date + 'T23:59:59.999');

    const filter = { at: { $gte: start, $lte: end } };
    if (entities.length) filter.entityType = { $in: entities };

    const limit = Math.min(parseInt(String(req.query.limit || '2000'), 10), 5000);

    const logs = await AuditLog.find(filter)
      .sort({ at: -1 })
      .limit(limit)
      .lean();

    // Group by entityType for convenient UI
    const grouped = logs.reduce((acc, l) => {
      const key = l.entityType || 'Unknown';
      (acc[key] = acc[key] || []).push(l);
      return acc;
    }, {});

    res.json({ success: true, date, count: logs.length, grouped, logs });
  } catch (e) {
    console.error('Error fetching daily audit logs:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch audit logs', error: e.message });
  }
});

// GET /api/audit-logs/recent?limit=100
router.get('/recent', async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '200'), 10), 2000);
    const logs = await AuditLog.find({}).sort({ at: -1 }).limit(limit).lean();
    res.json({ success: true, count: logs.length, logs });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to fetch recent audit logs', error: e.message });
  }
});

module.exports = router;

