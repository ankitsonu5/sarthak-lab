const express = require('express');
const Report = require('../models/Report');
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const Department = require('../models/Department');
const Counter = require('../models/Counter');
const CounterService = require('../services/counter-service');
const PathologyInvoice = require('../models/PathologyInvoice');

const { authenticateToken, requirePermissions, authorizeRoles } = require('../middlewares/auth');
const router = express.Router();

// Consolidated OPD Report - Real-time data (No auth required for testing)
router.get('/consolidated-opd', async (req, res) => {
  try {
    console.log('📊 Generating consolidated OPD report...');
    const { fromDate, toDate } = req.query;

    // Default date range: 1st Jan 2025 to today if not provided
    const today = new Date();
    const defaultFromDate = new Date('2025-01-01');
    const defaultToDate = today;

    // Parse dates
    const startDate = fromDate ? new Date(fromDate) : defaultFromDate;
    startDate.setHours(0, 0, 0, 0);

    const endDate = toDate ? new Date(toDate) : defaultToDate;
    endDate.setHours(23, 59, 59, 999);

    console.log('📅 Date range:', { startDate, endDate });

    // Get all departments
    const departments = await Department.find({}).sort({ name: 1 });
    console.log('🏥 Found departments:', departments.length);
    console.log('🏥 Department names:', departments.map(d => d.name));

    // Get appointments (new patients) in date range
    const appointments = await Appointment.find({
      createdAt: { $gte: startDate, $lte: endDate }
    }).populate('department', 'name');

    console.log('👥 Appointments (new patients):', appointments.length);

    // Debug: Check total counts in collections
    const totalAppointments = await Appointment.countDocuments({});
    const totalDepartments = await Department.countDocuments({});

    console.log(`📊 DEBUG - Total in DB:`);
    console.log(`   📋 Total Appointments in DB: ${totalAppointments}`);
    console.log(`   🏥 Total Departments in DB: ${totalDepartments}`);

    // Format report date
    const reportDate = fromDate === toDate
      ? new Date(fromDate).toLocaleDateString('en-GB')
      : `${new Date(fromDate).toLocaleDateString('en-GB')} to ${new Date(toDate).toLocaleDateString('en-GB')}`;

    // Process department-wise data
    const departmentData = departments.map(dept => {
      // Count new patients by matching appointments for this department
      const newPatientsForDept = appointments.filter(apt =>
        apt.department && apt.department._id.toString() === dept._id.toString()
      ).length;

      console.log(`🔍 ${dept.name}: New=${newPatientsForDept}`);

      return {
        _id: dept._id,
        name: dept.name,
        newPatients: newPatientsForDept,
        total: newPatientsForDept
      };
    });

    // Show all departments even with zero data (like in your screenshot)
    console.log('📊 Showing all departments with real data...');

    // Calculate totals
    const totalNewPatients = departmentData.reduce((sum, dept) => sum + dept.newPatients, 0);
    const grandTotal = totalNewPatients;

    const report = {
      reportDate,
      totalNewPatients,
      grandTotal,
      departments: departmentData // Show all departments even with zero data
    };

    console.log('📊 Final Report Structure:');
    console.log('   📅 Report Date:', report.reportDate);
    console.log('   👥 Total New Patients:', report.totalNewPatients);
    console.log('   📊 Grand Total:', report.grandTotal);
    console.log('   🏥 Departments Count:', report.departments.length);
    console.log('   🏥 Departments Data:', JSON.stringify(report.departments, null, 2));

    console.log('✅ Consolidated OPD report generated successfully');
    console.log('📊 Report summary:', {
      totalNew: totalNewPatients,
      grandTotal,
      departmentsWithData: report.departments.length
    });

    res.json(report);

  } catch (error) {
    console.error('❌ Error generating consolidated OPD report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating consolidated OPD report',
      error: error.message
    });
  }
});

