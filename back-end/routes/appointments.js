const express = require('express');
const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Room = require('../models/Room');
const Counter = require('../models/Counter');

const { authenticateToken, requirePermissions, authorizeRoles } = require('../middlewares/auth');
const router = express.Router();

// Test route to verify appointments route is working
router.get('/test', (req, res) => {
  console.log('🧪 Test route hit!');
  res.json({ success: true, message: 'Appointments route is working!' });
});

// Test endpoint to manually mark Rahi Yadav appointments as completed (no auth required)
router.post('/test-mark-rahi-completed', async (req, res) => {
  console.log('🧪 Test endpoint to mark Rahi Yadav appointments as completed');

  try {
    // Find Rahi Yadav patients
    const rahiPatients = await Patient.find({
      firstName: { $regex: /rahi/i },
      lastName: { $regex: /yadav/i }
    });

    console.log('🔍 Found Rahi patients:', rahiPatients.length);

    if (rahiPatients.length > 0) {
      const patientIds = rahiPatients.map(p => p._id);

      // Mark all their appointments as completed
      const result = await Appointment.updateMany(
        {
          patient: { $in: patientIds }
        },
        {
          $set: {
            newRegistrationCompleted: true,
            updatedAt: new Date()
          }
        }
      );

      console.log('✅ Updated appointments count:', result.modifiedCount);

      res.json({
        success: true,
        message: 'Rahi Yadav appointments marked as completed',
        updatedCount: result.modifiedCount,
        patientsFound: rahiPatients.length
      });
    } else {
      res.json({
        success: false,
        message: 'No Rahi Yadav patients found'
      });
    }

  } catch (error) {
    console.error('❌ Error in test endpoint:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }

// Daily OPD counter (from Counter; fallback to count)
router.get('/counters/daily', async (req, res) => {
  try {
    const { date } = req.query;
    const target = date ? new Date(date) : new Date();
    const y = target.getFullYear();
    const m = String(target.getMonth() + 1).padStart(2, '0');
    const d = String(target.getDate()).padStart(2, '0');
    const CounterService = require('../services/counter-service');
    const counterName = `opd_today_${y}${m}${d}`;
    let value = await CounterService.getCurrentValue(counterName);

    // Fallback if counter missing
    if (!value || value <= 0) {
      const start = new Date(y, target.getMonth(), target.getDate());
      const end = new Date(y, target.getMonth(), target.getDate() + 1);
      value = await Appointment.countDocuments({ appointmentDate: { $gte: start, $lt: end }, status: { $ne: 'Cancelled' } });
    }

    res.json({ success: true, date: `${y}-${m}-${d}`, count: value });
  } catch (e) {
    console.error('Daily counter error:', e);
    res.status(500).json({ success: false, message: 'Failed to get daily counter', error: e.message });
  }
});

// Monthly OPD counter (from Counter; fallback to count)
router.get('/counters/monthly', async (req, res) => {
  try {
    const year = parseInt(String(req.query.year || '')) || new Date().getFullYear();
    const month = parseInt(String(req.query.month || '')) || (new Date().getMonth() + 1);
    const mm = String(month).padStart(2, '0');
    const CounterService = require('../services/counter-service');
    const counterName = `opd_month_${year}${mm}`;
    let value = await CounterService.getCurrentValue(counterName);

    if (!value || value <= 0) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);
      value = await Appointment.countDocuments({ appointmentDate: { $gte: start, $lt: end }, status: { $ne: 'Cancelled' } });
    }

    res.json({ success: true, year, month: mm, count: value });
  } catch (e) {
    console.error('Monthly counter error:', e);
    res.status(500).json({ success: false, message: 'Failed to get monthly counter', error: e.message });
  }
});

});

