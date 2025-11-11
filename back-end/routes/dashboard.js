const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');


// Get dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    console.log('📊 Fetching dashboard stats...');

    // Get today's date range
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    // Get this month's date range
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    // Total patients
    const totalPatients = await Patient.countDocuments();

    // Today's patients
    const todayPatients = await Patient.countDocuments({
      createdAt: { $gte: startOfDay, $lt: endOfDay }
    });

    // Monthly patients
    const monthlyPatients = await Patient.countDocuments({
      createdAt: { $gte: startOfMonth, $lt: endOfMonth }
    });

    // Today's appointments
    const todayAppointments = await Appointment.countDocuments({
      appointmentDate: { $gte: startOfDay, $lt: endOfDay }
    });

    // Today's OPD (derived): registrations today (new appointments)
    // We will compute this after we calculate both pieces below to keep tiles consistent
    let todayOPD = 0;

    // IPD patients (not implemented yet, so 0)
    const ipdPatients = 0; // Will be implemented when IPD module is ready

    // Total OPD = New Appointments only
    const totalNewAppointments = await Appointment.countDocuments();
    const totalOPD = totalNewAppointments;

    // Total registrations = सिर्फ New Appointments (OPD booking)
    const totalRegistrations = totalNewAppointments;

    // Today's OPD = Today's New Appointments
    const todayNewAppointments = await Appointment.countDocuments({
      createdAt: { $gte: startOfDay, $lt: endOfDay }
    });

    // Today's registrations = सिर्फ Today's New Appointments (OPD booking)
    const todayRegistrations = todayNewAppointments;

    // Keep "today OPD" exactly equal to today's registrations
    todayOPD = todayNewAppointments;

    // Calculate revenue from PathologyInvoice collection
    const PathologyInvoice = require('../models/PathologyInvoice');

    // Total revenue (all time) — only PAID and not CANCELLED
    // Sum by final test lines (same logic as reports/daily-cash?filterType=all)
    const totalRevenueResult = await PathologyInvoice.aggregate([
      { $match: { deleted: { $ne: true }, status: { $ne: 'CANCELLED' }, 'payment.paymentStatus': { $in: ['PAID', 'paid'] } } },
      { $addFields: {
          testsArr: {
            $cond: [
              { $gt: [ { $size: { $ifNull: ['$tests', []] } }, 0 ] },
              '$tests',
              { $ifNull: ['$selectedTests', []] }
            ]
          }
        }
      },
      { $unwind: { path: '$testsArr', preserveNullAndEmptyArrays: true } },
      { $addFields: {
          lineAmount: {
            $cond: [
              { $ne: [ '$testsArr.netAmount', null ] },
              { $ifNull: [ '$testsArr.netAmount', 0 ] },
              { $subtract: [
                  { $multiply: [
                      { $ifNull: [ '$testsArr.amount', { $ifNull: [ '$testsArr.cost', 0 ] } ] },
                      { $ifNull: [ '$testsArr.quantity', 1 ] }
                    ] },
                  { $ifNull: [ '$testsArr.discount', 0 ] }
                ] }
            ]
          }
        }
      },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$lineAmount', 0] } } } }
    ]);
    const totalRevenue = totalRevenueResult.length > 0 ? totalRevenueResult[0].total : 0;

    // Today's revenue (edit-aware):
    //  - If invoice's ORIGINAL date (min of paymentDate/bookingDate/createdAt) is today -> count full invoice amount (sum of test lines)
    //  - Else if there are adjustments today -> add only net delta for today
    const inRange = (d) => d && d >= startOfDay && d < endOfDay;

    const invoicesForToday = await PathologyInvoice.find({
      $or: [
        { createdAt: { $gte: startOfDay, $lt: endOfDay } },
        { 'payment.paymentDate': { $gte: startOfDay, $lt: endOfDay } },
        { bookingDate: { $gte: startOfDay, $lt: endOfDay } },
        { 'payment.adjustments.at': { $gte: startOfDay, $lt: endOfDay } },
        { 'payment.adjustments': { $elemMatch: { at: { $gte: startOfDay, $lt: endOfDay } } } }
      ],
      deleted: { $ne: true },
      status: { $ne: 'CANCELLED' },
      'payment.paymentStatus': { $in: ['PAID', 'paid'] }
    });

    let todayRevenue = 0;
    for (const invoice of invoicesForToday) {
      const candidates = [invoice?.payment?.paymentDate, invoice?.bookingDate, invoice?.createdAt]
        .map(d => (d ? new Date(d) : null))
        .filter(Boolean);
      const originalDate = candidates.length ? new Date(Math.min(...candidates.map(d => d.getTime()))) : null;
      const originalInToday = inRange(originalDate);

      const adjustments = Array.isArray(invoice?.payment?.adjustments) ? invoice.payment.adjustments : [];
      const netDelta = adjustments
        .filter(a => inRange(a?.at ? new Date(a.at) : null))
        .reduce((sum, a) => sum + Number(a?.delta || 0), 0);

      // Sum invoice tests using netAmount if present, else cost/amount with qty/discount
      let invoiceSum = 0;
      const tests = Array.isArray(invoice.tests)
        ? invoice.tests
        : (Array.isArray(invoice.selectedTests) ? invoice.selectedTests : []);
      for (const t of tests) {
        const qty = Number(t?.quantity ?? 1);
        const cost = Number(t?.cost ?? t?.amount ?? 0);
        const discount = Number(t?.discount ?? 0);
        const line = (t?.netAmount != null && !isNaN(Number(t.netAmount)))
          ? Number(t.netAmount)
          : (cost * qty - discount);
        invoiceSum += isNaN(line) ? 0 : line;
      }

      // If the invoice was created today, add ONLY the final amount (invoiceSum).
      // Do NOT also add same-day adjustments, because invoiceSum already reflects the final state.
      // For invoices originally from earlier days, include only today's net adjustments (refunds/credits).
      if (originalInToday) {
        todayRevenue += invoiceSum; // final state for today-created invoice
      } else if (Math.abs(netDelta) > 0) {
        todayRevenue += netDelta; // impact on today from older invoice edits
      }
    }

    const stats = {
      totalPatients,
      todayPatients,
      monthlyPatients,
      todayAppointments,
      todayOPD,
      totalOPD,
      totalRegistrations,
      todayRegistrations,

      ipdPatients,
      todayRevenue,
      totalRevenue,
      labRevenue: 0,

      labReports: 0
    };

    console.log('✅ Dashboard stats calculated:');
    console.log(`   📊 Total Patients: ${totalPatients}`);
    console.log(`   👥 Today's Patients: ${todayPatients}`);
    console.log(`   💰 Total Revenue: ₹${totalRevenue}`);
    console.log(`   💰 Today's Revenue: ₹${todayRevenue}`);
    console.log(`   📅 Today's Appointments: ${todayAppointments}`);
    console.log(`   🏥 Today's OPD: ${todayOPD}`);
    console.log(`   🏥 Total OPD: ${totalOPD} (${totalNewAppointments} new)`);
    console.log(`   📋 Total Registrations: ${totalRegistrations} (सिर्फ new appointments)`);
    console.log(`   📋 Today's Registrations: ${todayRegistrations} (सिर्फ today's new appointments)`);

    console.log(`   🏨 IPD Patients: ${ipdPatients} (not implemented yet)`);
    console.log(`   💰 Total Revenue: ₹${totalRevenue}`);
    console.log(`   💰 Today's Revenue: ₹${todayRevenue}`);
    console.log('✅ Complete stats:', stats);
    res.json(stats);

  } catch (error) {
    console.error('❌ Error fetching dashboard stats:', error);
    res.status(500).json({
      message: 'Error fetching dashboard stats',
      error: error.message
    });
  }
});

