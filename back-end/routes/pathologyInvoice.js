const express = require('express');
const mongoose = require('mongoose');
const PathologyInvoice = require('../models/PathologyInvoice');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Department = require('../models/Department');
const Room = require('../models/Room');
const Appointment = require('../models/Appointment');
const Counter = require('../models/Counter');
const router = express.Router();

// Test route
router.get('/test', (req, res) => {
  console.log('🧪 Pathology Invoice route test');
  res.json({ success: true, message: 'Pathology Invoice route is working!' });
});

// ✅ Test database connection and check data
router.get('/test-data', async (req, res) => {
  try {
    console.log('🔍 Testing database connection and checking pathologyregistration data...');

    const PathologyRegistration = require('../models/PathologyRegistration');

    // Get total count
    const totalCount = await PathologyRegistration.countDocuments();
    console.log(`📊 Total pathologyregistration records: ${totalCount}`);

    // Get sample records
    const sampleRecords = await PathologyRegistration.find().limit(5).sort({ createdAt: -1 });
    console.log(`📋 Sample records:`, sampleRecords.map(r => ({
      receiptNumber: r.receiptNumber,
      yearNumber: r.yearNumber,
      todayNumber: r.todayNumber,
      patientName: r.patient?.name,
      registrationNumber: r.patient?.registrationNumber
    })));

    res.json({
      success: true,
      totalCount,
      sampleRecords: sampleRecords.map(r => ({
        receiptNumber: r.receiptNumber,
        yearNumber: r.yearNumber,
        todayNumber: r.todayNumber,
        patientName: r.patient?.name,
        registrationNumber: r.patient?.registrationNumber,
        tests: r.tests?.length || 0
      }))
    });

  } catch (error) {
    console.error('❌ Error testing database:', error);
    res.status(500).json({
      success: false,
      message: 'Database test failed',
      error: error.message
    });
  }
});

// 🔧 Admin utility: Backfill refs for legacy invoices
router.get('/admin/backfill-refs', async (req, res) => {
  try {
    const invoices = await PathologyInvoice.find({ $or: [
      { patientRef: null }, { doctorRef: null }, { departmentRef: null }, { appointmentRef: null }
    ]}).limit(2000);

    let updated = 0;
    for (const inv of invoices) {
      const set = {};
      try {
        if (!inv.patientRef) {
          const key = inv.patientId || inv.patient?.registrationNumber;
          if (key) {
            const p = await Patient.findOne({ $or: [ { _id: key }, { patientId: key } ] }).select('_id');
            if (p) set.patientRef = p._id;
          }
        }
        if (!inv.doctorRef && inv.doctorId) {
          const d = await Doctor.findOne({ $or: [ { _id: inv.doctorId }, { doctorId: inv.doctorId } ] }).select('_id');
          if (d) set.doctorRef = d._id;
        }
        if (!inv.departmentRef && inv.departmentId) {
          const dept = await Department.findOne({ _id: inv.departmentId }).select('_id');
          if (dept) set.departmentRef = dept._id;
        }
        if (!inv.appointmentRef && inv.appointmentId) {
          const appt = await require('../models/Appointment').findOne({ appointmentId: inv.appointmentId }).select('_id');
          if (appt) set.appointmentRef = appt._id;
        }
      } catch {}

      if (Object.keys(set).length) {
        await PathologyInvoice.updateOne({ _id: inv._id }, { $set: set });
        updated++;
      }
    }

    res.json({ success: true, updated });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// 🔧 Admin utility: Backfill patient.age/ageIn for legacy invoices
// Usage: POST /api/pathology-invoice/admin/backfill-age?limit=500&dryRun=true
router.post('/admin/backfill-age', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '500', 10), 5000);
    const dryRun = String(req.query.dryRun || 'false').toLowerCase() === 'true';

    // Find invoices where ageIn is missing/empty OR age is a string like "7 D"
    const filter = {
      $or: [
        { 'patient.ageIn': { $exists: false } },
        { 'patient.ageIn': { $in: ['', null] } },
        { 'patient.age': { $type: 'string' } }
      ]
    };

    const invoices = await PathologyInvoice.find(filter).limit(limit).select('_id patient patientRef');

    let scanned = 0, updated = 0;

    for (const inv of invoices) {
      scanned++;
      const p = inv.patient || {};
      let age = p.age;
      let ageIn = p.ageIn;

      // If age is string like "7 D" or "3m" parse it
      if (typeof age === 'string' && age.trim()) {
        const m = age.trim().match(/^(\d+)\s*([ymd])?$/i) || age.trim().match(/^(\d+)\s*([YMD])\s*$/);
        if (m) {
          age = parseInt(m[1], 10);
          const u = (m[2] || 'y').toLowerCase();
          ageIn = u === 'd' ? 'Days' : u === 'm' ? 'Months' : 'Years';
        } else {
          const m2 = age.trim().match(/^(\d+)\s*([A-Za-z]+)/);
          if (m2) {
            age = parseInt(m2[1], 10);
            const u2 = m2[2].toLowerCase();
            ageIn = u2.startsWith('d') ? 'Days' : u2.startsWith('m') ? 'Months' : 'Years';
          }
        }
      }

      // If ageIn still missing, try to pull from Patient ref
      if ((!ageIn || !['Years','Months','Days'].includes(ageIn)) && inv.patientRef && mongoose.isValidObjectId(inv.patientRef)) {
        try {
          const P = await Patient.findById(inv.patientRef).select('age ageIn');
          if (P) {
            if (typeof P.age === 'number') age = typeof age === 'number' ? age : P.age;
            if (P.ageIn) ageIn = P.ageIn;
          }
        } catch {}
      }

      // Default if still missing and age is a valid number
      if ((!ageIn || !['Years','Months','Days'].includes(ageIn)) && typeof age === 'number' && !isNaN(age)) {
        ageIn = 'Years';
      }

      // Prepare update
      const set = {};
      if (typeof age === 'number' && !isNaN(age) && age !== p.age) set['patient.age'] = age;
      if (ageIn && ageIn !== p.ageIn) set['patient.ageIn'] = ageIn;

      if (Object.keys(set).length) {
        if (!dryRun) {
          await PathologyInvoice.updateOne({ _id: inv._id }, { $set: set });
        }
        updated++;
      }
    }

    res.json({ success: true, scanned, updated, dryRun });
  } catch (e) {
    console.error('❌ Backfill age/ageIn failed:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});



// Get daily registration count
router.get('/daily-count', async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();

    // Set start and end of day
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    console.log('📊 Getting daily count for:', startOfDay.toDateString());

    const count = await PathologyInvoice.countDocuments({
      createdAt: {
        $gte: startOfDay,
        $lte: endOfDay
      },
      deleted: { $ne: true }
    });

    console.log('📊 Daily count result:', count);

    res.json({
      success: true,
      count: count,
      date: targetDate.toISOString().split('T')[0]
    });
  } catch (error) {
    console.error('❌ Error getting daily count:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting daily count',
      error: error.message
    });
  }
});

// Get yearly registration count
router.get('/yearly-count', async (req, res) => {
  try {
    const { year } = req.query;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();

    // Set start and end of year
    const startOfYear = new Date(targetYear, 0, 1);
    const endOfYear = new Date(targetYear, 11, 31, 23, 59, 59, 999);

    console.log('📅 Getting yearly count for:', targetYear);

    const count = await PathologyInvoice.countDocuments({
      createdAt: {
        $gte: startOfYear,
        $lte: endOfYear
      },
      deleted: { $ne: true }
    });

    console.log('📅 Yearly count result:', count);

    res.json({
      success: true,
      count: count,
      year: targetYear
    });
  } catch (error) {
    console.error('❌ Error getting yearly count:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting yearly count',
      error: error.message
    });
  }
});