// FIXED APPOINTMENT BOOKING ROUTE
router.post('/book-opd', async (req, res) => {
  console.log('🚀🚀🚀 APPOINTMENT ROUTE HIT! /book-opd 🚀🚀🚀');
  console.log('🚀 Request body:', req.body);

  try {
    const { patient, room, department, appointmentDate, appointmentTime, reason, type = 'Consultation', weightKg, consultationFee, paymentMethod } = req.body;

    // Basic validation
    if (!patient) {
      return res.status(400).json({ success: false, message: 'Patient ID is required' });
    }
    if (!room) {
      return res.status(400).json({ success: false, message: 'Room is required' });
    }

    // Parse appointment date
    let parsedDate = new Date();
    if (appointmentDate) {
      parsedDate = new Date(appointmentDate);
      if (isNaN(parsedDate.getTime())) {
        parsedDate = new Date();
      }
    }

    // Get current time
    const currentTime = new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    // Normalize day for uniqueness (YYYY-MM-DD)
    const dayStr = new Date(parsedDate).toISOString().slice(0, 10);

    // Prevent duplicate booking: check if an appointment already exists for this patient on this day
    const existing = await Appointment.findOne({ patient, appointmentDay: dayStr, status: { $ne: 'Cancelled' } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Appointment already booked today for this patient', existingAppointment: existing });
    }

    // Create appointment
    const appointmentData = {
      patient,
      room,
      department,
      appointmentDate: parsedDate,
      appointmentDay: dayStr,
      appointmentTime: appointmentTime || currentTime,
      reason: reason || 'OPD Consultation',
      type,
      status: 'Scheduled',
      consultationFee: typeof consultationFee === 'number' ? consultationFee : 1,
      weightKg: weightKg ? parseFloat(weightKg) : undefined,
      paymentMethod: (paymentMethod === 'UPI' || paymentMethod === 'Cash') ? paymentMethod : 'Cash'
    };

    console.log('📅 Creating appointment with data:', appointmentData);

    // Generate separate OPD counters (do NOT affect appointmentId counter)
    try {
      const CounterService = require('../services/counter-service');
      // Use the actual appointment date for counters so back-dated entries affect the correct day/month
      const baseDate = appointmentData.appointmentDate ? new Date(appointmentData.appointmentDate) : new Date();
      const y = baseDate.getFullYear();
      const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
      const dd = String(baseDate.getDate()).padStart(2, '0');

      const yearRes = await CounterService.getNextValue(`opd_year_${y}`, '', 0);
      const monthRes = await CounterService.getNextValue(`opd_month_${y}${mm}`, '', 0);
      const dayRes = await CounterService.getNextValue(`opd_today_${y}${mm}${dd}`, '', 0);

      appointmentData.yearlyNo = yearRes?.value;
      appointmentData.monthlyNo = monthRes?.value;
      appointmentData.dailyNo = dayRes?.value;
    } catch (e) {
      console.warn('⚠️ OPD counters generation failed (will fallback in reports):', e?.message);
    }

    const newAppointment = new Appointment(appointmentData);
    const savedAppointment = await newAppointment.save();

    // Populate patient details for response
    await savedAppointment.populate('patient', 'firstName lastName phone patientId age gender ageIn aadharNo address city post remark');

    console.log('✅ Appointment created successfully:', savedAppointment);

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully',
      appointment: savedAppointment
    });

  } catch (error) {
    console.error('❌ Appointment booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to book appointment: ' + error.message
    });
  }
});