// Get patient registration trends
router.get('/patient-trends', async (req, res) => {
  try {
    const { period = 'daily' } = req.query;
    console.log(`📈 Fetching patient trends for period: ${period}`);

    let trends = [];

    if (period === 'daily') {
      // Get last 7 days data
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        days.push(date);
      }

      trends = await Promise.all(days.map(async (date) => {
        const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

        const count = await Patient.countDocuments({
          createdAt: { $gte: startOfDay, $lt: endOfDay }
        });

        return {
          date: date.toISOString().split('T')[0],
          count,
          label: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        };
      }));

    } else if (period === 'monthly') {
      // Get last 6 months data
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        months.push(date);
      }

      trends = await Promise.all(months.map(async (date) => {
        const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);

        const count = await Patient.countDocuments({
          createdAt: { $gte: startOfMonth, $lt: endOfMonth }
        });

        return {
          date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
          count,
          label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        };
      }));
    }

    console.log(`✅ Patient trends (${period}):`, trends);
    res.json(trends);

  } catch (error) {
    console.error('❌ Error fetching patient trends:', error);
    res.status(500).json({
      message: 'Error fetching patient trends',
      error: error.message
    });
  }
});

// Get OPD trends (New Appointments only)
router.get('/opd-trends', async (req, res) => {
  try {
    const { period = 'daily' } = req.query;
    const rawWindow = parseInt(req.query.window);
    const rawOffset = parseInt(req.query.offset);
    const windowSize = Math.max(1, Math.min(period === 'daily' ? 31 : 12, isNaN(rawWindow) ? (period === 'daily' ? 7 : 6) : rawWindow));
    const offset = Math.max(0, Math.min(3650, isNaN(rawOffset) ? 0 : rawOffset));
    console.log(`📈 Fetching OPD trends | period=${period} window=${windowSize} offset=${offset}`);

    let trends = [];

    if (period === 'daily') {
      // Build a sliding window of days: [offset + windowSize - 1 ... offset]
      const days = [];
      for (let i = offset + windowSize - 1; i >= offset; i--) {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - i);
        days.push(date);
      }

      trends = await Promise.all(days.map(async (date) => {
        const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

        const newAppointments = await Appointment.countDocuments({
          createdAt: { $gte: startOfDay, $lt: endOfDay }
        });

        const count = (newAppointments || 0);
        return {
          date: date.toISOString().split('T')[0],
          count,
          label: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        };
      }));

    } else if (period === 'monthly') {
      // Build a sliding window of months: [offset + windowSize - 1 ... offset]
      const months = [];
      for (let i = offset + windowSize - 1; i >= offset; i--) {
        const date = new Date();
        date.setDate(1);
        date.setMonth(date.getMonth() - i);
        months.push(date);
      }

      trends = await Promise.all(months.map(async (date) => {
        const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);

        const newAppointments = await Appointment.countDocuments({
          createdAt: { $gte: startOfMonth, $lt: endOfMonth }
        });

        const count = (newAppointments || 0);
        return {
          date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
          count,
          label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        };
      }));
    }

    console.log(`✅ OPD trends (${period}):`, trends);
    res.json(trends);
  } catch (error) {
    console.error('❌ Error fetching OPD trends:', error);
    res.status(500).json({
      message: 'Error fetching OPD trends',
      error: error.message
    });
  }
});


