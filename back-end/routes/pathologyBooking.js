const express = require('express');
const router = express.Router();
const PathologyBooking = require('../models/PathologyBooking');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const ServiceHead = require('../models/ServiceHead');
const { authenticateToken } = require('../middlewares/auth');
const { multiTenantMiddleware } = require('../middleware/multiTenantMongo');

// ==================== PATIENT MANAGEMENT ROUTES ====================

// Search/Get patients for pathology
router.get('/patients/search', authenticateToken, multiTenantMiddleware, async (req, res) => {
  try {
    console.log('🔍 Searching patients for pathology...');
    const { query, patientId, phone } = req.query;

    let filter = {};

    if (patientId) {
      filter.patientId = { $regex: patientId, $options: 'i' };
    } else if (phone) {
      filter.phone = { $regex: phone, $options: 'i' };
    } else if (query) {
      filter.$or = [
        { firstName: { $regex: query, $options: 'i' } },
        { lastName: { $regex: query, $options: 'i' } },
        { phone: { $regex: query, $options: 'i' } },
        { patientId: { $regex: query, $options: 'i' } }
      ];
    }

    // 🏢 Multi-Tenant: Add labId filter
    if (!req.isSuperAdmin && req.labId) {
      filter.labId = req.labId;
      console.log(`🏢 Filtering by Lab: ${req.labId}`);
    }

    const patients = await Patient.find(filter)
      .select('patientId firstName lastName phone gender age address')
      .limit(20)
      .sort({ createdAt: -1 });
    
    console.log(`✅ Found ${patients.length} patients`);
    
    res.json({
      success: true,
      patients,
      total: patients.length
    });
  } catch (error) {
    console.error('❌ Error searching patients:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching patients',
      error: error.message
    });
  }
});

// Get patient by ID for pathology
router.get('/patients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📋 Fetching patient with ID: ${id}`);
    
    const patient = await Patient.findById(id);
    
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }
    
    console.log('✅ Patient found:', patient.patientId);
    
    res.json({
      success: true,
      patient
    });
  } catch (error) {
    console.error('❌ Error fetching patient:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching patient',
      error: error.message
    });
  }
});

// Create new patient for pathology (minimal fields)
router.post('/patients', async (req, res) => {
  try {
    console.log('👤 Creating new patient for pathology...');
    console.log('📋 Request data:', req.body);
    
    const { firstName, lastName, phone, gender, age, address } = req.body;
    
    // Validate required fields
    if (!firstName || !lastName || !phone || !gender || !age) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: firstName, lastName, phone, gender, age'
      });
    }
    
    // Check if patient with same phone already exists
    const existingPatient = await Patient.findOne({ phone });
    if (existingPatient) {
      return res.status(400).json({
        success: false,
        message: 'Patient with this phone number already exists',
        existingPatient: {
          _id: existingPatient._id,
          patientId: existingPatient.patientId,
          firstName: existingPatient.firstName,
          lastName: existingPatient.lastName,
          phone: existingPatient.phone
        }
      });
    }
    
    const patientData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      gender,
      age: parseInt(age),
      ageIn: 'Years',
      address: typeof address === 'string' ? { street: address } : address
    };
    
    console.log('👤 Creating patient with data:', patientData);
    const patient = new Patient(patientData);
    await patient.save();
    
    console.log('✅ Patient created successfully:', patient.patientId);
    
    res.status(201).json({
      success: true,
      message: 'Patient created successfully',
      patient
    });
  } catch (error) {
    console.error('❌ Error creating patient:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating patient',
      error: error.message
    });
  }
});

// ==================== PATHOLOGY TESTS ROUTES ====================

// Get available pathology tests by category
router.get('/tests', async (req, res) => {
  try {
    console.log('🧪 Fetching available pathology tests...');
    const { category } = req.query;
    
    let filter = {};
    if (category) {
      filter.category = category;
    }
    
    const tests = await ServiceHead.find(filter)
      .select('category testName price description')
      .sort({ category: 1, testName: 1 });
    
    console.log(`✅ Found ${tests.length} pathology tests`);
    
    res.json({
      success: true,
      tests,
      total: tests.length
    });
  } catch (error) {
    console.error('❌ Error fetching pathology tests:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pathology tests',
      error: error.message
    });
  }
});

// Get test categories
router.get('/categories', async (req, res) => {
  try {
    console.log('📋 Fetching test categories...');
    
    const categories = await ServiceHead.distinct('category');
    
    console.log(`✅ Found ${categories.length} categories`);
    
    res.json({
      success: true,
      categories
    });
  } catch (error) {
    console.error('❌ Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching categories',
      error: error.message
    });
  }
});