// ORIGINAL COMPLEX ROUTE (COMMENTED OUT FOR NOW)
router.post('/book-opd-original', async (req, res) => {
  console.log('🚀🚀🚀 ORIGINAL APPOINTMENT ROUTE HIT! 🚀🚀🚀');
  console.log('🚀 Request received at:', new Date().toISOString());
  console.log('🚀 Request method:', req.method);
  console.log('🚀 Request URL:', req.url);

  // Declare appointmentData outside try block for error handling access
  let appointmentData;

  try {
    console.log('📅 OPD Appointment booking request received');
    console.log('📅 Request body:', JSON.stringify(req.body, null, 2));

    const { patient, doctor, room, department, appointmentDate, appointmentTime, reason, type = 'Consultation' } = req.body;

    console.log('📅 Extracted fields:');
    console.log('   Patient ID:', patient);
    console.log('   Doctor ID:', doctor);
    console.log('   Room ID:', room);
    console.log('   Department ID:', department);
    console.log('   Appointment Date:', appointmentDate);
    console.log('   Appointment Time:', appointmentTime);

    // Validate required fields
    if (!patient) {
      return res.status(400).json({ success: false, message: 'Patient ID is required' });
    }
    if (!appointmentDate) {
      console.log('❌ appointmentDate is missing or null');
      return res.status(400).json({ success: false, message: 'Appointment date is required' });
    }
    // Either room or doctor should be provided
    if (!room && !doctor) {
      return res.status(400).json({ success: false, message: 'Either Room or Doctor is required' });
    }

    console.log('📅 Validating patient...');

    // Verify patient exists in MongoDB
    console.log('🔍 Looking for patient with ID:', patient);
    console.log('🔍 Patient ID type:', typeof patient);

    let patientExists = null;

    try {
      patientExists = await Patient.findById(patient);
      if (patientExists) {
        console.log('✅ Found patient in MongoDB:', patientExists.firstName, patientExists.lastName);
      }
    } catch (error) {
      console.log('⚠️ Invalid ObjectId format, trying alternative search...');

      // Try searching by patientId field instead
      patientExists = await Patient.findOne({ patientId: patient });
      if (patientExists) {
        console.log('✅ Found patient by patientId:', patientExists.firstName, patientExists.lastName);
      }
    }

    if (!patientExists) {
      console.log('❌ Patient not found:', patient);

      // Try to find any patients to see if database has data
      const allPatients = await Patient.find({}).limit(5);
      console.log('📋 Available patients in database:', allPatients.length);
      if (allPatients.length > 0) {
        console.log('📋 Sample patient IDs:', allPatients.map(p => ({ id: p._id, name: p.firstName + ' ' + p.lastName })));
      }

      return res.status(404).json({ success: false, message: 'Patient not found' });
    }
    console.log('✅ Patient found:', patientExists.firstName, patientExists.lastName);

    // Verify doctor exists (if provided)
    let doctorExists = null;
    if (doctor) {
      doctorExists = await Doctor.findById(doctor);
      if (!doctorExists) {
        console.log('❌ Doctor not found:', doctor);
        return res.status(404).json({ success: false, message: 'Doctor not found' });
      }
      console.log('✅ Doctor found:', doctorExists.firstName, doctorExists.lastName);
    }

    // Verify room exists (if provided)
    let roomExists = null;
    if (room) {
      const Room = require('../models/Room');
      roomExists = await Room.findById(room).populate('department');
      if (!roomExists) {
        console.log('❌ Room not found:', room);
        return res.status(404).json({ success: false, message: 'Room not found' });
      }
      console.log('✅ Room found:', roomExists.roomNumber, 'in', roomExists.department?.name);
    }

    // Parse and validate appointment date
    console.log('📅 Parsing appointmentDate:', appointmentDate);
    let parsedDate;

    if (appointmentDate instanceof Date) {
      parsedDate = appointmentDate;
    } else if (typeof appointmentDate === 'string') {
      parsedDate = new Date(appointmentDate);
    } else {
      parsedDate = new Date();
    }

    console.log('📅 Parsed date:', parsedDate);
    console.log('📅 Date is valid:', !isNaN(parsedDate.getTime()));

    if (isNaN(parsedDate.getTime())) {
      console.log('❌ Invalid date format, using current date');
      parsedDate = new Date();
    }

    console.log('📅 Appointment booking allowed anytime...');

    // Get current time in HH:MM format
    const currentTime = new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    // Create appointment data (appointmentId will be auto-generated by pre-save hook)
    appointmentData = {
      patient: patientExists._id, // Use MongoDB ObjectId
      appointmentDate: parsedDate,
      appointmentTime: appointmentTime || currentTime,
      reason: reason || 'OPD Consultation',
      type,
      consultationFee: typeof req.body?.consultationFee === 'number' ? req.body.consultationFee : (doctorExists?.consultationFee || 1),
      status: 'Scheduled'
    };

    // Add doctor if provided
    if (doctor) {
      appointmentData.doctor = doctor;
    }

    // Add room if provided
    if (room) {
      appointmentData.room = room;
    }

    // Add department if provided
    if (department) {
      appointmentData.department = department;
    } else if (roomExists?.department) {
      appointmentData.department = roomExists.department._id;
    }

    console.log('📅 Creating appointment with data:', appointmentData);

    // Create and save appointment to MongoDB
    const appointment = new Appointment(appointmentData);

    console.log('💾 Saving appointment...');
    console.log('💾 Appointment before save:', appointment);

    await appointment.save();

    console.log('✅ Appointment saved successfully');
    console.log('✅ Appointment after save:', appointment);

    // Populate the created appointment
    await appointment.populate('patient', 'firstName lastName contact patientId');
    await appointment.populate('doctor', 'firstName lastName specialization department doctorId');
    await appointment.populate('room', 'roomNumber');
    await appointment.populate('department', 'name code');

    console.log('✅ Appointment created successfully:', appointment.appointmentId);

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully',
      appointment
    });
  } catch (error) {
    console.error('❌ Error booking OPD appointment:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error name:', error.name);

    // Handle duplicate key errors specifically
    if (error.code === 11000) {
      console.error('❌ Duplicate key error:', error.keyPattern);

      // If appointmentId duplicate, try to regenerate
      if (error.keyPattern && error.keyPattern.appointmentId) {
        console.log('🔄 Retrying appointment creation with new ID...');

        // Remove appointmentId and let it regenerate
        delete appointmentData.appointmentId;

        try {
          const retryAppointment = new Appointment(appointmentData);
          await retryAppointment.save();

          await retryAppointment.populate('patient', 'firstName lastName email phone patientId');
          if (retryAppointment.doctor) {
            await retryAppointment.populate('doctor', 'firstName lastName specialization department doctorId');
          }
          if (retryAppointment.room) {
            await retryAppointment.populate('room', 'roomNumber');
          }
          if (retryAppointment.department) {
            await retryAppointment.populate('department', 'name code');
          }

          console.log('✅ Retry successful - Appointment created:', retryAppointment.appointmentId);
          return res.status(201).json({
            success: true,
            message: 'Appointment booked successfully',
            appointment: retryAppointment
          });
        } catch (retryError) {
          console.error('❌ Retry failed:', retryError);
          return res.status(500).json({
            success: false,
            message: 'Failed to create appointment after retry'
          });
        }
      }

      return res.status(400).json({
        success: false,
        message: 'Duplicate appointment detected'
      });
    }

    // Handle validation errors specifically
    if (error.name === 'ValidationError') {
      const validationErrors = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message
      }));
      console.error('❌ Validation errors:', validationErrors);

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    console.error('❌ UNHANDLED ERROR in appointment booking:');
    console.error('❌ Error name:', error.name);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Full error object:', error);

    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error during appointment booking'
    });
  }
});