// Central OPD Registration list — NOW WITH SERVER-SIDE PAGINATION
// Includes: New Registrations (Appointment)
// GET /api/reports/central-opd-registration?start=YYYY-MM-DD&end=YYYY-MM-DD&page=1&limit=100
router.get('/central-opd-registration', async (req, res) => {
  try {
    const { start, end } = req.query;
    const today = new Date();
    const startDate = start ? new Date(start) : new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endDate = end ? new Date(end) : new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endExclusive = new Date(endDate);
    endExclusive.setDate(endExclusive.getDate() + 1);

    // Pagination params (defaults: page=1, limit=100)
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(500, parseInt(req.query.limit, 10) || 100));
    const skip = (page - 1) * limit;

    // Filters: gender and source (aadhaar/contact/both/none/any)
    const genderParam = String(req.query.gender || '').toLowerCase(); // 'male' | 'female' | ''
    const sourceParam = String(req.query.source || '').toLowerCase(); // 'aadhaar' | 'contact' | 'both' | 'none' | ''

    // Base match for both collections
    const match = { createdAt: { $gte: startDate, $lt: endExclusive }, status: { $ne: 'Cancelled' } };

    // 1) Build pipeline for Appointments only
    const baseUnion = [
      { $match: match },
      { $lookup: { from: 'patients', localField: 'patient', foreignField: '_id', as: 'patient' } },
      { $unwind: { path: '$patient', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'departments', localField: 'department', foreignField: '_id', as: 'department' } },
      { $unwind: { path: '$department', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'rooms', localField: 'room', foreignField: '_id', as: 'room' } },
      { $unwind: { path: '$room', preserveNullAndEmptyArrays: true } },
      { $project: {
          _id: 1,
          type: { $literal: 'NEW' },
          createdAt: 1,
          yearlyNo: 1, monthlyNo: 1, dailyNo: 1,
          appointmentId: 1,
          patient: {
            firstName: '$patient.firstName', lastName: '$patient.lastName', age: '$patient.age', gender: '$patient.gender', ageIn: '$patient.ageIn', address: '$patient.address', city: '$patient.city', post: '$patient.post',
            phone: '$patient.phone', aadharNo: '$patient.aadharNo'
          },
          department: { name: '$department.name' },
          room: { roomNumber: '$room.roomNumber' }
        } },
      // Window helpers and source flags
      { $addFields: {
          dayKey: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          monthKey: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          genderNorm: { $toLower: { $ifNull: ['$patient.gender', ''] } },
          hasAadhaar: { $gt: [ { $strLenCP: { $ifNull: ['$patient.aadharNo', ''] } }, 0 ] },
          hasContact: { $gt: [ { $strLenCP: { $ifNull: ['$patient.phone', ''] } }, 0 ] }
        } },
      { $setWindowFields: {
          partitionBy: '$dayKey',
          sortBy: { createdAt: 1 },
          output: { dailySeq: { $documentNumber: {} } }
        } },
      { $setWindowFields: {
          partitionBy: '$monthKey',
          sortBy: { createdAt: 1 },
          output: { monthlySeq: { $documentNumber: {} } }
        } },
      { $addFields: {
          // Prefer stored numbers, else fallback to sequence
          dailyEffective: { $ifNull: ['$dailyNo', '$dailySeq'] },
          monthlyEffective: { $ifNull: ['$monthlyNo', '$monthlySeq'] },
          sourceType: {
            $switch: {
              branches: [
                { case: { $and: ['$hasAadhaar', '$hasContact'] }, then: 'both' },
                { case: '$hasAadhaar', then: 'aadhaar' },
                { case: '$hasContact', then: 'contact' }
              ],
              default: 'none'
            }
          }
        } }
    ];

    // Build filter stages for data facet
    const filterStages = [];
    if (genderParam === 'male' || genderParam === 'm') filterStages.push({ $match: { genderNorm: 'male' } });
    if (genderParam === 'female' || genderParam === 'f') filterStages.push({ $match: { genderNorm: 'female' } });
    if (genderParam === 'other' || genderParam === 'o') filterStages.push({ $match: { genderNorm: 'other' } });

    if (sourceParam === 'aadhaar') filterStages.push({ $match: { hasAadhaar: true } });
    else if (sourceParam === 'contact') filterStages.push({ $match: { hasContact: true } });
    else if (sourceParam === 'both') filterStages.push({ $match: { hasAadhaar: true, hasContact: true } });
    else if (sourceParam === 'none') filterStages.push({ $match: { hasAadhaar: false, hasContact: false } });

    // Sort by createdAt to align with effective numbering order
    const sortStage = { $sort: { createdAt: 1, _id: 1 } };

    // Final pipeline using $facet for data + totals + stats
    const facetPipeline = [
      ...baseUnion,
      { $facet: {
          data: [
            ...filterStages,
            sortStage,
            { $skip: skip },
            { $limit: limit },
            { $project: {
                _id: 0,
                type: 1,
                createdAt: 1,
                appointmentId: 1,
                yearlyNo: '$yearlyNo',
                monthlyNo: '$monthlyEffective',
                dailyNo: '$dailyEffective',
                patient: 1,
                department: 1,
                room: 1
              } }
          ],
          totalFiltered: [
            ...filterStages,
            { $count: 'count' }
          ],
          genderCounts: [
            { $group: { _id: '$genderNorm', count: { $sum: 1 } } }
          ],
          sourceCounts: [
            { $group: { _id: '$sourceType', count: { $sum: 1 } } }
          ]
        } }
    ];

    const facetResultArr = await Appointment.aggregate(facetPipeline).allowDiskUse(true);
    const facetResult = (facetResultArr && facetResultArr[0]) || { data: [], totalFiltered: [], genderCounts: [], sourceCounts: [] };
    const docs = facetResult.data || [];
    const totalFiltered = (facetResult.totalFiltered && facetResult.totalFiltered[0] && facetResult.totalFiltered[0].count) || 0;

    // Map rows to response shape
    const rows = (docs || []).map(ev => {
      const d = ev.createdAt ? new Date(ev.createdAt) : new Date();
      const patient = ev.patient || {};
      const fullName = [patient.firstName, patient.lastName].filter(Boolean).join(' ');
      const address = patient?.address || { city: patient?.city, post: patient?.post };
      const regNoRaw = ev.type === 'NEW' ? (ev.appointmentId || '') : '';
      const regNo = String(regNoRaw || '').replace(/^APT0+/, '').replace(/^APT/, '');
      return {
        regNo,
        yearlyNo: ev.yearlyNo ?? null,
        monthlyNo: ev.monthlyNo ?? null,
        dailyNo: ev.dailyNo ?? null,
        patientName: fullName,
        gender: patient.gender || '',
        age: patient.age || '',
        ageIn: patient.ageIn || '',
        address,
        department: ev?.department?.name || '',
        roomNo: ev?.room?.roomNumber || '',
        date: d.toISOString().slice(0,10),
        type: ev.type
      };
    });

    // Compute stats object from facets (current range)
    const stats = { male: 0, female: 0, other: 0, aadhaar: 0, contact: 0 };
    for (const gc of (facetResult.genderCounts || [])) {
      if (gc._id === 'male') stats.male = gc.count;
      else if (gc._id === 'female') stats.female = gc.count;
      else if (gc._id === 'other') stats.other = gc.count;
    }
    for (const sc of (facetResult.sourceCounts || [])) {
      if (sc._id === 'aadhaar' || sc._id === 'both') stats.aadhaar += sc.count; // count aadhaar presence
      if (sc._id === 'contact' || sc._id === 'both') stats.contact += sc.count; // count contact presence
    }

    const endInclusive = new Date(endExclusive.getTime() - 1);
    res.json({
      success: true,
      start: startDate.toISOString().slice(0,10),
      end: endInclusive.toISOString().slice(0,10),
      page,
      pageSize: limit,
      total: totalFiltered,
      records: rows,
      stats
    });
  } catch (error) {
    console.error('❌ Error generating central OPD registration list:', error);
    res.status(500).json({ success: false, message: 'Error generating central OPD registration', error: error.message });
  }
});