// Create new pathology invoice
router.post('/create', async (req, res) => {
  try {
    console.log('🔥 PATHOLOGY INVOICE CREATE ENDPOINT HIT!');
    console.log('📄 Request method:', req.method);
    console.log('📄 Request headers:', req.headers);
    console.log('📄 Request body:', JSON.stringify(req.body, null, 2));

    // Debug: Check age field before processing
    console.log('🔍 BACKEND DEBUG - Age field before processing:');
    console.log('📄 Patient age:', req.body.patient?.age, 'type:', typeof req.body.patient?.age);
    console.log('📄 Patient ageIn:', req.body.patient?.ageIn, 'type:', typeof req.body.patient?.ageIn);

    // Fix address field if it's an object
    if (req.body.patient && req.body.patient.address && typeof req.body.patient.address === 'object') {
      const addr = req.body.patient.address;
      req.body.patient.address = `${addr.street || ''}, ${addr.city || ''}, ${addr.post || ''}`.replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '') || '';
      console.log('🔧 Fixed address field:', req.body.patient.address);
    }

    // Parse age field to separate age and ageIn
    if (req.body.patient && req.body.patient.age != null && req.body.patient.age !== '') {
      console.log('🔍 AGE PARSING - Original age:', req.body.patient.age, 'type:', typeof req.body.patient.age);
      const ageStr = req.body.patient.age.toString();
      const ageMatch = ageStr.match(/^\s*(\d+)\s*([YMD])\s*$/i);
      console.log('🔍 AGE PARSING - ageStr:', ageStr, 'ageMatch:', ageMatch);

      if (ageMatch) {
        // If age is in format "7 D", separate it
        req.body.patient.age = parseInt(ageMatch[1], 10);
        const unit = ageMatch[2].toUpperCase();
        req.body.patient.ageIn = unit === 'Y' ? 'Years' : unit === 'M' ? 'Months' : 'Days';
        console.log('🔧 Parsed age:', req.body.patient.age, 'ageIn:', req.body.patient.ageIn);
      } else {
        // If age is just a number, keep it as is and use existing ageIn or default
        const ageNum = parseInt(ageStr, 10);
        if (!isNaN(ageNum)) {
          req.body.patient.age = ageNum;
        }
      }
    }

    // Always normalize ageIn (ensure it is present and in full words)
    if (req.body.patient) {
      let ai = ((req.body.patient.ageIn ?? '') + '').toString().trim().toLowerCase();
      if (!ai && typeof req.body.patient.age === 'number' && !isNaN(req.body.patient.age)) {
        // default if missing
        ai = 'years';
      }
      if (ai.startsWith('y')) req.body.patient.ageIn = 'Years';
      else if (ai.startsWith('m')) req.body.patient.ageIn = 'Months';
      else if (ai.startsWith('d')) req.body.patient.ageIn = 'Days';
      else if (!req.body.patient.ageIn) req.body.patient.ageIn = 'Years';
    }

    // Debug: Check age field after processing
    console.log('🔍 BACKEND DEBUG - Age field after processing:');
    console.log('📄 Patient age:', req.body.patient?.age, 'type:', typeof req.body.patient?.age);
    console.log('📄 Patient ageIn:', req.body.patient?.ageIn, 'type:', typeof req.body.patient?.ageIn);

    const {
      patient,
      doctor,
      department,
      tests,
      payment,
      registrationNumber,
      bookingDate,
      registrationDate,
      doctorRefNo,
      mode,
      appointmentId,
      departmentId
    } = req.body;

    // NO VALIDATION - Just save whatever comes
    console.log('💾 Saving data without validation...');
    console.log('➡️ Incoming mode:', mode, 'appointmentId:', appointmentId, 'departmentId:', departmentId);

    // Mode: Save exactly what UI selected; default to 'OPD' only if empty
    const rawMode = (mode ?? req.body?.mode ?? req.body?.patient?.mode ?? '').toString();
    const finalMode = (rawMode.trim().toUpperCase()); // do not force default; let UI decide
    console.log('🧭 Incoming mode (raw):', rawMode, '→ Saved mode:', finalMode);

    // Get current year for receipt numbering
    const currentYear = new Date().getFullYear();
    const counterName = `receipt_${currentYear}`;

    // Sync yearly counter with actual max existing receipt for THIS YEAR (non-deleted), then increment
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);
    const maxDoc = await PathologyInvoice.findOne({
      deleted: { $ne: true },
      $or: [
        { bookingDate: { $gte: startOfYear, $lte: endOfYear } },
        { createdAt: { $gte: startOfYear, $lte: endOfYear } }
      ]
    }).sort({ receiptNumber: -1 }).lean();
    const maxExisting = Number(maxDoc?.receiptNumber || 0);

    // Force counter to match the real max before incrementing (fixes any gaps from past failed attempts)
    await Counter.findOneAndUpdate(
      { name: counterName },
      { $set: { value: maxExisting } },
      { upsert: true }
    );
    const afterInc = await Counter.findOneAndUpdate(
      { name: counterName },
      { $inc: { value: 1 } },
      { new: true }
    );

    const receiptNumber = afterInc.value; // Simple number: 1, 2, 3, 4...

    // Ever-incrementing DB-CRN (does not roll back on soft delete)
    // Initialize DB-CRN to current latest receipt number if lower/missing, then increment
    const latestInvoiceForBaseline = await PathologyInvoice.findOne({}, { receiptNumber: 1 })
      .sort({ receiptNumber: -1 })
      .lean();
    const baselineDbCrn = Number(latestInvoiceForBaseline?.receiptNumber || 0);

    // Ensure counter exists and is at least the baseline
    await Counter.findOneAndUpdate(
      { name: 'db_crn' },
      { $max: { value: baselineDbCrn } },
      { upsert: true }
    );

    // Now increment for this invoice and read the new value
    const dbCrnCounter = await Counter.findOneAndUpdate(
      { name: 'db_crn' },
      { $inc: { value: 1 } },
      { new: true }
    );
    let dbCrn = dbCrnCounter?.value || (baselineDbCrn + 1);

    // Ensure dbCrn yields unique invoice/booking IDs even if soft-deleted docs exist
    // If a collision is found, keep incrementing the db_crn counter until unique
    let attempts = 0;
    while (attempts < 25) {
      const inv = `INV${dbCrn}`;
      const pb = `PB${dbCrn}`;
      // Check ALL docs to avoid DB unique index conflicts if they exist on invoiceNumber/bookingId
      // Once partial unique indexes (deleted != true) are in place, we can switch this back to non-deleted only
      const exists = await PathologyInvoice.exists({ $or: [ { invoiceNumber: inv }, { bookingId: pb } ] });
      if (!exists) break;
      const next = await Counter.findOneAndUpdate({ name: 'db_crn' }, { $inc: { value: 1 } }, { new: true });
      dbCrn = next?.value || (dbCrn + 1);
      attempts++;
    }
    if (attempts >= 25) {
      throw new Error('Could not allocate a unique invoice/booking id. Please retry.');
    }

    // Get doctor and room information if available
    let doctorInfo = {
      name: doctor?.name || '',
      specialization: doctor?.specialization || department?.name || '',

      roomNumber: ''
    };

    let departmentInfo = {
      name: department?.name || '',
      code: department?.code || ''
    };

    // Try to get room number and doctor from department ObjectId or appointment data
    console.log('🔍 Department ObjectId received:', departmentId || department);

    // Generate unique invoice/booking IDs using dbCrn to avoid any duplicate key constraints
    const invoiceNumber = `INV${dbCrn}`;
    const bookingId = `PB${dbCrn}`;

    // First try to get room and doctor from department ObjectId or name
    if (departmentId || (department && (department._id || department.name))) {
      try {
        console.log('🏥 Finding rooms and doctors for department:', department.name);

        // Resolve department id
        let deptRecord = null;
        if (departmentId) {
          deptRecord = await Department.findById(departmentId);
        }
        if (!deptRecord && department && department._id) {
          deptRecord = await Department.findById(department._id);
        }
        if (!deptRecord && department && department.name) {
          deptRecord = await Department.findOne({ name: department.name });
        }
        if (deptRecord) {
          console.log('✅ Found department record:', deptRecord._id);

          // Find rooms in this department
          const rooms = await Room.find({ department: deptRecord._id }).limit(1);
          if (rooms.length > 0) {
            doctorInfo.roomNumber = rooms[0].roomNumber;
            console.log('🏠 Room number from department:', doctorInfo.roomNumber);
          }

          // Find doctors in this department
          const doctors = await Doctor.find({ department: deptRecord._id }).limit(1);
          if (doctors.length > 0 && !doctorInfo.name) {
            doctorInfo.name = doctors[0].name || `${doctors[0].firstName} ${doctors[0].lastName}`;
            doctorInfo.specialization = doctors[0].specialization;
            console.log('👨‍⚕️ Doctor from department:', doctorInfo.name);
          }
        }
      } catch (error) {
        console.log('⚠️ Could not fetch room/doctor from department:', error.message);
      }
    }

    // Keep appointment doc if we find it, to derive refs later
    let appointmentDoc = null;

    // Fallback: Try to get room number from appointment data if not found above
    if (!doctorInfo.roomNumber && registrationNumber) {
      try {
        // support both numeric and full formatted values (e.g., 72 or APT000072)
        const apptIdStr = String(registrationNumber);
        const appointmentId = apptIdStr.startsWith('APT') ? apptIdStr : `APT${apptIdStr.padStart(6, '0')}`;
        console.log('🔍 Looking for appointment with ID:', appointmentId);

        // Find appointment by appointmentId to get room info
        appointmentDoc = await Appointment.findOne({
          appointmentId: appointmentId
        }).populate('room').populate('doctor').populate('department');

        if (appointmentDoc) {
          console.log('✅ Found appointment with room data:', appointmentDoc.room?.roomNumber);
          if (appointmentDoc.room && !doctorInfo.roomNumber) {
            doctorInfo.roomNumber = appointmentDoc.room.roomNumber;
            console.log('🏠 Room number from appointment:', doctorInfo.roomNumber);
          }
          if (appointmentDoc.doctor && !doctorInfo.name) {
            doctorInfo.name = appointmentDoc.doctor.name || `${appointmentDoc.doctor.firstName} ${appointmentDoc.doctor.lastName}`;
            doctorInfo.specialization = appointmentDoc.doctor.specialization;
          }
          if (appointmentDoc.department) {
            departmentInfo.name = appointmentDoc.department.name;
            departmentInfo.code = appointmentDoc.department.code;
          }
        } else {
          console.log('❌ No appointment found with ID:', appointmentId);
        }
      } catch (error) {
        console.log('⚠️ Could not fetch room info from appointment:', error.message);
      }
    }

    // Resolve proper ObjectId refs for real-time data (outside try/catch)
    let patientRefId = null, doctorRefId = null, departmentRefId = null, appointmentRefId = null;

    // Candidate IDs from request
    const reqPatientId = req.body.patientRef || req.body.patientObjectId || req.body.patientId;
    const reqDoctorId = req.body.doctorRef || req.body.doctorObjectId || req.body.doctorId;
    const reqDepartmentId = req.body.departmentRef || req.body.departmentObjectId || req.body.departmentId;
    const reqAppointmentRef = req.body.appointmentRef || null;

    if (reqPatientId && mongoose.isValidObjectId(reqPatientId)) patientRefId = reqPatientId;
    if (!patientRefId && appointmentDoc?.patient) patientRefId = appointmentDoc.patient;
    if (reqAppointmentRef && mongoose.isValidObjectId(reqAppointmentRef)) appointmentRefId = reqAppointmentRef;
    if (!appointmentRefId && appointmentDoc?._id) appointmentRefId = appointmentDoc._id;
    if (!patientRefId && (patient?.patientId || req.body?.patient?.patientId)) {
      try {
        const uhid = (patient?.patientId || req.body?.patient?.patientId);
        const pDoc = await Patient.findOne({ patientId: uhid }).select('_id');
        if (pDoc) patientRefId = pDoc._id;
      } catch {}
    }

    if (reqDoctorId && mongoose.isValidObjectId(reqDoctorId)) doctorRefId = reqDoctorId;
    if (!doctorRefId && appointmentDoc?.doctor) doctorRefId = appointmentDoc.doctor;

    if (reqDepartmentId && mongoose.isValidObjectId(reqDepartmentId)) departmentRefId = reqDepartmentId;
    if (!departmentRefId && appointmentDoc?.department) departmentRefId = appointmentDoc.department;

    // Build patient snapshot with guaranteed age/ageIn
    const patientInfo = { ...(patient || {}) };
    if (req.body.patient) {
      const ageVal = req.body.patient.age;
      const ageInVal = req.body.patient.ageIn;
      // Cast age to number if string
      if (ageVal !== undefined && ageVal !== null) {
        const n = typeof ageVal === 'string' ? parseInt(ageVal, 10) : ageVal;
        if (!Number.isNaN(n)) patientInfo.age = n;
      }
      // Normalize ageIn to full word
      if (ageInVal) {
        const ai = String(ageInVal).toLowerCase();
        patientInfo.ageIn = ai.startsWith('y') ? 'Years' : ai.startsWith('m') ? 'Months' : ai.startsWith('d') ? 'Days' : ageInVal;
      }
    }
    // Default ageIn if still missing and age present
    if (!patientInfo.ageIn && typeof patientInfo.age === 'number' && !Number.isNaN(patientInfo.age)) {
      patientInfo.ageIn = 'Years';
    }

    // Create invoice data
    // Simple data structure - NO VALIDATION
    const invoiceData = {
      // 🏢 Multi-Tenant: Lab ID from middleware
      labId: req.labId,
      receiptNumber,
      invoiceNumber,
      bookingId,
      dbCrn,
      patient: patientInfo,
      doctor: doctorInfo, // includes roomNumber
      department: departmentInfo,
      // IDs alongside snapshots for reliable joins
      patientId: (req.body.patientId || patient?.patientId || ''),
      doctorId: (req.body.doctorId || ''),
      departmentId: (departmentId || ''),
      // Proper refs for live data
      patientRef: patientRefId,
      doctorRef: doctorRefId,
      departmentRef: departmentRefId,
      tests: Array.isArray(tests) ? tests.map(t => ({ ...t, categoryId: t.categoryId || '' })) : [],
      payment: payment || {},
      bookingDate: new Date(),
      registrationDate: new Date(),
      doctorRefNo: doctorRefNo || '',
      // Pass-through context
      mode: finalMode,
      appointmentId: appointmentId || '',
      appointmentRef: appointmentRefId || null
    };

    // Create and save invoice with retry on duplicate INV/PB due to legacy unique indexes
    let invoice = new PathologyInvoice(invoiceData);
    let savedOk = false;
    let saveAttempts = 0;
    while (!savedOk && saveAttempts < 5) {
      try {
        await invoice.save();
        savedOk = true;
      } catch (e) {
        // If duplicate key on invoiceNumber/bookingId, bump db_crn and retry
        const dup = (e && (e.code === 11000 || /duplicate key/i.test(e.message || '')));
        const invDup = dup && (/invoiceNumber/.test(e.message || '') || (e.keyPattern && e.keyPattern.invoiceNumber));
        const pbDup = dup && (/bookingId/.test(e.message || '') || (e.keyPattern && e.keyPattern.bookingId));
        if (dup && (invDup || pbDup)) {
          const next = await Counter.findOneAndUpdate({ name: 'db_crn' }, { $inc: { value: 1 } }, { new: true });
          const nextCrn = next?.value || ((invoice.dbCrn || dbCrn) + 1);
          invoice.dbCrn = nextCrn;
          invoice.invoiceNumber = `INV${nextCrn}`;
          invoice.bookingId = `PB${nextCrn}`;
          saveAttempts++;
          continue;
        }
        throw e;
      }
    }

    console.log('✅ Pathology invoice created successfully');
    console.log('📧 Receipt Number:', invoice.receiptNumber);
    console.log('📄 Invoice Number:', invoice.invoiceNumber);

    res.status(201).json({
      success: true,
      message: 'Pathology invoice created successfully',
      invoice: {
        receiptNumber: invoice.receiptNumber,
        invoiceNumber: invoice.invoiceNumber,
        bookingId: invoice.bookingId,
        totalAmount: invoice.payment.totalAmount,
        paymentDate: invoice.payment.paymentDate,
        _id: invoice._id
      }
    });

  } catch (error) {
    console.error('❌ Error creating pathology invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create pathology invoice',
      error: error.message
    });
  }
});