// Public route to get all appointments
router.get('/list', async (req, res) => {
  try {
    console.log('📋 Fetching appointments list');
    const { page = 1, limit = 50, status = '', date = '', search = '', startDate: qsStart, endDate: qsEnd, registrationNumber } = req.query;

    const pageNum = parseInt(page) || 1;
    const lim = Math.min(parseInt(limit) || 50, 1000);

    // Base query
    const baseQuery = {};
    if (status) baseQuery.status = status;

    // Date filtering: prefer explicit startDate/endDate range; fallback to single-day 'date'
    if (qsStart && qsEnd) {
      const start = new Date(qsStart);
      const end = new Date(qsEnd);
      // make end exclusive by adding 1 day
      const endExclusive = new Date(end);
      endExclusive.setDate(endExclusive.getDate() + 1);
      baseQuery.appointmentDate = { $gte: start, $lt: endExclusive };
    } else if (date) {
      const startOfDay = new Date(date);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      baseQuery.appointmentDate = { $gte: startOfDay, $lt: nextDay };
    }

    let query = { ...baseQuery };
    // Prioritize exact Registration No. if provided
    if (registrationNumber) {
      const num = parseInt(registrationNumber, 10);
      if (!isNaN(num)) {
        const padded = num.toString().padStart(6, '0');
        query = { ...baseQuery, appointmentId: `APT${padded}` };
      }
    }


    // Optional search across patient and appointment
    if (!registrationNumber && search && String(search).trim()) {
      const s = String(search).trim();
      const regex = new RegExp(s, 'i');
      const orConds = [];

      // Appointment ID match (supports number as registration no.)
      const num = parseInt(s, 10);
      if (!isNaN(num)) {
        const padded = num.toString().padStart(6, '0');
        orConds.push({ appointmentId: `APT${padded}` });
      }
      // Partial match on appointmentId too
      orConds.push({ appointmentId: { $regex: regex } });

      // Find matching patients by basic fields and use their IDs in query
      const matchedPatients = await Patient.find({
        $or: [
          { firstName: { $regex: regex } },
          { lastName: { $regex: regex } },
          { phone: { $regex: regex } },
          { contact: { $regex: regex } },
          { patientId: { $regex: regex } }
        ]
      }).select('_id');
      const patientIds = matchedPatients.map(p => p._id);
      if (patientIds.length) orConds.push({ patient: { $in: patientIds } });

      query = { ...baseQuery, $or: orConds };
    }
    // Default sorting
    const sortSpec = { createdAt: -1, appointmentDate: -1 };


    const appointments = await Appointment.find(query)
      .populate('patient', 'firstName lastName phone patientId age gender ageIn aadharNo address city post remark contact')
      .populate({
        path: 'doctor',
        select: 'firstName lastName specialization department doctorId',
        populate: { path: 'department', select: 'name code' }
      })
      .populate('department', 'name code')
      .populate('room', 'roomNumber')
      .limit(lim)
      .skip((pageNum - 1) * lim)
      .sort(sortSpec);

    const total = await Appointment.countDocuments(query);

    console.log(`✅ Found ${total} appointments (page ${pageNum}/${Math.ceil(total / lim)})`);
    res.json({
      success: true,
      appointments,
      totalPages: Math.ceil(total / lim),
      currentPage: pageNum,
      total
    });
  } catch (error) {
    console.error('❌ Error fetching appointments:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Apply authentication to all other routes
router.use(authenticateToken);

// Get all appointments (Role-based access)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, status = '', date = '', doctorId = '', patientId = '' } = req.query;

    let query = {};

    // Role-based filtering
    if (req.user.role === 'Patient') {
      query.patient = req.user._id;
    } else if (req.user.role === 'Doctor') {
      query.doctor = req.user._id;
    }
    // Admin can see all appointments

    if (status) {
      query.status = status;
    }

    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      query.appointmentDate = { $gte: startDate, $lt: endDate };
    }

    if (doctorId && req.user.role !== 'Patient') {
      query.doctor = doctorId;
    }

    if (patientId && req.user.role !== 'Patient') {
      query.patient = patientId;
    }

    const appointments = await Appointment.find(query)
      .populate('patient', 'firstName lastName email phone patientId')
      .populate('doctor', 'firstName lastName specialization department doctorId')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ appointmentDate: 1, appointmentTime: 1 });

    const total = await Appointment.countDocuments(query);

    res.json({
      appointments,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get appointment by registration number (for pathology form)
// Registration number is extracted from appointmentId (APT000036 → 36)
router.get('/registration/:registrationNumber', async (req, res) => {
  try {
    const { registrationNumber } = req.params;
    const regNumber = parseInt(registrationNumber);
    console.log(`🔍 Searching for appointment with registration number: ${regNumber}`);

    if (isNaN(regNumber) || regNumber < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid registration number. Must be a positive number.'
      });
    }

    // Create appointmentId pattern (APT + padded number)
    const paddedNumber = regNumber.toString().padStart(6, '0');
    const appointmentIdPattern = `APT${paddedNumber}`;
    console.log(`🔍 Looking for appointmentId: ${appointmentIdPattern}`);

    // Find appointment by appointmentId
    const appointment = await Appointment.findOne({ appointmentId: appointmentIdPattern })
      .populate('patient', 'patientId firstName lastName age gender phone address registrationDate')
      .populate('doctor', 'firstName lastName specialization')
      .populate('department', 'name')
      .populate('room', 'roomNumber');

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: `Appointment not found with registration number ${regNumber} (appointmentId: ${appointmentIdPattern})`
      });
    }

    console.log('✅ Appointment found:', appointment.appointmentId, 'for registration number:', regNumber);

    res.json({
      success: true,
      appointment: {
        _id: appointment._id,
        appointmentId: appointment.appointmentId,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        registrationNumber: regNumber, // Add the calculated registration number
        // Include status flags so UI shows correct follow-up state
        status: appointment.status,
        isFollowUp: appointment.isFollowUp,
        followUpCompleted: Boolean(appointment.followUpCompleted),
        newRegistrationCompleted: Boolean(appointment.newRegistrationCompleted),
        patient: {
          _id: appointment.patient._id,
          patientId: appointment.patient.patientId,
          firstName: appointment.patient.firstName,
          lastName: appointment.patient.lastName,
          age: appointment.patient.age,
          gender: appointment.patient.gender,
          contact: appointment.patient.phone,
          address: appointment.patient.address?.street || appointment.patient.address || '',
          registrationDate: appointment.patient.registrationDate
        },
        doctor: appointment.doctor ? {
          _id: appointment.doctor._id,
          firstName: appointment.doctor.firstName,
          lastName: appointment.doctor.lastName,
          specialization: appointment.doctor.specialization
        } : null,
        department: appointment.department ? {
          _id: appointment.department._id,
          name: appointment.department.name
        } : null,
        room: appointment.room ? {
          _id: appointment.room._id,
          roomNumber: appointment.room.roomNumber
        } : null
      }
    });
  } catch (error) {
    console.error('❌ Error fetching appointment by registration number:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching appointment',
      error: error.message
    });
  }
});

