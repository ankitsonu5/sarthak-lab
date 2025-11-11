const express = require('express');
const router = express.Router();
const CounterService = require('../services/counter-service');
const Counter = require('../models/Counter');
const { authenticateToken } = require('../middlewares/auth');

/**
 * Counter Management API Routes
 * Provides endpoints for counter operations and sync
 */

// Get all counters
router.get('/all', authenticateToken, async (req, res) => {
  try {
    const counters = await Counter.find({}).sort({ name: 1 });

    const currentYear = new Date().getFullYear();

    // Group counters by type
    const grouped = {
      yearly: counters.filter(c => c.name.includes(`_${currentYear}`)),
      daily: counters.filter(c => c.name.includes('_today_')),
      global: counters.filter(c => !c.name.includes('_') || ['pharmacySupplier', 'testTemplate', 'testParameter'].includes(c.name)),
      other: counters.filter(c => !c.name.includes(`_${currentYear}`) && !c.name.includes('_today_') && !['pharmacySupplier', 'testTemplate', 'testParameter'].includes(c.name))
    };

    res.json({
      success: true,
      data: {
        counters: grouped,
        summary: {
          total: counters.length,
          yearly: grouped.yearly.length,
          daily: grouped.daily.length,
          global: grouped.global.length,
          other: grouped.other.length
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching counters:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch counters',
      error: error.message
    });
  }
});

// Get specific counter value
router.get('/:counterName', authenticateToken, async (req, res) => {
  try {
    const { counterName } = req.params;
    const value = await CounterService.getCurrentValue(counterName);

    res.json({
      success: true,
      data: {
        counterName,
        value
      }
    });

  } catch (error) {
    console.error(`❌ Error getting counter ${req.params.counterName}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to get counter value',
      error: error.message
    });
  }
});

// Sync specific counter with collection
router.post('/sync/:counterName', authenticateToken, async (req, res) => {
  try {
    const { counterName } = req.params;
    const { collectionName, fieldName, idPrefix } = req.body;

    if (!collectionName || !fieldName) {
      return res.status(400).json({
        success: false,
        message: 'collectionName and fieldName are required'
      });
    }

    const syncedValue = await CounterService.syncWithCollection(
      counterName,
      collectionName,
      fieldName,
      idPrefix || ''
    );

    res.json({
      success: true,
      message: `Counter ${counterName} synced successfully`,
      data: {
        counterName,
        syncedValue
      }
    });

  } catch (error) {
    console.error(`❌ Error syncing counter ${req.params.counterName}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync counter',
      error: error.message
    });
  }
});

// Fix all counters
router.post('/fix-all', authenticateToken, async (req, res) => {
  try {
    console.log('🔧 API: Starting counter fix...');

    const results = await CounterService.fixAllCounters();

    res.json({
      success: true,
      message: 'All counters fixed successfully',
      data: {
        results,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error fixing all counters:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fix counters',
      error: error.message
    });
  }
});

// Reset specific counter
router.post('/reset/:counterName', authenticateToken, async (req, res) => {
  try {
    const { counterName } = req.params;
    const { value = 0 } = req.body;

    const resetValue = await CounterService.resetCounter(counterName, parseInt(value, 10));

    res.json({
      success: true,
      message: `Counter ${counterName} reset successfully`,
      data: {
        counterName,
        resetValue
      }
    });

  } catch (error) {
    console.error(`❌ Error resetting counter ${req.params.counterName}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset counter',
      error: error.message
    });
  }
});

// Ensure/create OPD yearly counter without touching any appointment data
// POST /api/counters/ensure/opd-year?year=YYYY
router.post('/ensure/opd-year', authenticateToken, async (req, res) => {
  try {
    const year = parseInt(String(req.query.year || '')) || new Date().getFullYear();
    const start = new Date(year, 0, 1, 0, 0, 0, 0);
    const end = new Date(year + 1, 0, 1, 0, 0, 0, 0);

    const Appointment = require('../models/Appointment');

    const countA = await Appointment.countDocuments({ createdAt: { $gte: start, $lt: end }, status: { $ne: 'Cancelled' } });

    const value = countA || 0;
    await CounterService.resetCounter(`opd_year_${year}`, value);

    return res.json({ success: true, year, value });
  } catch (error) {
    console.error('❌ Ensure OPD yearly counter failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to ensure OPD yearly counter', error: error.message });
  }
});



// Rebuild OPD counters (yearly/monthly/daily) across a full year
// POST /api/counters/rebuild/opd?year=YYYY
// NOTE: writes yearlyNo/monthlyNo/dailyNo to appointments
router.post('/rebuild/opd', authenticateToken, async (req, res) => {
  try {
    const year = parseInt(String(req.query.year || '')) || new Date().getFullYear();
    const start = new Date(year, 0, 1, 0, 0, 0, 0);
    const end = new Date(year + 1, 0, 1, 0, 0, 0, 0);

    const Appointment = require('../models/Appointment');

    // Load events for the whole year
    const apts = await Appointment.find({ appointmentDate: { $gte: start, $lt: end }, status: { $ne: 'Cancelled' } })
      .select('_id appointmentDate createdAt yearlyNo monthlyNo dailyNo')
      .lean();

    const events = [];
    for (const a of apts) {
      events.push({ id: a._id, date: a.appointmentDate ? new Date(a.appointmentDate) : new Date(a.createdAt) });
    }

    // Sort chronologically
    events.sort((x, y) => x.date.getTime() - y.date.getTime());

    // Counters maps
    let yearly = 0;
    const monthMap = new Map(); // key YYYYMM -> last
    const dayMap = new Map();   // key YYYYMMDD -> last

    const bulkA = [];

    for (const ev of events) {
      const d = ev.date;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const monthKey = `${y}${m}`;
      const dayKey = `${y}${m}${dd}`;

      yearly += 1;
      const mVal = (monthMap.get(monthKey) || 0) + 1; monthMap.set(monthKey, mVal);
      const dVal = (dayMap.get(dayKey) || 0) + 1; dayMap.set(dayKey, dVal);

      const update = { updateOne: { filter: { _id: ev.id }, update: { $set: { yearlyNo: yearly, monthlyNo: mVal, dailyNo: dVal } } } };
      bulkA.push(update);
    }

    // Apply bulk updates
    const results = {};
    if (bulkA.length) results.appointments = await Appointment.bulkWrite(bulkA, { ordered: false });

    // Update counter documents to match last values
    const CounterService = require('../services/counter-service');
    await CounterService.resetCounter(`opd_year_${year}`, yearly);
    for (const [mk, val] of monthMap.entries()) {
      await CounterService.resetCounter(`opd_month_${mk}`, val);
    }
    // Only reset the last day counter (others are historical and not used going forward)
    const lastDay = Array.from(dayMap.keys()).sort().pop();
    if (lastDay) await CounterService.resetCounter(`opd_today_${lastDay}`, dayMap.get(lastDay) || 0);

    res.json({ success: true, year, updated: { appointments: bulkA.length }, counters: { yearly, months: monthMap.size } });
  } catch (error) {
    console.error('❌ Rebuild OPD counters failed:', error);
    res.status(500).json({ success: false, message: 'Failed to rebuild OPD counters', error: error.message });
  }
});


// Rebuild OPD counters only for a specific month (does NOT touch yearlyNo)
// POST /api/counters/rebuild/opd-month?year=YYYY&month=MM (1-12)
// Writes monthlyNo and dailyNo for appointments within the month
router.post('/rebuild/opd-month', authenticateToken, async (req, res) => {
  try {
    const year = parseInt(String(req.query.year || '')) || new Date().getFullYear();
    const month = parseInt(String(req.query.month || ''));
    if (!month || month < 1 || month > 12) {
      return res.status(400).json({ success: false, message: 'Provide valid month=1..12' });
    }

    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 1, 0, 0, 0, 0);

    const Appointment = require('../models/Appointment');

    const apts = await Appointment.find({ appointmentDate: { $gte: start, $lt: end }, status: { $ne: 'Cancelled' } })
      .select('_id appointmentDate createdAt')
      .lean();

    const events = [];
    for (const a of apts) {
      const d = a.appointmentDate ? new Date(a.appointmentDate) : new Date(a.createdAt);
      events.push({ id: a._id, date: d });
    }

    // Sort chronologically
    events.sort((x, y) => x.date.getTime() - y.date.getTime());

    let monthly = 0;
    const dayMap = new Map(); // key YYYYMMDD -> last
    const bulkA = [];

    for (const ev of events) {
      const d = ev.date;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dayKey = `${y}${m}${dd}`;

      monthly += 1;
      const dVal = (dayMap.get(dayKey) || 0) + 1; dayMap.set(dayKey, dVal);

      const update = { updateOne: { filter: { _id: ev.id }, update: { $set: { monthlyNo: monthly, dailyNo: dVal } } } };
      bulkA.push(update);
    }

    const results = {};
    if (bulkA.length) results.appointments = await Appointment.bulkWrite(bulkA, { ordered: false });

    // Sync related counters for this month
    const CounterService = require('../services/counter-service');
    const mk = `${year}${String(month).padStart(2, '0')}`;
    await CounterService.resetCounter(`opd_month_${mk}`, monthly);

    const lastDay = Array.from(dayMap.keys()).sort().pop();
    if (lastDay) await CounterService.resetCounter(`opd_today_${lastDay}`, dayMap.get(lastDay) || 0);

    res.json({ success: true, year, month, updated: { appointments: bulkA.length }, totals: { monthly, days: dayMap.size } });
  } catch (error) {
    console.error('❌ Rebuild OPD monthly counters failed:', error);
    res.status(500).json({ success: false, message: 'Failed to rebuild OPD monthly counters', error: error.message });
  }
});


// Rebuild OPD counters for a specific day
// POST /api/counters/rebuild/opd-day?date=YYYY-MM-DD
router.post('/rebuild/opd-day', authenticateToken, async (req, res) => {
  try {
    const dateStr = String(req.query.date || '').trim();
    const base = dateStr ? new Date(dateStr) : new Date();
    const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0);
    const end = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, 0, 0, 0, 0);

    const Appointment = require('../models/Appointment');

    const apts = await Appointment.find({ appointmentDate: { $gte: start, $lt: end }, status: { $ne: 'Cancelled' } })
      .select('_id appointmentDate createdAt monthlyNo dailyNo')
      .lean();

    const events = [];
    for (const a of apts) events.push({ id: a._id, date: a.appointmentDate ? new Date(a.appointmentDate) : new Date(a.createdAt) });

    // Sort by time within the day
    events.sort((x, y) => x.date.getTime() - y.date.getTime());

    let daily = 0;
    const bulkA = [];

    // We only touch dailyNo here; monthlyNo/yearlyNo left as-is
    for (const ev of events) {
      daily += 1;
      const update = { updateOne: { filter: { _id: ev.id }, update: { $set: { dailyNo: daily } } } };
      bulkA.push(update);
    }

    if (bulkA.length) await Appointment.bulkWrite(bulkA, { ordered: false });

    // Sync counter doc for the day
    const y = start.getFullYear();
    const mm = String(start.getMonth() + 1).padStart(2, '0');
    const dd = String(start.getDate()).padStart(2, '0');
    const CounterService = require('../services/counter-service');
    await CounterService.resetCounter(`opd_today_${y}${mm}${dd}`, daily);

    res.json({ success: true, date: `${y}-${mm}-${dd}`, updated: { appointments: bulkA.length }, totalDaily: daily });
  } catch (error) {
    console.error('❌ Rebuild OPD daily counters failed:', error);
    res.status(500).json({ success: false, message: 'Failed to rebuild OPD daily counters', error: error.message });
  }
});

// Get next value for counter (for testing)
router.post('/next/:counterName', authenticateToken, async (req, res) => {
  try {
    const { counterName } = req.params;
    const { format = '', padding = 6 } = req.body;

    const result = await CounterService.getNextValue(counterName, format, parseInt(padding, 10));

    res.json({
      success: true,
      message: `Next value generated for ${counterName}`,
      data: result
    });

  } catch (error) {
    console.error(`❌ Error getting next value for ${req.params.counterName}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to get next value',
      error: error.message
    });
  }
});

// Health check for counter service
router.get('/health/check', async (req, res) => {
  try {
    // Test counter service
    const testCounter = await CounterService.getCurrentValue('health_check_test');

    res.json({
      success: true,
      message: 'Counter service is healthy',
      data: {
        timestamp: new Date().toISOString(),
        testCounter
      }
    });

  } catch (error) {
    console.error('❌ Counter service health check failed:', error);
    res.status(500).json({
      success: false,
      message: 'Counter service health check failed',
      error: error.message
    });
  }
});

module.exports = router;