// ✅ Get pathology invoice by receipt number
router.get('/receipt/:receiptNumber', async (req, res) => {
  try {
    const { receiptNumber } = req.params;
    console.log(`🔍 [PATHOLOGY INVOICE] Searching for receipt: ${receiptNumber}`);

    const invoice = await PathologyInvoice.findOne({ receiptNumber: parseInt(receiptNumber) });

    // Enrich with latest names using IDs if available
    if (invoice) {
      const obj = invoice.toObject();

      // Patient (prefer new ref); fallback to string UHID like PAT000123
      const patientKey = obj.patientRef || obj.patientId || obj.patient?.registrationNumber;
      if (patientKey && mongoose.isValidObjectId(patientKey)) {
        try {
          const p = await Patient.findById(patientKey).select('_id firstName lastName phone gender age address patientId');
          if (p) {
            const name = `${p.firstName || ''} ${p.lastName || ''}`.trim() || obj.patient?.name;
            obj.patient = {
              ...(obj.patient || {}),
              _id: p._id,
              patientId: p.patientId || obj.patient?.patientId,
              name,
              phone: p.phone || obj.patient?.phone,
              gender: p.gender || obj.patient?.gender,
              age: p.age || obj.patient?.age,
              ageIn: p.ageIn || obj.patient?.ageIn,
              registrationNumber: obj.patient?.registrationNumber || p.patientId,
              address: obj.patient?.address || (p.address ? `${p.address.street || ''}, ${p.address.city || ''}, ${p.address.post || ''}`.replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '') : '')
            };
          }
        } catch {}
      } else if (typeof patientKey === 'string') {
        try {
          const p = await Patient.findOne({ patientId: patientKey }).select('_id firstName lastName phone gender age address patientId');
          if (p) {
            const name = `${p.firstName || ''} ${p.lastName || ''}`.trim() || obj.patient?.name;
            obj.patient = {
              ...(obj.patient || {}),
              _id: p._id,
              patientId: p.patientId || obj.patient?.patientId,
              name,
              phone: p.phone || obj.patient?.phone,
              gender: p.gender || obj.patient?.gender,
              age: p.age || obj.patient?.age,
              registrationNumber: obj.patient?.registrationNumber || p.patientId,
              address: obj.patient?.address || (p.address ? `${p.address.street || ''}, ${p.address.city || ''}, ${p.address.post || ''}`.replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '') : '')
            };
          }
        } catch {}
      }

      // Doctor (prefer new ref); fallback to string doctorId
      const doctorKey = obj.doctorRef || obj.doctorId;
      if (doctorKey && mongoose.isValidObjectId(doctorKey)) {
        try {
          const d = await Doctor.findById(doctorKey).select('_id name specialization');
          if (d) obj.doctor = { ...(obj.doctor || {}), _id: d._id, name: d.name, specialization: d.specialization || obj.doctor?.specialization };
        } catch {}
      } else if (typeof doctorKey === 'string' && doctorKey) {
        try {
          const d = await Doctor.findOne({ doctorId: doctorKey }).select('_id name specialization');
          if (d) obj.doctor = { ...(obj.doctor || {}), _id: d._id, name: d.name, specialization: d.specialization || obj.doctor?.specialization };
        } catch {}
      }

      // Department (prefer new ref); fallback to string departmentId
      const deptKey = obj.departmentRef || obj.departmentId;
      if (deptKey && mongoose.isValidObjectId(deptKey)) {
        try {
          const dept = await Department.findById(deptKey).select('_id name code');
          if (dept) obj.department = { ...(obj.department || {}), _id: dept._id, name: dept.name, code: dept.code || obj.department?.code };
        } catch {}
      } else if (typeof deptKey === 'string' && deptKey) {
        try {
          const dept = await Department.findOne({ departmentId: deptKey }).select('_id name code');
          if (dept) obj.department = { ...(obj.department || {}), _id: dept._id, name: dept.name, code: dept.code || obj.department?.code };
        } catch {}
      }

      // replace invoice variable with enriched object for response and further processing
      req.__enrichedInvoice = obj;
    }

    if (!invoice) {
      console.log('❌ [PATHOLOGY INVOICE] Invoice not found for receipt:', receiptNumber);

      // Debug: Check what receipts exist
      const allInvoices = await PathologyInvoice.find({}, { receiptNumber: 1 }).limit(10);
      console.log('📋 [PATHOLOGY INVOICE] Available receipt numbers:', allInvoices.map(i => i.receiptNumber));

      return res.status(404).json({
        success: false,
        message: 'Pathology invoice not found for receipt number',
        availableReceipts: allInvoices.map(i => i.receiptNumber)
      });
    }

    console.log('✅ [PATHOLOGY INVOICE] Invoice found:', invoice._id);
    console.log('✅ [PATHOLOGY INVOICE] Patient name:', invoice.patient?.name);

    // 🚨 FIX: Convert category ObjectId to category name in tests
    const CategoryHead = require('../models/CategoryHead');
    const processedInvoice = invoice.toObject();

    if (processedInvoice.tests && processedInvoice.tests.length > 0) {
      for (let test of processedInvoice.tests) {
        if (test.category && typeof test.category === 'string' && test.category.length === 24) {
          // This looks like ObjectId, convert to category name
          try {
            const categoryDoc = await CategoryHead.findById(test.category);
            if (categoryDoc) {
              test.category = categoryDoc.categoryName;
              test.categoryName = categoryDoc.categoryName;
              console.log(`🔄 Converted category ObjectId to name: ${categoryDoc.categoryName}`);
            }
          } catch (err) {
            console.log('⚠️ Could not convert category ObjectId:', test.category);
          }
        }
      }
    }

    const outgoing = (req.__enrichedInvoice ? { ...req.__enrichedInvoice, tests: processedInvoice.tests } : processedInvoice);

    res.json({
      success: true,
      invoice: outgoing
    });

  } catch (error) {
    console.error('❌ [PATHOLOGY INVOICE] Error fetching invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pathology invoice',
      error: error.message
    });
  }
});