// Get appointment suggestions by registration number
// Returns chronological registration numbers (1, 2, 3, etc.)
router.get('/suggestions/:query', async (req, res) => {
  try {
    const { query } = req.params;
    console.log(`🔍 Getting appointment suggestions for: ${query}`);

    // Get total count of appointments
    const totalAppointments = await Appointment.countDocuments({});

    // Generate suggestions based on query
    const suggestions = [];
    const queryNum = parseInt(query);

    if (!isNaN(queryNum)) {
      // If query is a number, suggest numbers that start with it
      for (let i = 1; i <= totalAppointments; i++) {
        if (i.toString().startsWith(query)) {
          suggestions.push(i.toString());
          if (suggestions.length >= 10) break;
        }
      }
    } else {
      // If query is not a number, suggest first 10 registration numbers
      for (let i = 1; i <= Math.min(10, totalAppointments); i++) {
        suggestions.push(i.toString());
      }
    }

    console.log(`📋 Generated ${suggestions.length} suggestions for query "${query}"`);

    res.json({
      success: true,
      suggestions: suggestions
    });
  } catch (error) {
    console.error('❌ Error getting appointment suggestions:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting suggestions',
      error: error.message
    });
  }
});

// Get appointment by ID (Role-based access)
router.get('/:id', async (req, res) => {
  try {
    let query = { _id: req.params.id };

    // Role-based access control
    if (req.user.role === 'Patient') {
      query.patient = req.user._id;
    } else if (req.user.role === 'Doctor') {
      query.doctor = req.user._id;
    }

    const appointment = await Appointment.findOne(query)
      .populate('patient')
      .populate('doctor');

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found or access denied' });
    }
    res.json(appointment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new appointment (Admin and Doctors only)
router.post('/', requirePermissions('manage_appointments', 'view_appointments'), async (req, res) => {
  try {
    const { patient, doctor, appointmentDate, appointmentTime } = req.body;

    // Verify patient exists
    const patientExists = await Patient.findById(patient);
    if (!patientExists) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // Verify doctor exists
    const doctorExists = await Doctor.findById(doctor);
    if (!doctorExists) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    // Check for conflicting appointments
    const conflictingAppointment = await Appointment.findOne({
      doctor,
      appointmentDate: new Date(appointmentDate),
      appointmentTime,
      status: { $nin: ['Cancelled', 'Completed'] }
    });

    if (conflictingAppointment) {
      return res.status(400).json({ message: 'Doctor is not available at this time slot' });
    }

    // Set consultation fee from doctor's profile
    req.body.consultationFee = doctorExists.consultationFee;

    const appointment = new Appointment(req.body);
    await appointment.save();

    // Populate the created appointment
    await appointment.populate('patient', 'firstName lastName email phone patientId');
    await appointment.populate('doctor', 'firstName lastName specialization department doctorId');

    res.status(201).json({
      message: 'Appointment created successfully',
      appointment
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update appointment
router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const before = await Appointment.findById(id).lean();

    const appointment = await Appointment.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    ).populate('patient', 'firstName lastName email phone patientId')
     .populate('doctor', 'firstName lastName specialization department doctorId');

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Audit trail + embedded history
    try {
      const { recordAudit, buildDiff } = require('../utils/audit');
      const editedBy = (req.user && (req.user.name || req.user.email)) || 'System';
      const fields = [
        'patient','doctor','room','department','appointmentDate','appointmentDay','appointmentTime','duration','reason','status','type','notes','weightKg','prescription','followUpDate','isFollowUp','followUpCompleted','newRegistrationCompleted','consultationFee','paymentMethod','isPaid'
      ];
      const changes = buildDiff(before || {}, appointment.toObject(), fields);
      await recordAudit({
        req,
        entityType: 'Appointment',
        entityId: appointment._id,
        action: 'UPDATE',
        beforeDoc: before || {},
        afterDoc: appointment.toObject(),
        meta: { endpoint: 'PUT /appointments/:id', appointmentId: appointment.appointmentId }
      });
      if (Object.keys(changes).length) {
        await Appointment.updateOne({ _id: id }, {
          $push: { editHistory: { editedAt: new Date(), editedBy, changes } },
          $inc: { editCount: 1 }
        });
      }
    } catch (e) { console.warn('\u26a0\ufe0f Appointment update audit failed:', e?.message); }

    res.json({
      message: 'Appointment updated successfully',
      appointment
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Cancel appointment
router.patch('/:id/cancel', async (req, res) => {
  try {
    const id = req.params.id;
    const before = await Appointment.findById(id).lean();

    const appointment = await Appointment.findByIdAndUpdate(
      id,
      { status: 'Cancelled' },
      { new: true }
    ).populate('patient', 'firstName lastName email phone patientId')
     .populate('doctor', 'firstName lastName specialization department doctorId');

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Audit trail + embedded history (status change)
    try {
      const { recordAudit } = require('../utils/audit');
      const editedBy = (req.user && (req.user.name || req.user.email)) || 'System';
      const changes = { status: { before: before?.status, after: 'Cancelled' } };
      await recordAudit({
        req,
        entityType: 'Appointment',
        entityId: appointment._id,
        action: 'UPDATE',
        beforeDoc: before || {},
        afterDoc: appointment.toObject(),
        meta: { endpoint: 'PATCH /appointments/:id/cancel', action: 'cancel', appointmentId: appointment.appointmentId }
      });
      await Appointment.updateOne({ _id: id }, {
        $push: { editHistory: { editedAt: new Date(), editedBy, changes } },
        $inc: { editCount: 1 }
      });
    } catch (e) { console.warn('\u26a0\ufe0f Appointment cancel audit failed:', e?.message); }

    res.json({
      message: 'Appointment cancelled successfully',
      appointment
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Complete appointment with prescription
router.patch('/:id/complete', async (req, res) => {
  try {
    const { prescription, notes, followUpDate } = req.body;
    const id = req.params.id;
    const before = await Appointment.findById(id).lean();

    const appointment = await Appointment.findByIdAndUpdate(
      id,
      {
        status: 'Completed',
        prescription,
        notes,
        followUpDate
      },
      { new: true }
    ).populate('patient', 'firstName lastName email phone patientId')
     .populate('doctor', 'firstName lastName specialization department doctorId');

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Audit trail + embedded history
    try {
      const { recordAudit, buildDiff } = require('../utils/audit');
      const editedBy = (req.user && (req.user.name || req.user.email)) || 'System';
      const fields = ['status','prescription','notes','followUpDate'];
      const changes = buildDiff(before || {}, appointment.toObject(), fields);
      await recordAudit({
        req,
        entityType: 'Appointment',
        entityId: appointment._id,
        action: 'UPDATE',
        beforeDoc: before || {},
        afterDoc: appointment.toObject(),
        meta: { endpoint: 'PATCH /appointments/:id/complete', action: 'complete', appointmentId: appointment.appointmentId }
      });
      if (Object.keys(changes).length) {
        await Appointment.updateOne({ _id: id }, {
          $push: { editHistory: { editedAt: new Date(), editedBy, changes } },
          $inc: { editCount: 1 }
        });
      }
    } catch (e) { console.warn('\u26a0\ufe0f Appointment complete audit failed:', e?.message); }

    res.json({
      message: 'Appointment completed successfully',
      appointment
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get appointments by date range
router.get('/date-range/:startDate/:endDate', async (req, res) => {
  try {
    const { startDate, endDate } = req.params;

    const appointments = await Appointment.find({
      appointmentDate: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    }).populate('patient', 'firstName lastName patientId')
      .populate('doctor', 'firstName lastName doctorId')
      .sort({ appointmentDate: 1, appointmentTime: 1 });

    res.json(appointments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});



module.exports = router;