// Daily OPD Report - Simple and direct data fetch for today
router.get('/daily-opd', async (req, res) => {
  try {
    console.log('📊 Generating daily OPD report...');
    const { date } = req.query;

    // Default to today if no date provided
    const today = new Date();
    const selectedDate = date ? new Date(date) : today;

    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    console.log(`📅 Generating report for date: ${selectedDate.toDateString()}`);

    // Get all departments
    const departments = await Department.find({}).sort({ name: 1 });
    console.log(`🏥 Found ${departments.length} departments`);

    // Get appointments (new patients) for the selected date
    const appointments = await Appointment.find({
      createdAt: { $gte: startOfDay, $lt: endOfDay }
    }).populate('department', 'name');

    console.log(`👥 Total Appointments (New Patients): ${appointments.length}`);

    // Process each department
    const departmentData = [];
    let totalNewPatients = 0;

    for (const dept of departments) {
      // Count new patients (appointments) for this department
      const newPatientsCount = appointments.filter(apt =>
        apt.department && apt.department._id.toString() === dept._id.toString()
      ).length;

      departmentData.push({
        _id: dept._id,
        name: dept.name,
        newPatients: newPatientsCount,
        total: newPatientsCount
      });

      totalNewPatients += newPatientsCount;

      console.log(`🏥 ${dept.name}: New=${newPatientsCount}, Total=${newPatientsCount}`);
    }

    const reportData = {
      date: selectedDate.toISOString().split('T')[0],
      totalPatients: totalNewPatients,
      newPatients: totalNewPatients,
      departments: departmentData
    };

    console.log('✅ Daily Report Generated Successfully');
    console.log(`📊 Summary: New=${totalNewPatients}, Total=${totalNewPatients}`);

    res.json(reportData);

  } catch (error) {
    console.error('❌ Error generating daily OPD report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating daily OPD report',
      error: error.message
    });
  }
});