// ✅ Get pathology registration by Lab Yearly Number
router.get('/yearly/:yearlyNo', async (req, res) => {
  try {
    const { yearlyNo } = req.params;
    console.log(`🔍 Searching pathologyregistration for yearly no: ${yearlyNo}`);

    const PathologyRegistration = require('../models/PathologyRegistration');

    const registration = await PathologyRegistration.findOne({ yearNumber: parseInt(yearlyNo) });

    if (!registration) {
      console.log('❌ Registration not found for yearly no:', yearlyNo);
      return res.status(404).json({
        success: false,
        message: 'Pathology registration not found with this Lab Yearly Number'
      });
    }

    console.log('✅ Registration found by yearly no:', registration);
    res.json({
      success: true,
      invoice: registration  // Keep 'invoice' key for frontend compatibility
    });

  } catch (error) {
    console.error('❌ Error fetching registration by yearly no:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pathology registration by yearly number',
      error: error.message
    });
  }
});

// ✅ Get pathology registration by Lab Daily Number
router.get('/daily/:dailyNo', async (req, res) => {
  try {
    const { dailyNo } = req.params;
    console.log(`🔍 Searching pathologyregistration for daily no: ${dailyNo}`);

    const PathologyRegistration = require('../models/PathologyRegistration');

    const registration = await PathologyRegistration.findOne({ todayNumber: parseInt(dailyNo) });

    if (!registration) {
      console.log('❌ Registration not found for daily no:', dailyNo);
      return res.status(404).json({
        success: false,
        message: 'Pathology registration not found with this Lab Daily Number'
      });
    }

    console.log('✅ Registration found by daily no:', registration);
    res.json({
      success: true,
      invoice: registration  // Keep 'invoice' key for frontend compatibility
    });

  } catch (error) {
    console.error('❌ Error fetching registration by daily no:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pathology registration by daily number',
      error: error.message
    });
  }
});