// ==================== PATHOLOGY BOOKING ROUTES ====================

// Create new pathology booking
router.post('/bookings', async (req, res) => {
  try {
    console.log('📋 Creating new pathology booking...');
    console.log('📋 Request data:', req.body);

    const {
      patientId,
      doctorId,
      prescribedBy,
      selectedTests,
      payment,
      collectionDate,
      priority,
      mode,
      clinicalHistory,
      specialInstructions,
      createdBy
    } = req.body;

    // Validate required fields
    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID is required'
      });
    }

    if (!selectedTests || selectedTests.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one test must be selected'
      });
    }

    if (!payment || !payment.totalAmount) {
      return res.status(400).json({
        success: false,
        message: 'Payment information is required'
      });
    }

    // Verify patient exists
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Verify doctor exists (if provided)
    let doctor = null;
    if (doctorId) {
      doctor = await Doctor.findById(doctorId);
      if (!doctor) {
        return res.status(404).json({
          success: false,
          message: 'Doctor not found'
        });
      }
    }

    // Process selected tests
    const bookedTests = [];
    let calculatedTotal = 0;

    for (const test of selectedTests) {
      const testDetails = await ServiceHead.findById(test.testId);
      if (!testDetails) {
        return res.status(404).json({
          success: false,
          message: `Test not found: ${test.testId}`
        });
      }

      const quantity = test.quantity || 1;
      const discount = test.discount || 0;
      const netAmount = (testDetails.price * quantity) - discount;

      bookedTests.push({
        testId: test.testId,
        testName: testDetails.testName,
        testCategory: testDetails.category,
        price: testDetails.price,
        quantity,
        discount,
        netAmount,
        status: 'Pending'
      });

      calculatedTotal += netAmount;
    }

    // Create booking data
    const bookingData = {
      patient: patientId,
      doctor: doctorId,
      prescribedBy,
      bookedTests,
      payment: {
        totalAmount: calculatedTotal,
        paidAmount: payment.paidAmount || 0,
        paymentMethod: payment.paymentMethod || 'Cash',
        transactionId: payment.transactionId || '',
        paymentHistory: payment.paidAmount > 0 ? [{
          amount: payment.paidAmount,
          method: payment.paymentMethod || 'Cash',
          transactionId: payment.transactionId || '',
          receivedBy: createdBy || 'System'
        }] : []
      },
      collectionDate: collectionDate ? new Date(collectionDate) : new Date(),
      priority: priority || 'Normal',
      mode: mode || 'OPD',
      clinicalHistory: clinicalHistory || '',
      specialInstructions: specialInstructions || '',
      createdBy: createdBy || 'System'
    };

    console.log('📋 Creating booking with data:', bookingData);
    const booking = new PathologyBooking(bookingData);

    // Calculate expected report date
    booking.calculateExpectedReportDate();

    await booking.save();

    // Populate the saved booking
    const populatedBooking = await PathologyBooking.findById(booking._id)
      .populate('patient', 'patientId firstName lastName phone gender age address')
      .populate('doctor', 'firstName lastName specialization');

    console.log('✅ Pathology booking created successfully');
    console.log('✅ Booking ID:', populatedBooking.bookingId);
    console.log('✅ Invoice Number:', populatedBooking.invoiceNumber);

    res.status(201).json({
      success: true,
      message: 'Pathology booking created successfully',
      booking: populatedBooking
    });

  } catch (error) {
    console.error('❌ Error creating pathology booking:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating pathology booking',
      error: error.message
    });
  }
});

// Get all pathology bookings
router.get('/bookings', async (req, res) => {
  try {
    console.log('📋 Fetching pathology bookings...');
    const { page = 1, limit = 10, status, patientId, paymentStatus } = req.query;
    const skip = (page - 1) * limit;

    let filter = {};
    if (status) filter.status = status;
    if (patientId) filter.patient = patientId;
    if (paymentStatus) filter['payment.paymentStatus'] = paymentStatus;

    const bookings = await PathologyBooking.find(filter)
      .populate('patient', 'patientId firstName lastName phone gender age')
      .populate('doctor', 'firstName lastName specialization')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await PathologyBooking.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    console.log(`✅ Found ${bookings.length} bookings (Page ${page}/${totalPages})`);

    res.json({
      success: true,
      bookings,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalBookings: total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('❌ Error fetching bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching bookings',
      error: error.message
    });
  }
});

// Get booking by ID
router.get('/bookings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📋 Fetching booking with ID: ${id}`);

    const booking = await PathologyBooking.findById(id)
      .populate('patient', 'patientId firstName lastName phone gender age address')
      .populate('doctor', 'firstName lastName specialization');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    console.log('✅ Booking found:', booking.bookingId);

    res.json({
      success: true,
      booking
    });
  } catch (error) {
    console.error('❌ Error fetching booking:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching booking',
      error: error.message
    });
  }
});