// Daily Pathology Report - Category-wise test count and revenue
router.get('/daily-pathology', async (req, res) => {
  try {
    console.log('📊 Generating daily pathology report...');
    const { date } = req.query;

    // Default to today if no date provided
    const today = new Date();
    const selectedDate = date ? new Date(date) : today;

    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    console.log(`📅 Generating pathology report for date: ${selectedDate.toDateString()}`);

    // Get all pathology invoices for the selected date
    const invoices = await PathologyInvoice.find({
      bookingDate: { $gte: startOfDay, $lte: endOfDay },
      deleted: { $ne: true }
    }).lean();

    console.log(`📋 Found ${invoices.length} pathology invoices`);

    // Group by test category
    const categoryMap = new Map();
    let totalTests = 0;
    let totalAmount = 0;

    for (const invoice of invoices) {
      const tests = invoice.tests || [];
      const invoiceAmount = invoice.payment?.totalAmount || 0;

      // Count tests per category
      for (const test of tests) {
        const category = test.category || 'Uncategorized';
        const testPrice = test.price || 0;

        if (!categoryMap.has(category)) {
          categoryMap.set(category, {
            name: category,
            totalTests: 0,
            totalAmount: 0
          });
        }

        const catData = categoryMap.get(category);
        catData.totalTests += 1;
        catData.totalAmount += testPrice;
        totalTests += 1;
      }

      totalAmount += invoiceAmount;
    }

    // Convert map to array
    const categories = Array.from(categoryMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    const reportData = {
      date: selectedDate.toISOString().split('T')[0],
      totalTests,
      totalAmount,
      categories
    };

    console.log('✅ Daily Pathology Report Generated Successfully');
    console.log(`📊 Summary: Tests=${totalTests}, Amount=₹${totalAmount}`);

    res.json(reportData);

  } catch (error) {
    console.error('❌ Error generating daily pathology report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating daily pathology report',
      error: error.message
    });
  }
});