/*

// ✅ Get pathology registration by Registration Number
router.get('/registration/:registrationNo', async (req, res) => {
  try {
    const { registrationNo } = req.params;
    console.log(`🔍 Searching pathologyregistration for registration no: ${registrationNo}`);

    const PathologyRegistration = require('../models/PathologyRegistration');

    const registration = await PathologyRegistration.findOne({
      'patient.registrationNumber': registrationNo
    });

    if (!registration) {
      console.log('❌ Registration not found for registration no:', registrationNo);
      return res.status(404).json({
        success: false,
        message: 'Pathology registration not found with this Registration Number'
      });
    }

    console.log('✅ Registration found by registration no:', registration);
    res.json({
      success: true,
      invoice: registration  // Keep 'invoice' key for frontend compatibility
    });

  } catch (error) {
    console.error('❌ Error fetching registration by registration no:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pathology registration by registration number',
      error: error.message
    });

});
*/





// Get all invoices with pagination, enriching names via live join when IDs present
router.get('/list', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // 🏢 Multi-Tenant: Build query with labId filter
    const query = {};
    if (!req.isSuperAdmin && req.labId) {
      query.labId = req.labId;
      console.log(`📋 Fetching invoices for Lab: ${req.labId} - Page: ${page}, Limit: ${limit}`);
    } else {
      console.log(`📋 Fetching ALL invoices (SuperAdmin) - Page: ${page}, Limit: ${limit}`);
    }

    const [invoices, total] = await Promise.all([
      PathologyInvoice.find(query)
        // Sort by latest receipt number first to guarantee newest invoices appear on page 1
        .sort({ receiptNumber: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      PathologyInvoice.countDocuments(query)
    ]);

    console.log(`✅ Found ${invoices.length} invoices out of ${total} total (after filters)`);

    // Prefer new refs; fallback to legacy string IDs
    const patientIds = invoices
      .map(inv => inv.patientRef || (mongoose.isValidObjectId(inv.patientId) ? inv.patientId : null))
      .filter(id => !!id && mongoose.isValidObjectId(id));

    const doctorIds = invoices
      .map(inv => inv.doctorRef || (mongoose.isValidObjectId(inv.doctorId) ? inv.doctorId : null))
      .filter(id => !!id && mongoose.isValidObjectId(id));

    const departmentIds = invoices
      .map(inv => inv.departmentRef || (mongoose.isValidObjectId(inv.departmentId) ? inv.departmentId : null))
      .filter(id => !!id && mongoose.isValidObjectId(id));

    const [patientsMap, doctorsMap, departmentsMap] = await Promise.all([
      (async () => {
        if (patientIds.length === 0) return new Map();
        const docs = await Patient.find({ _id: { $in: patientIds } }).select('_id firstName lastName phone gender age ageIn address patientId');
        const m = new Map(); docs.forEach(p => m.set(p._id.toString(), p)); return m;
      })(),
      (async () => {
        if (doctorIds.length === 0) return new Map();
        const docs = await Doctor.find({ _id: { $in: doctorIds } }).select('_id name specialization');
        const m = new Map(); docs.forEach(d => m.set(d._id.toString(), d)); return m;
      })(),
      (async () => {
        if (departmentIds.length === 0) return new Map();
        const docs = await Department.find({ _id: { $in: departmentIds } }).select('_id name code');
        const m = new Map(); docs.forEach(d => m.set(d._id.toString(), d)); return m;
      })()
    ]);

    const enriched = invoices.map(inv => {
      const obj = inv.toObject ? inv.toObject() : inv;
      const p = patientsMap.get((obj.patientRef || obj.patientId || '').toString());
      if (p) {
        const name = `${p.firstName || ''} ${p.lastName || ''}`.trim() || obj.patient?.name;
        const existing = obj.patient || {};
        obj.patient = {
          ...existing,
          name,
          phone: p.phone || existing.phone,
          gender: p.gender || existing.gender,
          age: (existing.age !== undefined && existing.age !== null && String(existing.age) !== '') ? existing.age : p.age,
          ageIn: (existing.ageIn !== undefined && existing.ageIn !== null && String(existing.ageIn) !== '') ? existing.ageIn : p.ageIn,
          registrationNumber: existing.registrationNumber || p.patientId,
          address: existing.address || (p.address ? `${p.address.street || ''}, ${p.address.city || ''}, ${p.address.post || ''}`.replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '') : '')
        };
      }
      const d = doctorsMap.get((obj.doctorRef || obj.doctorId || '').toString());
      if (d) obj.doctor = { ...(obj.doctor || {}), name: d.name, specialization: d.specialization || obj.doctor?.specialization };
      const dept = departmentsMap.get((obj.departmentRef || obj.departmentId || '').toString());
      if (dept) obj.department = { ...(obj.department || {}), name: dept.name, code: dept.code || obj.department?.code };
      return obj;
    });

    // Set no-cache headers to ensure clients always receive fresh data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.json({
      success: true,
      invoices: enriched,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Error fetching invoices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoices',
      error: error.message
    });
  }
});