// Get printable bill for booking
router.get('/bookings/:id/print', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🖨️ Generating printable bill for booking: ${id}`);

    const booking = await PathologyBooking.findById(id)
      .populate('patient', 'patientId firstName lastName phone gender age address')
      .populate('doctor', 'firstName lastName specialization');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Generate printable bill data
    const billData = {
      invoiceNumber: booking.invoiceNumber,
      bookingId: booking.bookingId,
      bookingDate: booking.bookingDate,
      patient: {
        patientId: booking.patient.patientId,
        name: `${booking.patient.firstName} ${booking.patient.lastName}`,
        phone: booking.patient.phone,
        gender: booking.patient.gender,
        age: booking.patient.age,
        address: booking.patient.address
      },
      doctor: booking.doctor ? {
        name: `${booking.doctor.firstName} ${booking.doctor.lastName}`,
        specialization: booking.doctor.specialization
      } : null,
      prescribedBy: booking.prescribedBy,
      tests: booking.bookedTests.map(test => ({
        name: test.testName,
        category: test.testCategory,
        price: test.price,
        quantity: test.quantity,
        discount: test.discount,
        netAmount: test.netAmount
      })),
      payment: {
        totalAmount: booking.payment.totalAmount,
        paidAmount: booking.payment.paidAmount,
        dueAmount: booking.payment.dueAmount,
        paymentStatus: booking.payment.paymentStatus,
        paymentMethod: booking.payment.paymentMethod
      },
      labInfo: booking.labInfo,
      collectionDate: booking.collectionDate,
      expectedReportDate: booking.expectedReportDate,
      priority: booking.priority,
      mode: booking.mode,
      clinicalHistory: booking.clinicalHistory,
      specialInstructions: booking.specialInstructions
    };

    console.log('✅ Bill data generated for:', booking.invoiceNumber);

    res.json({
      success: true,
      billData
    });
  } catch (error) {
    console.error('❌ Error generating bill:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating bill',
      error: error.message
    });
  }
});

// Update payment for booking
router.put('/bookings/:id/payment', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, method, transactionId, receivedBy } = req.body;

    console.log(`💰 Updating payment for booking: ${id}`);
    console.log('💰 Payment data:', req.body);

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid payment amount is required'
      });
    }

    const booking = await PathologyBooking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if payment exceeds due amount
    const newPaidAmount = booking.payment.paidAmount + amount;
    if (newPaidAmount > booking.payment.totalAmount) {
      return res.status(400).json({
        success: false,
        message: 'Payment amount exceeds total amount'
      });
    }

    // Add to payment history
    booking.payment.paymentHistory.push({
      amount,
      method: method || 'Cash',
      transactionId: transactionId || '',
      receivedBy: receivedBy || 'System'
    });

    // Update payment amounts
    booking.payment.paidAmount = newPaidAmount;
    booking.payment.dueAmount = booking.payment.totalAmount - newPaidAmount;

    // Update payment status
    if (booking.payment.paidAmount >= booking.payment.totalAmount) {
      booking.payment.paymentStatus = 'Paid';
    } else if (booking.payment.paidAmount > 0) {
      booking.payment.paymentStatus = 'Partial Paid';
    } else {
      booking.payment.paymentStatus = 'Due';
    }

    booking.updatedBy = receivedBy || 'System';
    await booking.save();

    console.log('✅ Payment updated successfully');

    res.json({
      success: true,
      message: 'Payment updated successfully',
      payment: booking.payment
    });
  } catch (error) {
    console.error('❌ Error updating payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating payment',
      error: error.message
    });
  }
});

// Update booking status
router.put('/bookings/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, updatedBy } = req.body;

    console.log(`📝 Updating status for booking: ${id} to ${status}`);

    const validStatuses = ['Booked', 'Sample Collected', 'In Progress', 'Completed', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const booking = await PathologyBooking.findByIdAndUpdate(
      id,
      {
        status,
        updatedBy: updatedBy || 'System'
      },
      { new: true }
    ).populate('patient', 'patientId firstName lastName')
     .populate('doctor', 'firstName lastName');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    console.log('✅ Status updated successfully');

    res.json({
      success: true,
      message: 'Status updated successfully',
      booking
    });
  } catch (error) {
    console.error('❌ Error updating status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating status',
      error: error.message
    });
  }
});

module.exports = router;