// Get today's patients and registrations (includes new patients only)
router.get('/todays-patients', async (req, res) => {
  try {
    console.log('👥 Fetching today\'s patients and registrations...');

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    // Get new patients registered today
    const newPatients = await Patient.find({
      createdAt: { $gte: startOfDay, $lt: endOfDay }
    })
    .select('firstName lastName createdAt')
    .sort({ createdAt: -1 })
    .limit(5);


    // Format new patients
    const formattedNewPatients = newPatients.map(patient => ({
      time: new Date(patient.createdAt).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      }),
      activity: `${patient.firstName} ${patient.lastName} - New Patient Registration`,
      patientName: `${patient.firstName} ${patient.lastName}`,
      type: 'new-registration'
    }));


    // Combine and sort all activities by time
    const allActivities = [...formattedNewPatients]
      .sort((a, b) => {
        const timeA = new Date(`1970-01-01 ${a.time}`);
        const timeB = new Date(`1970-01-01 ${b.time}`);
        return timeB.getTime() - timeA.getTime(); // Latest first
      })
      .slice(0, 10); // Limit to 10 most recent

    console.log(`✅ Found ${formattedNewPatients.length} new patients today`);
    console.log(`✅ Total activities: ${allActivities.length}`);
    res.json(allActivities);

  } catch (error) {
    console.error('❌ Error fetching today\'s patients and registrations:', error);
    res.status(500).json({
      message: 'Error fetching today\'s patients and registrations',
      error: error.message
    });
  }
});

// Get recent activities
router.get('/recent-activities', async (req, res) => {
  try {
    console.log('📋 Fetching recent activities...');

    // Get recent patients
    const recentPatients = await Patient.find()
      .select('firstName lastName createdAt')
      .sort({ createdAt: -1 })
      .limit(5);

    // Get recent appointments
    const recentAppointments = await Appointment.find()
      .populate('patient', 'firstName lastName')
      .select('appointmentDate createdAt')
      .sort({ createdAt: -1 })
      .limit(5);

    const activities = [];

    // Add patient registrations
    recentPatients.forEach(patient => {
      activities.push({
        id: patient._id,
        time: new Date(patient.createdAt).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        }),
        activity: `${patient.firstName} ${patient.lastName} - New Registration`,
        patientName: `${patient.firstName} ${patient.lastName}`,
        type: 'registration'
      });
    });

    // Add appointments
    recentAppointments.forEach(appointment => {
      if (appointment.patient) {
        activities.push({
          id: appointment._id,
          time: new Date(appointment.createdAt).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
          }),
          activity: `${appointment.patient.firstName} ${appointment.patient.lastName} - Appointment Booked`,
          patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
          type: 'appointment'
        });
      }
    });

    // Sort by time and limit to 10
    activities.sort((a, b) => new Date(b.time) - new Date(a.time));
    const limitedActivities = activities.slice(0, 10);

    console.log(`✅ Found ${limitedActivities.length} recent activities`);
    res.json(limitedActivities);

  } catch (error) {
    console.error('❌ Error fetching recent activities:', error);
    res.status(500).json({
      message: 'Error fetching recent activities',
      error: error.message
    });
  }
});

module.exports = router;