// Monthly OPD Report - Departments as columns, months as rows with New/Old/Total
router.get('/monthly-opd', async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();

    const startOfYear = new Date(year, 0, 1, 0, 0, 0, 0);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);

    // Load departments (show all columns even if zero)
    const departments = await Department.find({}).sort({ name: 1 });
    const deptIds = departments.map(d => d._id.toString());

    // Aggregate new patients by month and department
    const newAgg = await Appointment.aggregate([
      { $match: { createdAt: { $gte: startOfYear, $lte: endOfYear }, department: { $ne: null } } },
      { $group: { _id: { dept: '$department', month: { $month: '$createdAt' } }, count: { $sum: 1 } } }
    ]);

    // Prepare structure: months 1..12
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      monthName: new Date(year, i, 1).toLocaleString('en-US', { month: 'short' }),
      dataByDepartment: {},
      rowTotals: { newPatients: 0, total: 0 }
    }));

    // Helper to set cell
    const ensureCell = (row, deptId) => {
      if (!row.dataByDepartment[deptId]) {
        row.dataByDepartment[deptId] = { newPatients: 0, total: 0 };
      }
      return row.dataByDepartment[deptId];
    };

    // Fill with aggregated data
    for (const item of newAgg) {
      const m = item._id.month; // 1-12
      const deptId = item._id.dept.toString();
      if (!deptIds.includes(deptId)) continue;
      const row = months[m - 1];
      const cell = ensureCell(row, deptId);
      cell.newPatients += item.count;
    }

    // Compute totals and ensure all depts present per row
    for (const row of months) {
      for (const d of departments) {
        const id = d._id.toString();
        const cell = ensureCell(row, id);
        cell.total = cell.newPatients;
        row.rowTotals.newPatients += cell.newPatients;
        row.rowTotals.total += cell.total;
      }
    }

    // Grand totals by department
    const byDepartment = {};
    for (const d of departments) {
      byDepartment[d._id.toString()] = { newPatients: 0, total: 0 };
    }
    for (const row of months) {
      for (const d of departments) {
        const id = d._id.toString();
        const cell = row.dataByDepartment[id];
        byDepartment[id].newPatients += cell.newPatients;
        byDepartment[id].total += cell.total;
      }
    }

    const overall = { newPatients: 0, total: 0 };
    for (const id of Object.keys(byDepartment)) {
      overall.newPatients += byDepartment[id].newPatients;
      overall.total += byDepartment[id].total;
    }

    const response = {
      year,
      departments: departments.map(d => ({ _id: d._id, name: d.name })),
      months,
      grandTotals: { byDepartment, overall }
    };

    res.json(response);
  } catch (error) {
    console.error('❌ Error generating monthly OPD report:', error);
    res.status(500).json({ success: false, message: 'Error generating monthly OPD report', error: error.message });
  }
});