// Update existing pathology invoice
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🔄 Updating pathology invoice with ID: ${id}`);
    console.log('📋 Update data:', JSON.stringify(req.body, null, 2));

    // Fix address field if it's an object
    if (req.body.patient && req.body.patient.address && typeof req.body.patient.address === 'object') {
      const addr = req.body.patient.address;
      req.body.patient.address = `${addr.street || ''}, ${addr.city || ''}, ${addr.post || ''}`.replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '') || '';
      console.log('🔧 Fixed address field:', req.body.patient.address);
    }

    // Parse age field to separate age and ageIn (for update)
    if (req.body.patient && req.body.patient.age != null && req.body.patient.age !== '') {
      const ageStr = req.body.patient.age.toString();
      const ageMatch = ageStr.match(/^\s*(\d+)\s*([YMD])\s*$/i);

      if (ageMatch) {
        // If age is in format "7 D", separate it
        req.body.patient.age = parseInt(ageMatch[1], 10);
        const unit = ageMatch[2].toUpperCase();
        req.body.patient.ageIn = unit === 'Y' ? 'Years' : unit === 'M' ? 'Months' : 'Days';
        console.log('🔧 Parsed age (update):', req.body.patient.age, 'ageIn:', req.body.patient.ageIn);
      } else {
        // If age is just a number, keep it as is
        const ageNum = parseInt(ageStr, 10);
        if (!isNaN(ageNum)) {
          req.body.patient.age = ageNum;
        }
      }
    }

    // Normalize ageIn to full words on update as well
    if (req.body.patient) {
      let ai = ((req.body.patient.ageIn ?? '') + '').toString().trim().toLowerCase();
      if (!ai && typeof req.body.patient.age === 'number' && !isNaN(req.body.patient.age)) {
        ai = 'years';
      }
      if (ai.startsWith('y')) req.body.patient.ageIn = 'Years';
      else if (ai.startsWith('m')) req.body.patient.ageIn = 'Months';
      else if (ai.startsWith('d')) req.body.patient.ageIn = 'Days';
      else if (!req.body.patient.ageIn) req.body.patient.ageIn = 'Years';
    }

    const invoice = await PathologyInvoice.findById(id);
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    // Prepare request body and compute PATHOLOGY-only diffs to enforce scoped locks
    const body = req.body || {};
    const beforeTests = Array.isArray(invoice.tests) ? invoice.tests : [];
    const afterTests  = Array.isArray(body.tests) ? body.tests : null; // null => tests untouched

    const normCat = (v) => (v || '').toString().trim().toUpperCase();
    const isPathology = (t) => {
      const c = normCat(t?.category || t?.categoryName);
      return c === 'PATHOLOGY' || c === 'PATH';
    };
    const keyOf = (t) => (t?.testDefinitionId || t?.serviceHeadId || `${(t?.name||t?.testName||'').toString().trim()}|${normCat(t?.category||t?.categoryName)}`);
    const sig = (t) => ({
      qty: Number(t?.quantity ?? 1),
      cost: Number(t?.cost ?? t?.netAmount ?? 0),
      discount: Number(t?.discount ?? 0)
    });

    let removedPath = 0, addedPath = 0, changedPath = 0;
    if (afterTests) {
      const beforeMap = new Map(beforeTests.filter(isPathology).map(t => [String(keyOf(t)), sig(t)]));
      const afterMap  = new Map(afterTests.filter(isPathology).map(t => [String(keyOf(t)), sig(t)]));
      // removals
      for (const k of beforeMap.keys()) if (!afterMap.has(k)) removedPath++;
      // additions
      for (const k of afterMap.keys()) if (!beforeMap.has(k)) addedPath++;
      // modifications
      for (const [k, sBefore] of beforeMap.entries()) {
        const sAfter = afterMap.get(k);
        if (sAfter && (sAfter.qty !== sBefore.qty || sAfter.cost !== sBefore.cost || sAfter.discount !== sBefore.discount)) changedPath++;
      }
    }

    // Hard lock: if any pathology report exists for this receipt, only block edits to PATHOLOGY items
    try {
      const rec = invoice.receiptNumber;
      const candidates = [rec, String(rec)];
      const found = await mongoose.connection.db.collection('reports').findOne({
        reportType: 'pathology',
        $or: [ { receiptNo: { $in: candidates } }, { receiptNumber: { $in: candidates } } ]
      }, { projection: { _id: 1 } });
      if (found && afterTests) {
        if (removedPath > 0 || addedPath > 0 || changedPath > 0) {
          return res.status(403).json({ success: false, message: 'Editing locked — cannot add/remove/modify PATHOLOGY tests after report generated. Other categories can be updated.' });
        }
      }
    } catch (e) {
      console.warn('⚠️ Report check failed during update, proceeding cautiously:', e?.message);
    }

    // Soft lock: if pathology registration exists and cashEditAllowed is not enabled -> only block removal of PATHOLOGY tests
    try {
      const PathologyRegistration = require('../models/PathologyRegistration');
      const rec = invoice.receiptNumber;
      const registration = await PathologyRegistration.findOne({
        $or: [ { receiptNumber: rec }, { receiptNumber: String(rec) } ]
      }).select('cashEditAllowed');
      if (registration && !registration.cashEditAllowed && afterTests && removedPath > 0) {
        return res.status(403).json({
          success: false,
          message: 'Permission required — cannot remove PATHOLOGY tests until Pathology toggles "Edit Allowed" in Registered Reports.'
        });
      }
    } catch (e) {
      console.warn('⚠️ Registration permission check failed (continuing):', e?.message);
    }


    // Build edit history entry (before/after diffs for key fields)
    const changes = {};
    try {
      // total amount
      if (body.payment?.totalAmount !== undefined && invoice.payment?.totalAmount !== body.payment.totalAmount) {
        changes.payment = changes.payment || {};
        changes.payment.totalAmount = { before: invoice.payment?.totalAmount, after: body.payment.totalAmount };
      }
      // tests
      if (Array.isArray(body.tests)) {
        changes.testsBefore = invoice.tests || [];
        changes.testsAfter = body.tests;
      }
      // department/doctor/mode/doctorRefNo
      if (body.department?.name && body.department?.name !== invoice.department?.name) {
        changes.department = { before: invoice.department?.name, after: body.department.name };
      }
      if (body.doctor?.name && body.doctor?.name !== invoice.doctor?.name) {
        changes.doctor = { before: invoice.doctor?.name, after: body.doctor.name };
      }
      if (body.mode !== undefined && body.mode !== invoice.mode) {
        changes.mode = { before: invoice.mode, after: body.mode };
      }
      if (body.doctorRefNo !== undefined && body.doctorRefNo !== invoice.doctorRefNo) {
        changes.doctorRefNo = { before: invoice.doctorRefNo, after: body.doctorRefNo };
      }
    } catch (e) {
      console.warn('⚠️ Failed to compute change diffs:', e.message);
    }

    // Update with $set and push edit history
    const updateDoc = {
      ...body,
      updatedAt: new Date(),
      isEdited: true,
      lastEditedAt: new Date(),
      lastEditedBy: (req.user && (req.user.name || req.user.email)) || 'System'
    };

    // Normalize appointmentRef if sent
    if (body.appointmentRef && mongoose.isValidObjectId(body.appointmentRef)) {
      updateDoc.appointmentRef = body.appointmentRef;
    } else if (!body.appointmentRef && body.appointmentId) {
      try {
        const appt = await Appointment.findOne({ appointmentId: body.appointmentId }).select('_id');
        if (appt) updateDoc.appointmentRef = appt._id;
      } catch {}
    }

    // Compute adjustment delta (newTotal - oldTotal)
    const oldTotal = Number(invoice?.payment?.totalAmount || 0);
    const newTotal = Number(body?.payment?.totalAmount ?? oldTotal);
    const delta = newTotal - oldTotal;

    const pushOps = {
      editHistory: { editedAt: new Date(), editedBy: updateDoc.lastEditedBy, changes }
    };
    if (delta !== 0) {
      pushOps['payment.adjustments'] = {
        delta,
        reason: 'EDIT',
        note: Array.isArray(body.tests) && body.tests.length === 0 ? 'ALL_TESTS_CANCELLED' : '',
        at: new Date()
      };
    }

    // Prepare safe adjustments array (avoid $push on unknown nested path)
    let updatedAdjustments = Array.isArray(invoice?.payment?.adjustments) ? [...invoice.payment.adjustments] : [];
    if (delta !== 0) {
      updatedAdjustments.push({
        delta,
        reason: 'EDIT',
        note: Array.isArray(body.tests) && body.tests.length === 0 ? 'ALL_TESTS_CANCELLED' : '',
        at: new Date()
      });
    }

    // Merge payment safely; avoid conflict of setting 'payment' and 'payment.adjustments' together
    const basePayment = invoice?.payment || {};
    const bodyPayment = body?.payment || {};
    const mergedPayment = {
      subtotal: Number(bodyPayment.subtotal ?? basePayment.subtotal ?? 0),
      totalDiscount: Number(bodyPayment.totalDiscount ?? basePayment.totalDiscount ?? 0),
      totalAmount: newTotal,
      paymentMethod: bodyPayment.paymentMethod ?? basePayment.paymentMethod ?? 'CASH',
      paymentStatus: bodyPayment.paymentStatus ?? basePayment.paymentStatus ?? 'PAID',
      // Preserve original payment date; never move it to 'today' on edit
      paymentDate: (bodyPayment.paymentDate ?? basePayment.paymentDate ?? invoice?.payment?.paymentDate ?? invoice?.bookingDate ?? invoice?.createdAt),
      adjustments: updatedAdjustments
    };

    const { payment: _omitPayment, ...restUpdate } = updateDoc;

    const updatedInvoice = await PathologyInvoice.findByIdAndUpdate(
      id,
      {
        $set: { ...restUpdate, payment: mergedPayment },
        $push: { editHistory: { editedAt: new Date(), editedBy: updateDoc.lastEditedBy, changes } }
      },
      { new: true, runValidators: false }
    );


	    // \ud83d\udd10 Audit: UPDATE (centralized)
	    try { const { recordAudit } = require('../utils/audit');
	      await recordAudit({
	        req,
	        entityType: 'PathologyInvoice',
	        entityId: updatedInvoice._id,
	        action: 'UPDATE',
	        beforeDoc: invoice.toObject ? invoice.toObject() : invoice,
	        afterDoc: updatedInvoice.toObject ? updatedInvoice.toObject() : updatedInvoice,
	        meta: { endpoint: 'PUT /pathology-invoice/:id', receiptNumber: updatedInvoice.receiptNumber }
	      });
	    } catch (e) { console.warn('\u26a0\ufe0f PathologyInvoice audit failed:', e?.message); }

    console.log('✅ Invoice updated successfully');
    console.log('📧 Updated invoice receipt number:', updatedInvoice.receiptNumber);

    // 🔄 Sync PATHOLOGY tests into PathologyRegistration.tests so Registered Report reflects removals/additions
    try {
      const PathologyRegistration = require('../models/PathologyRegistration');
      const rec = updatedInvoice.receiptNumber;
      if (rec != null) {
        const tests = Array.isArray(updatedInvoice.tests) ? updatedInvoice.tests : [];
        const pathTests = tests
          .filter(t => ((t?.category || '').toString().trim().toUpperCase() === 'PATHOLOGY') || ((t?.category || '').toString().trim().toUpperCase() === 'PATH'))
          .map(t => ({
            name: t.name || t.testName,
            category: t.category || 'PATHOLOGY',
            categoryId: t.categoryId || null,
            serviceHeadId: t.serviceHeadId || null,
            testDefinitionId: t.testDefinitionId || null,
            cost: Number(t.cost ?? t.netAmount ?? 0),
            quantity: Number(t.quantity ?? 1),
            discount: Number(t.discount ?? 0),
            netAmount: Number(t.netAmount ?? t.cost ?? 0)
          }));

        await PathologyRegistration.findOneAndUpdate(
          { $or: [ { receiptNumber: rec }, { receiptNumber: String(rec) } ] },
          { $set: { tests: pathTests, invoiceRef: updatedInvoice._id, doctorRefNo: updatedInvoice.doctorRefNo || '' } },
          { new: false }
        );
        console.log('🔁 Synced PATHOLOGY tests to registration for receipt', rec, 'count:', pathTests.length);
      }
    } catch (e) {
      console.warn('⚠️ Failed to sync registration tests from invoice update:', e?.message);
    }

    res.json({
      success: true,
      message: 'Invoice updated successfully',
      invoice: updatedInvoice,
      adjustment: { delta, action: delta > 0 ? 'COLLECT' : delta < 0 ? 'REFUND' : 'NONE' }
    });


  } catch (error) {
    console.error('❌ Error updating invoice:', error);
    res.status(500).json({ success: false, message: 'Failed to update invoice', error: error.message });
  }
});


// ✅ Delete pathology invoice by receipt number

// 🔎 Check if a receipt is linked to Pathology (registration/report)
router.get('/receipt/:receiptNumber/linked', async (req, res) => {
  try {
    const { receiptNumber } = req.params;
    const rn = parseInt(receiptNumber);

    const invoice = await PathologyInvoice.findOne({ receiptNumber: rn }, { _id: 1 }).lean();
    if (!invoice) {
      // If invoice not found from list context, treat as not linked
      return res.json({ linked: false });
    }

    const PathologyRegistration = require('../models/PathologyRegistration');
    const linkedReg = await PathologyRegistration.findOne({
      $or: [
        { receiptNumber: rn },
        { invoiceRef: invoice._id }
      ]
    }).lean();

    return res.json({ linked: !!linkedReg });
  } catch (error) {
    console.error('❌ Error checking pathology link for receipt:', error);
    return res.status(500).json({ linked: false, error: 'INTERNAL_ERROR' });
  }
});

// Get latest (global) receipt number to decide delete-button visibility on UI
router.get('/last-receipt', async (req, res) => {
  try {
    const latest = await PathologyInvoice.findOne({})
      .select('receiptNumber bookingDate createdAt')
      .sort({ receiptNumber: -1, createdAt: -1 })
      .lean();
    const last = Number(latest?.receiptNumber || 0);
    return res.json({ success: true, lastReceiptNumber: last });
  } catch (e) {
    console.error('❌ Error fetching last receipt:', e);
    return res.status(500).json({ success: false, message: 'Failed to fetch last receipt', error: e.message });
  }
});


router.delete('/receipt/:receiptNumber', async (req, res) => {
  try {
    const { receiptNumber } = req.params;
    console.log(`🗑️ Deleting pathology invoice with receipt: ${receiptNumber}`);

    const rnNum = parseInt(receiptNumber);
    const invoiceToDelete = await PathologyInvoice.findOne({
      $or: [
        { receiptNumber: rnNum },
        { receiptNumber: receiptNumber }
      ]
    });

    if (!invoiceToDelete) {
      console.log('❌ Invoice not found for deletion (treating as already deleted):', receiptNumber);
      return res.json({ success: true, alreadyDeleted: true, message: 'Receipt already deleted or not found' });
    }

    // Determine year from invoice dates
    const invoiceYear = invoiceToDelete.bookingDate
      ? new Date(invoiceToDelete.bookingDate).getFullYear()
      : (invoiceToDelete.createdAt ? new Date(invoiceToDelete.createdAt).getFullYear() : new Date().getFullYear());

    // Enforce: only the very latest receipt can be deleted
    const latest = await PathologyInvoice.findOne({})
      .select('receiptNumber')
      .sort({ receiptNumber: -1, createdAt: -1 })
      .lean();
    if (!latest || Number(latest.receiptNumber) !== Number(invoiceToDelete.receiptNumber)) {
      return res.status(409).json({
        success: false,
        code: 'NOT_LAST_RECEIPT',
        message: 'Only the latest receipt can be deleted'
      });
    }

    // Block delete if linked to pathology registration
    const PathologyRegistration = require('../models/PathologyRegistration');
    const linkedReg = await PathologyRegistration.findOne({
      $or: [
        { receiptNumber: parseInt(receiptNumber) },
        { invoiceRef: invoiceToDelete._id }
      ]
    });
    if (linkedReg) {
      return res.status(409).json({
        success: false,
        code: 'LINKED_TO_PATHOLOGY',
        message: 'Cannot delete: this receipt is registered in Pathology.'
      });
    }

    // Archive a copy of this invoice before hard delete
    try {
      const DeletedRecord = require('../models/DeletedRecord');
      await DeletedRecord.create({
        entityType: 'PATHOLOGY_INVOICE',
        originalCollection: 'pathologyinvoices',
        originalId: invoiceToDelete._id,
        receiptNumber: Number(invoiceToDelete.receiptNumber),
        year: invoiceYear,
        reason: req.query.reason || req.body?.reason || '',
        deletedBy: (req.user && (req.user.name || req.user.email || req.user.id)) || 'System',
        deletedAt: new Date(),
        data: invoiceToDelete.toObject ? invoiceToDelete.toObject() : invoiceToDelete
      });
    } catch (e) {
      console.warn('⚠️ Failed to archive deleted invoice:', e?.message);
    }

    // Hard delete from main collection
    await PathologyInvoice.deleteOne({ _id: invoiceToDelete._id });

    // Sync yearly receipt counter to the new last value for that year
    const counterName = `receipt_${invoiceYear}`;
    const startOfYear = new Date(invoiceYear, 0, 1);
    const endOfYear = new Date(invoiceYear, 11, 31, 23, 59, 59, 999);
    const after = await PathologyInvoice.findOne({
      $or: [
        { bookingDate: { $gte: startOfYear, $lte: endOfYear } },
        { createdAt: { $gte: startOfYear, $lte: endOfYear } }
      ]
    }).sort({ receiptNumber: -1 }).select('receiptNumber').lean();

    const newCounterValue = Number(after?.receiptNumber || 0);
    await Counter.findOneAndUpdate(
      { name: counterName },
      { $set: { value: newCounterValue } },
      { upsert: true }
    );

    return res.json({ success: true, message: 'Invoice deleted', receiptNumber: Number(receiptNumber) });
  } catch (error) {
    console.error('❌ Error deleting pathology invoice:', error);
    res.status(500).json({ success: false, message: 'Failed to delete pathology invoice', error: error.message });
  }
});


// Update print status
router.patch('/:id/print', async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await PathologyInvoice.findByIdAndUpdate(
      id,
      {
        isPrinted: true,
        printedAt: new Date()
      },
      { new: true }
    );

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    res.json({
      success: true,
      message: 'Print status updated',
      invoice
    });

  } catch (error) {
    console.error('❌ Error updating print status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update print status',
      error: error.message
    });
  }
});

// Get revenue report by department
router.get('/reports/department', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build date filter
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        bookingDate: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };
    }

    // Aggregate revenue by department
    const departmentRevenue = await PathologyInvoice.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$department.name',
          totalRevenue: { $sum: '$payment.totalAmount' },
          totalInvoices: { $sum: 1 },
          departmentCode: { $first: '$department.code' }
        }
      },
      { $sort: { totalRevenue: -1 } }
    ]);

    res.json({
      success: true,
      departmentRevenue,
      totalDepartments: departmentRevenue.length
    });

  } catch (error) {
    console.error('❌ Error fetching department revenue:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch department revenue',
      error: error.message
    });
  }
});

// Get revenue report by category
router.get('/reports/category', async (req, res) => {
  try {
    const { startDate, endDate, department } = req.query;

    // Build filters
    let matchFilter = {};
    if (startDate && endDate) {
      matchFilter.bookingDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    if (department) {
      matchFilter['department.name'] = department;
    }

    // Aggregate revenue by test category
    const categoryRevenue = await PathologyInvoice.aggregate([
      { $match: matchFilter },
      { $unwind: '$tests' },
      {
        $group: {
          _id: {
            category: '$tests.category',
            department: '$department.name'
          },
          totalRevenue: { $sum: '$tests.netAmount' },
          totalTests: { $sum: '$tests.quantity' },
          averagePrice: { $avg: '$tests.cost' }
        }
      },
      { $sort: { totalRevenue: -1 } }
    ]);

    res.json({
      success: true,
      categoryRevenue,
      totalCategories: categoryRevenue.length
    });

  } catch (error) {
    console.error('❌ Error fetching category revenue:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category revenue',
      error: error.message
    });
  }
});

// Get daily revenue summary
router.get('/reports/daily', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Default to last 30 days if no dates provided
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const dailyRevenue = await PathologyInvoice.aggregate([
      {
        $match: {
          deleted: { $ne: true },
          bookingDate: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$bookingDate' },
            month: { $month: '$bookingDate' },
            day: { $dayOfMonth: '$bookingDate' }
          },
          totalRevenue: { $sum: '$payment.totalAmount' },
          totalInvoices: { $sum: 1 },
          departments: { $addToSet: '$department.name' },
          categories: { $addToSet: '$tests.category' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    res.json({
      success: true,
      dailyRevenue,
      totalDays: dailyRevenue.length
    });

  } catch (error) {
    console.error('❌ Error fetching daily revenue:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch daily revenue',
      error: error.message
    });
  }
});

// Get receipt-level data for a date range (for tooltips)
router.get('/reports/receipts', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const docs = await PathologyInvoice.find({
      bookingDate: { $gte: start, $lte: end }
    })
      .select('bookingDate payment.totalAmount receiptNumber patient.name')
      .sort({ bookingDate: 1, receiptNumber: 1 })
      .lean();

    const receipts = (docs || []).map(d => ({
      date: d.bookingDate,
      receiptNumber: d.receiptNumber,
      amount: (d.payment && typeof d.payment.totalAmount === 'number') ? d.payment.totalAmount : 0,
      patientName: d.patient && d.patient.name ? d.patient.name : ''
    }));

    res.json({ success: true, receipts, count: receipts.length });
  } catch (error) {
    console.error('❌ Error fetching receipt-level data:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch receipts', error: error.message });
  }
});


module.exports = router;