// Daily Cash Report - Real data from PathologyInvoice with filters
router.get('/daily-cash', async (req, res) => {
  console.log('💰 Daily Cash Report API called');

  try {
    const { fromDate, toDate, month, year, filterType } = req.query;

    console.log(`📅 Filter Type: ${filterType}`);
    console.log(`📅 Params:`, { fromDate, toDate, month, year });

    // Get CategoryHeads
    const CategoryHead = require('../models/CategoryHead');
    const PathologyInvoice = require('../models/PathologyInvoice');

    const categoryHeads = await CategoryHead.find({});
    console.log(`📋 Found ${categoryHeads.length} categories`);

    // Build a quick lookup for category id -> NAME (uppercased)
    const idToCategoryName = new Map(
      categoryHeads.map(c => [String(c._id), String(c.categoryName || '').trim().toUpperCase()])
    );

    // Build date filter based on filterType
    let dateFilter = {};
    let reportDateText = '';
    let rangeStart = null; // for inRange checks
    let rangeEnd = null;

    const buildDateOr = (range) => ({
      $or: [
        { createdAt: range },
        { 'payment.paymentDate': range },
        { bookingDate: range },
        // Include edits/adjustments that happened in the period
        { 'payment.adjustments.at': range },
        { 'payment.adjustments': { $elemMatch: { at: range } } }
      ]
    });

    if (filterType === 'all') {
      // All-time data: no date filter; keep rangeStart/rangeEnd null so inRange(d) => true
      dateFilter = {};
      reportDateText = 'All Data';
      rangeStart = null;
      rangeEnd = null;
    } else if (filterType === 'month' && month && year) {
      const startOfMonth = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endOfMonth = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);

      dateFilter = buildDateOr({ $gte: startOfMonth, $lte: endOfMonth });

      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                         'July', 'August', 'September', 'October', 'November', 'December'];
      reportDateText = `${monthNames[parseInt(month) - 1]} ${year}`;
    } else if (filterType === 'range' && (fromDate || toDate)) {
      // Date range filter
      const filter = {};
      if (fromDate) {
        const startDate = new Date(fromDate);
        startDate.setHours(0, 0, 0, 0);
        filter.$gte = startDate;
        rangeStart = startDate;
      }
      if (toDate) {
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        filter.$lte = endDate;
        rangeEnd = endDate;
      }

      if (Object.keys(filter).length > 0) {
        dateFilter = buildDateOr(filter);
      }

      if (fromDate && toDate) {
        reportDateText = `${new Date(fromDate).toLocaleDateString('en-GB')} to ${new Date(toDate).toLocaleDateString('en-GB')}`;
      } else if (fromDate) {
        reportDateText = `From ${new Date(fromDate).toLocaleDateString('en-GB')}`;
      } else if (toDate) {
        reportDateText = `Until ${new Date(toDate).toLocaleDateString('en-GB')}`;
      } else {
        reportDateText = 'All Data';
      }
    } else {
      // Default: Today's data
      const today = new Date();
      const startOfDay = new Date(today);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      dateFilter = buildDateOr({ $gte: startOfDay, $lte: endOfDay });
      reportDateText = today.toLocaleDateString('en-GB');
      rangeStart = startOfDay;
      rangeEnd = endOfDay;
    }
    // Helper: check if a date is within current range
    const inRange = (d) => {
      if (!d) return false;
      if (rangeStart && d < rangeStart) return false;
      if (rangeEnd && d > rangeEnd) return false;
      return true;
    };


    console.log(`📅 Date Filter:`, dateFilter);
    console.log(`📅 Report Period: ${reportDateText}`);

    // Get PathologyInvoices based on filter (exclude CANCELLED and unpaid)
    const baseMatch = {
      deleted: { $ne: true },
      status: { $ne: 'CANCELLED' },
      'payment.paymentStatus': { $in: ['PAID', 'paid'] }
    };

    let query;
    if (filterType === 'all') {
      // All data: don't restrict by dates
      query = baseMatch;
    } else {
      // Include invoices whose original dates are in range OR that have any adjustments array
      // (we will apply precise inRange() checks in JS for adjustments even if stored as strings)
      query = {
        $and: [
          baseMatch,
          { $or: [
              dateFilter,
              { 'payment.adjustments': { $exists: true, $ne: [] } }
            ]
          }
        ]
      };
    }

    const invoices = await PathologyInvoice.find(query);
    console.log(`💰 Found ${invoices.length} invoices for the period (paid, not cancelled)`);

    // Debug: Show sample invoice if exists
    if (invoices.length > 0) {
      console.log(`📋 Sample invoice:`, JSON.stringify(invoices[0], null, 2));
    } else {
      console.log(`❌ No PathologyInvoices found for the date range`);

      // Check total invoices in database
      const totalInvoices = await PathologyInvoice.countDocuments({});
      console.log(`📊 Total PathologyInvoices in database: ${totalInvoices}`);
    }

    // Calculate category-wise amounts
    const reportData = {
      date: reportDateText,
      totalAmount: 0,
      categories: []
    };

    // Precompute per-invoice contributions (original vs adjustments)
    const invoiceContributions = invoices.map((invoice) => {
      const origCandidates = [invoice?.payment?.paymentDate, invoice?.bookingDate, invoice?.createdAt]
        .map(d => d ? new Date(d) : null)
        .filter(Boolean);
      const originalDate = origCandidates.length ? new Date(Math.min(...origCandidates.map(d => d.getTime()))) : null;
      const originalInRange = inRange(originalDate);

      const adjustments = Array.isArray(invoice?.payment?.adjustments) ? invoice.payment.adjustments : [];
      const inRangeAdjustments = adjustments.filter(a => inRange(a?.at ? new Date(a.at) : null));
      const netDelta = inRangeAdjustments.reduce((sum, a) => sum + Number(a?.delta || 0), 0);

      const tests = Array.isArray(invoice.tests) ? invoice.tests : (Array.isArray(invoice.selectedTests) ? invoice.selectedTests : []);
      const amountsByCat = new Map();
      let invoiceTotal = 0;
      for (const t of tests) {
        const rawCat = (t.category || t.categoryName || '');
        const testCategory = (idToCategoryName.get(String(rawCat)) || String(rawCat)).trim().toUpperCase();
        const amount = Number((t.netAmount !== undefined ? t.netAmount : (t.amount !== undefined ? t.amount : t.cost)) || 0);
        amountsByCat.set(testCategory, (amountsByCat.get(testCategory) || 0) + (isNaN(amount) ? 0 : amount));
        invoiceTotal += isNaN(amount) ? 0 : amount;
      }

      return { originalInRange, netDelta, amountsByCat, invoiceTotal };
    });


    // Compute authoritative grand total from invoice-level contributions
    const grandTotalFromContribs = invoiceContributions.reduce((sum, c) => {
      if (filterType === 'all') {
        return sum + Number(c.invoiceTotal || 0);
      }
      let s = sum;
      if (c.originalInRange) s += Number(c.invoiceTotal || 0);
      if (Math.abs(Number(c.netDelta || 0)) > 0) s += Number(c.netDelta || 0);
      return s;
    }, 0);

    // Sum amounts directly from PathologyInvoice.tests by matching category name
    for (const category of categoryHeads) {
      let categoryAmount = 0;

      const categoryName = (category.categoryName || '').toString().trim().toUpperCase();
      console.log(`📊 Processing category: ${categoryName}`);

      // Loop through all PathologyInvoices in the period and apply edit-aware logic
      for (let i = 0; i < invoices.length; i++) {
        const contrib = invoiceContributions[i];
        if (!contrib) continue;

        // Add full amount if the invoice's original date falls in range (or for all-time)
        const addFull = contrib.originalInRange || (filterType === 'all');
        if (addFull) {
          for (const [catName, amt] of contrib.amountsByCat.entries()) {
            if (catName === categoryName) categoryAmount += amt;
          }
        }

        // For bounded ranges (not 'all'), also add same-day adjustments (net delta)
        const addAdjustments = (filterType !== 'all') && Math.abs(contrib.netDelta) > 0;
        if (addAdjustments) {
          // Allocate entire net delta to the department where money was taken/refunded
          // Rule:
          //  - if only one category present in invoice -> use that
          //  - if multiple categories -> use the dominant category (max original amount)
          //  - if none present -> fallback to PATHOLOGY
          const uniqueCats = Array.from(contrib.amountsByCat.keys());
          let targetCat = 'PATHOLOGY';
          if (uniqueCats.length === 1) {
            targetCat = uniqueCats[0];
          } else if (uniqueCats.length > 1) {
            // pick category with maximum amount
            let maxAmt = -Infinity;
            for (const [cn, amt] of contrib.amountsByCat.entries()) {
              if (Number(amt) > maxAmt) { maxAmt = Number(amt); targetCat = cn; }
            }
          }
          if (categoryName === targetCat) {
            categoryAmount += contrib.netDelta; // integer delta; no fractional split
          }
        }
      }

      reportData.categories.push({
        _id: category._id,
        name: category.categoryName,
        totalAmount: categoryAmount
      });

      reportData.totalAmount += categoryAmount;
      console.log(`✅ ${category.categoryName}: Total ₹${categoryAmount}`);
    }


    // Ensure totalAmount matches invoice-level contributions exactly (prevents category allocation drift)
    // UX requirement: never show negative total in summary tiles; clamp to zero
    reportData.totalAmount = Math.max(0, Math.round(grandTotalFromContribs));

    console.log(`💰 Total: ₹${reportData.totalAmount}`);
    res.json(reportData);

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Overall revenue till now from PathologyInvoice (authoritative, all-time)
// Uses test-line totals when available; otherwise falls back to payment.totalAmount per invoice
router.get('/daily-cash/overall-total', async (req, res) => {
  try {
    const PathologyInvoice = require('../models/PathologyInvoice');

    const agg = await PathologyInvoice.aggregate([
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
      // First, compute totals per invoice (sum of lines)
      { $group: {
          _id: '$_id',
          testsTotal: { $sum: { $ifNull: ['$lineAmount', 0] } },
          paymentTotal: { $first: { $ifNull: ['$payment.totalAmount', 0] } }
        }
      },
      // Then, choose testsTotal when > 0 else fallback to paymentTotal
      { $project: {
          invoiceTotal: {
            $cond: [ { $gt: ['$testsTotal', 0] }, '$testsTotal', '$paymentTotal' ]
          }
        }
      },
      { $group: { _id: null, total: { $sum: '$invoiceTotal' } } }
    ]);

    const totalAmount = agg && agg.length ? Math.round(agg[0].total) : 0;
    return res.json({ totalAmount });
  } catch (error) {
    console.error('❌ Error computing overall total:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});


// Apply authentication to all other routes
router.use(authenticateToken);

// Get all reports (Admin and Doctor can see all, Patient only their own)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, status = '', reportType = '', patientId = '' } = req.query;

    let query = {};

    // Role-based filtering
    if (req.user.role === 'Patient') {
      query.patient = req.user._id;
    } else if (req.user.role === 'Doctor') {
      // Doctors can see reports they created or are assigned to review
      query.$or = [
        { doctor: req.user._id },
        { reviewedBy: req.user._id }
      ];
    }
    // Admin can see all reports (no additional filtering)

    if (status) query.status = status;
    if (reportType) query.reportType = reportType;
    if (patientId && req.user.role !== 'Patient') query.patient = patientId;

    const reports = await Report.find(query)
      .populate('patient', 'firstName lastName patientId email')
      .populate('doctor', 'firstName lastName doctorId specialization')
      .populate('reviewedBy', 'firstName lastName doctorId')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ reportDate: -1 });

    const total = await Report.countDocuments(query);

    res.json({
      reports,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get report by ID
router.get('/:id', async (req, res) => {
  try {
    let query = { _id: req.params.id };

    // Role-based access control
    if (req.user.role === 'Patient') {
      query.patient = req.user._id;
    } else if (req.user.role === 'Doctor') {
      query.$or = [
        { doctor: req.user._id },
        { reviewedBy: req.user._id }
      ];
    }

    const report = await Report.findOne(query)
      .populate('patient', 'firstName lastName patientId email phone')
      .populate('doctor', 'firstName lastName doctorId specialization')
      .populate('appointment', 'appointmentId appointmentDate')
      .populate('reviewedBy', 'firstName lastName doctorId');

    if (!report) {
      return res.status(404).json({ message: 'Report not found or access denied' });
    }

    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new report (Only Doctors and Admin)
router.post('/', requirePermissions('create_reports', 'manage_reports'), async (req, res) => {
  try {
    const reportData = {
      ...req.body,
      doctor: req.user.role === 'Doctor' ? req.user._id : req.body.doctor
    };

    const report = new Report(reportData);
    await report.save();

    await report.populate('patient', 'firstName lastName patientId');
    await report.populate('doctor', 'firstName lastName doctorId specialization');

    res.status(201).json({
      message: 'Report created successfully',
      report
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update report (Only the doctor who created it or Admin)
router.put('/:id', async (req, res) => {
  try {
    let query = { _id: req.params.id };

    // Only the creating doctor or admin can update
    if (req.user.role === 'Doctor') {
      query.doctor = req.user._id;
    }

    const report = await Report.findOneAndUpdate(
      query,
      req.body,
      { new: true, runValidators: true }
    ).populate('patient', 'firstName lastName patientId')
     .populate('doctor', 'firstName lastName doctorId specialization');

    if (!report) {
      return res.status(404).json({ message: 'Report not found or access denied' });
    }

    res.json({
      message: 'Report updated successfully',
      report
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Review report (Only Doctors and Admin)
router.patch('/:id/review', requirePermissions('create_reports', 'manage_reports'), async (req, res) => {
  try {
    const { status, notes } = req.body;

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      {
        status,
        notes,
        reviewedBy: req.user._id,
        reviewedAt: new Date()
      },
      { new: true }
    ).populate('patient', 'firstName lastName patientId')
     .populate('doctor', 'firstName lastName doctorId specialization')
     .populate('reviewedBy', 'firstName lastName doctorId');

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    res.json({
      message: 'Report reviewed successfully',
      report
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete report (Only Admin)
router.delete('/:id', authorizeRoles('Admin'), async (req, res) => {
  try {
    const report = await Report.findByIdAndDelete(req.params.id);

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    res.json({ message: 'Report deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get reports by patient (Doctors and Admin only)
router.get('/patient/:patientId', requirePermissions('view_patients', 'manage_patients'), async (req, res) => {
  try {
    const reports = await Report.find({ patient: req.params.patientId })
      .populate('doctor', 'firstName lastName doctorId specialization')
      .populate('reviewedBy', 'firstName lastName doctorId')
      .sort({ reportDate: -1 });

    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
