const express = require('express');
const mongoose = require('mongoose');
const PathologyRegistration = require('../models/PathologyRegistration');
const PathologyInvoice = require('../models/PathologyInvoice');
const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const router = express.Router();
const Counter = require('../models/Counter');


// Test route
router.get('/test', (req, res) => {
  console.log('🧪 Pathology Registration route test');
  res.json({ success: true, message: 'Pathology Registration route is working!' });
});

// Get daily lab registration count (from Counter to keep in sync with save logic)
router.get('/daily-count', async (req, res) => {
  try {
    const { date, mode } = req.query;

    // Build counter name using LOCAL date (avoid UTC shift at midnight)
    let todayString;
    if (typeof date === 'string' && date.length >= 10) {
      todayString = date.slice(0, 10);
    } else {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      todayString = `${y}-${m}-${d}`;
    }

    const isIPD = String(mode || '').toUpperCase() === 'IPD';
    const counterName = isIPD ? `pathology_today_ipd_${todayString}` : `pathology_today_${todayString}`;

    console.log('📊 Getting daily lab registration counter for:', todayString, 'mode:', isIPD ? 'IPD' : 'OPD');

    // Read current counter value; do NOT count documents
    const counter = await Counter.findOne({ name: counterName });
    const count = counter?.value || 0; // existing issued numbers today

    console.log('📊 Daily lab registration counter value:', count);

    res.json({
      success: true,
      count,
      date: todayString,
      mode: isIPD ? 'IPD' : 'OPD'
    });

  } catch (error) {
    console.error('❌ Error getting daily lab registration counter:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get daily lab registration count',
      error: error.message
    });
  }
});

// Get yearly lab registration count (from Counter to keep in sync with save logic)
router.get('/yearly-count', async (req, res) => {
  try {
    const { year, mode } = req.query;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();

    // Counter name for the year's lab numbers (mode-specific)
    const isIPD = String(mode || '').toUpperCase() === 'IPD';
    const counterName = isIPD ? `pathology_year_ipd_${targetYear}` : `pathology_year_${targetYear}`;
    console.log('📅 Getting yearly lab registration counter for:', targetYear, 'mode:', isIPD ? 'IPD' : 'OPD');

    // Read current counter value; do NOT count documents
    const counter = await Counter.findOne({ name: counterName });
    const count = counter?.value || 0;

    console.log('📅 Yearly lab registration counter value:', count);

    res.json({
      success: true,
      count,
      year: targetYear,
      mode: isIPD ? 'IPD' : 'OPD'
    });

  } catch (error) {
    console.error('❌ Error getting yearly lab registration counter:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get yearly lab registration count',
      error: error.message
    });
  }
});

// Check if receipt is already registered for pathology
router.get('/check-receipt/:receiptNumber', async (req, res) => {
  try {
    const { receiptNumber } = req.params;

    console.log('🔍 Checking if receipt already registered:', receiptNumber);

    const existingRegistration = await PathologyRegistration.findOne({
      receiptNumber: parseInt(receiptNumber)
    });

    const exists = !!existingRegistration;
    console.log('📋 Receipt registration check result:', exists);

    res.json({
      success: true,
      exists: exists,
      receiptNumber: parseInt(receiptNumber)
    });

  } catch (error) {
    console.error('❌ Error checking receipt registration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check receipt registration',
      error: error.message
    });
  }
});

// ✅ Get pathology registration by receipt number
router.get('/receipt/:receiptNumber', async (req, res) => {
  try {
    const { receiptNumber } = req.params;
    console.log(`🔍 [RECEIPT SEARCH] Starting search for receipt: ${receiptNumber}`);
    console.log(`🔍 [RECEIPT SEARCH] Receipt number type: ${typeof receiptNumber}, value: ${receiptNumber}`);

    // Try both string and number search
    const numericReceipt = parseInt(receiptNumber);
    console.log(`🔍 [RECEIPT SEARCH] Numeric receipt: ${numericReceipt}`);

    // Search with multiple conditions
    console.log(`🔍 [RECEIPT SEARCH] Executing MongoDB query...`);
    const registration = await PathologyRegistration.findOne({
      $or: [
        { receiptNumber: numericReceipt },
        { receiptNumber: receiptNumber },
        { receiptNumber: receiptNumber.toString() }
      ]
    });

    console.log(`🔍 [RECEIPT SEARCH] Query result:`, registration ? 'FOUND' : 'NOT FOUND');

    if (!registration) {
      // Debug: Check what receipts exist
      console.log(`🔍 [RECEIPT SEARCH] Checking available receipts...`);
      const allReceipts = await PathologyRegistration.find({}, { receiptNumber: 1 }).limit(10);
      console.log('📋 [RECEIPT SEARCH] Available receipt numbers:', allReceipts.map(r => r.receiptNumber));

      return res.status(404).json({
        success: false,
        message: `Pathology registration not found for receipt: ${receiptNumber}`,
        availableReceipts: allReceipts.map(r => r.receiptNumber),
        searchedFor: {
          original: receiptNumber,
          numeric: numericReceipt,
          type: typeof receiptNumber
        }
      });
    }

    // If we have a linked invoiceRef, fetch it and merge latest fields
    let enriched = registration.toObject();
    if (registration.invoiceRef) {
      try {
        const invoice = await PathologyInvoice.findById(registration.invoiceRef);
        if (invoice) {
          enriched = {
            ...enriched,
            doctorRefNo: invoice.doctorRefNo ?? enriched.doctorRefNo,
            doctor: invoice.doctor ? { ...(enriched.doctor||{}), ...invoice.doctor } : enriched.doctor,
            department: invoice.department ? { ...(enriched.department||{}), ...invoice.department } : enriched.department,
            // Preserve registration payment.totalAmount; merge other invoice payment fields
            payment: invoice.payment ? { ...(enriched.payment||{}), ...invoice.payment, totalAmount: (enriched.payment && enriched.payment.totalAmount != null) ? enriched.payment.totalAmount : invoice.payment.totalAmount } : enriched.payment
          };
        }
      } catch (e) {
        console.warn('⚠️ Could not merge invoiceRef into registration:', e.message);
      }
    }

    console.log('✅ [RECEIPT SEARCH] Registration found by receipt:', registration._id);
    console.log('✅ [RECEIPT SEARCH] Patient name:', enriched.patient?.name);
    console.log('✅ [RECEIPT SEARCH] Year Number:', enriched.yearNumber);
    console.log('✅ [RECEIPT SEARCH] Today Number:', enriched.todayNumber);
    console.log('✅ [RECEIPT SEARCH] Tests count:', enriched.tests?.length || 0);

    res.json({
      success: true,
      invoice: enriched  // Keep 'invoice' key for frontend compatibility
    });

  } catch (error) {
    console.error('❌ [RECEIPT SEARCH] Error fetching registration by receipt:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pathology registration by receipt number',
      error: error.message
    });
  }
});

// ✅ Get pathology registration by yearly number
router.get('/yearly/:yearlyNo', async (req, res) => {
  try {
    const { yearlyNo } = req.params;
    console.log(`🔍 Searching pathologyregistration for yearly no: ${yearlyNo}`);

    const registration = await PathologyRegistration.findOne({ yearNumber: parseInt(yearlyNo) });

    if (!registration) {
      console.log('❌ Registration not found for yearly no:', yearlyNo);
      return res.status(404).json({
        success: false,
        message: 'Pathology registration not found with this Lab Yearly Number'
      });
    }

    let enriched = registration.toObject();
    if (registration.invoiceRef) {
      try {
        const invoice = await PathologyInvoice.findById(registration.invoiceRef);
        if (invoice) {
          enriched = {
            ...enriched,
            doctorRefNo: invoice.doctorRefNo ?? enriched.doctorRefNo,
            doctor: invoice.doctor ? { ...(enriched.doctor||{}), ...invoice.doctor } : enriched.doctor,
            department: invoice.department ? { ...(enriched.department||{}), ...invoice.department } : enriched.department,
            // Preserve registration payment.totalAmount; merge other invoice payment fields
            payment: invoice.payment ? { ...(enriched.payment||{}), ...invoice.payment, totalAmount: (enriched.payment && enriched.payment.totalAmount != null) ? enriched.payment.totalAmount : invoice.payment.totalAmount } : enriched.payment
          };
        }
      } catch (e) {
        console.warn('⚠️ Could not merge invoiceRef into registration:', e.message);
      }
    }

    console.log('✅ Registration found by yearly no:', enriched);
    res.json({
      success: true,
      invoice: enriched
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

// ✅ Get pathology registration by daily number
router.get('/daily/:dailyNo', async (req, res) => {
  try {
    const { dailyNo } = req.params;
    console.log(`🔍 Searching pathologyregistration for daily no: ${dailyNo}`);

    const registration = await PathologyRegistration.findOne({ todayNumber: parseInt(dailyNo) });

    if (!registration) {
      console.log('❌ Registration not found for daily no:', dailyNo);
      return res.status(404).json({
        success: false,
        message: 'Pathology registration not found with this Lab Daily Number'
      });
    }

    let enriched = registration.toObject();
    if (registration.invoiceRef) {
      try {
        const invoice = await PathologyInvoice.findById(registration.invoiceRef);
        if (invoice) {
          enriched = {
            ...enriched,
            doctorRefNo: invoice.doctorRefNo ?? enriched.doctorRefNo,
            doctor: invoice.doctor ? { ...(enriched.doctor||{}), ...invoice.doctor } : enriched.doctor,
            department: invoice.department ? { ...(enriched.department||{}), ...invoice.department } : enriched.department,
            // Preserve registration payment.totalAmount; merge other invoice payment fields
            payment: invoice.payment ? { ...(enriched.payment||{}), ...invoice.payment, totalAmount: (enriched.payment && enriched.payment.totalAmount != null) ? enriched.payment.totalAmount : invoice.payment.totalAmount } : enriched.payment
          };
        }
      } catch (e) {
        console.warn('⚠️ Could not merge invoiceRef into registration:', e.message);
      }
    }

    console.log('✅ Registration found by daily no:', enriched);
    res.json({
      success: true,
      invoice: enriched
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

// ✅ Get pathology registration by registration number
router.get('/registration/:registrationNo', async (req, res) => {
  try {
    const { registrationNo } = req.params;
    console.log(`🔍 Searching pathologyregistration for registration no: ${registrationNo}`);

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

    let enriched = registration.toObject();
    if (registration.invoiceRef) {
      try {
        const invoice = await PathologyInvoice.findById(registration.invoiceRef);
        if (invoice) {
          enriched = {
            ...enriched,
            doctorRefNo: invoice.doctorRefNo ?? enriched.doctorRefNo,
            doctor: invoice.doctor ? { ...(enriched.doctor||{}), ...invoice.doctor } : enriched.doctor,
            department: invoice.department ? { ...(enriched.department||{}), ...invoice.department } : enriched.department,
            // Preserve registration payment.totalAmount; merge other invoice payment fields
            payment: invoice.payment ? { ...(enriched.payment||{}), ...invoice.payment, totalAmount: (enriched.payment && enriched.payment.totalAmount != null) ? enriched.payment.totalAmount : invoice.payment.totalAmount } : enriched.payment
          };
        }
      } catch (e) {
        console.warn('⚠️ Could not merge invoiceRef into registration:', e.message);
      }
    }

    console.log('✅ Registration found by registration no:', enriched);
    res.json({
      success: true,
      invoice: registration
    });

  } catch (error) {
    console.error('❌ Error fetching registration by registration no:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pathology registration by registration number',
      error: error.message
    });
  }
});

// Create new pathology registration
router.post('/create', async (req, res) => {
  try {
    console.log('🔥 PATHOLOGY REGISTRATION CREATE ENDPOINT HIT!');
    console.log('📄 Request method:', req.method);
    console.log('📄 Request body:', JSON.stringify(req.body, null, 2));

    const {
      receiptNumber,
      registrationMode,
      patient,
      doctor,
      department,
      tests,
      sampleCollection,
      samplesCollected, // NEW
      payment,
      registrationDate,
      remarks,
      doctorRefNo
    } = req.body || {};

    // Normalize receipt number to number (or null)
    const receiptNumberNum = (receiptNumber === 0 || receiptNumber === '0') ? 0 : (receiptNumber ? Number(receiptNumber) : null);

    console.log('🔍 Fetching complete data from appointment and invoice...');

    // Strict validation: One registration per receipt number
    if (receiptNumberNum != null) {
      const existing = await PathologyRegistration.findOne({ receiptNumber: receiptNumberNum });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: `Registration already exists for receipt ${receiptNumberNum}`,
          registrationId: existing._id
        });
      }
    }

    // Initialize enhanced data objects
    let enhancedPatient = patient || {};
    let enhancedDoctor = doctor || {};
    let enhancedDepartment = department || {};

    // Try to get complete data from PathologyInvoice first
    if (receiptNumber) {
      try {
        console.log('📋 Looking for PathologyInvoice with receipt number:', receiptNumber);
        const invoice = await PathologyInvoice.findOne({ receiptNumber: receiptNumber });

        if (invoice) {
          console.log('✅ Found PathologyInvoice:', invoice._id);
          // Expose invoice id for linking in registration
          req._invoiceId = invoice._id;

          // Enhance patient data from invoice
          if (invoice.patient) {
            enhancedPatient = {
              ...enhancedPatient,
              patientId: invoice.patient.patientId || enhancedPatient.patientId,
              registrationNumber: invoice.patient.registrationNumber || enhancedPatient.registrationNumber,
              name: invoice.patient.name || enhancedPatient.name,
              phone: invoice.patient.phone || enhancedPatient.phone,
              gender: invoice.patient.gender || enhancedPatient.gender,
              age: invoice.patient.age || enhancedPatient.age,
              ageIn: invoice.patient.ageIn || enhancedPatient.ageIn,
              address: invoice.patient.address || enhancedPatient.address
            };
          }

          // Enhance doctor data from invoice
          if (invoice.doctor) {
            enhancedDoctor = {
              ...enhancedDoctor,
              name: invoice.doctor.name || enhancedDoctor.name,
              specialization: invoice.doctor.specialization || enhancedDoctor.specialization,
              roomNumber: invoice.doctor.roomNumber || enhancedDoctor.roomNumber
            };
          }

          // Enhance department data from invoice
          if (invoice.department) {
            enhancedDepartment = {
              ...enhancedDepartment,
              name: invoice.department.name || enhancedDepartment.name,
              code: invoice.department.code || enhancedDepartment.code
            };
          }

          // Doctor Ref No from invoice if available
          const invoiceDoctorRefNo = invoice.doctorRefNo || invoice.doctor?.refNo || invoice.doctor?.doctorRefNo || '';

          console.log('📋 Enhanced data from invoice - Doctor:', enhancedDoctor);
          console.log('📋 Enhanced data from invoice - Department:', enhancedDepartment);
          if (invoiceDoctorRefNo) {
            console.log('📋 Enhanced data from invoice - DoctorRefNo:', invoiceDoctorRefNo);
          }

          // carry over to req for later save
          req._doctorRefNoFromInvoice = invoiceDoctorRefNo;
        }
      } catch (error) {
        console.log('⚠️ Could not fetch invoice data:', error.message);
      }
    }

    // Try to get appointment data if we have registration number
    const registrationNumber = enhancedPatient.registrationNumber;
    if (registrationNumber) {
      try {
        // Convert registration number to appointment ID format (72 -> APT000072)
        const appointmentId = `APT${registrationNumber.toString().padStart(6, '0')}`;
        console.log('🔍 Looking for appointment with ID:', appointmentId);

        const appointment = await Appointment.findOne({
          appointmentId: appointmentId
        }).populate('room').populate('doctor').populate('department').populate('patient');

        if (appointment) {
          console.log('✅ Found appointment with complete data');

          // Enhance patient data from appointment
          if (appointment.patient) {
            enhancedPatient = {
              ...enhancedPatient,
              patientId: appointment.patient.patientId || enhancedPatient.patientId,
              name: `${appointment.patient.firstName || ''} ${appointment.patient.lastName || ''}`.trim() || enhancedPatient.name,
              phone: appointment.patient.contact || enhancedPatient.phone,
              gender: appointment.patient.gender || enhancedPatient.gender,
              age: appointment.patient.age || enhancedPatient.age,
              address: appointment.patient.address || enhancedPatient.address
            };
          }

          // Enhance doctor data from appointment
          if (appointment.doctor) {
            enhancedDoctor = {
              ...enhancedDoctor,
              name: appointment.doctor.name || `${appointment.doctor.firstName || ''} ${appointment.doctor.lastName || ''}`.trim() || enhancedDoctor.name,
              specialization: appointment.doctor.specialization || enhancedDoctor.specialization
            };
          }

          // Enhance room data from appointment
          if (appointment.room) {
            enhancedDoctor.roomNumber = appointment.room.roomNumber || enhancedDoctor.roomNumber;
          }

          // Enhance department data from appointment
          if (appointment.department) {
            enhancedDepartment = {
              ...enhancedDepartment,
              name: appointment.department.name || enhancedDepartment.name,
              code: appointment.department.code || enhancedDepartment.code
            };
          }

          console.log('🏥 Enhanced data from appointment - Doctor:', enhancedDoctor);
          console.log('🏥 Enhanced data from appointment - Department:', enhancedDepartment);
          console.log('🏥 Enhanced data from appointment - Room:', appointment.room?.roomNumber);
        } else {
          console.log('❌ No appointment found with ID:', appointmentId);
        }
      } catch (error) {
        console.log('⚠️ Could not fetch appointment data:', error.message);
      }
    }

    // Enrich tests with IDs from masters (TestDefinition/ServiceHead/TestCategory)
    const TestDefinition = require('../models/TestDefinition');
    const ServiceHead = require('../models/ServiceHead');
    const TestCategory = require('../models/TestCategory');

    async function mapTest(t) {
      if (!t || !t.name) return t;
      const nameUpper = String(t.name).trim().toUpperCase();

      let td = await TestDefinition.findOne({ name: nameUpper }).populate('shortName category');
      if (!td) {
        // Try partial match
        td = await TestDefinition.findOne({ name: { $regex: nameUpper, $options: 'i' } }).populate('shortName category');
      }

      const isValidId = (v) => !!v && (mongoose.isValidObjectId(v) || (typeof v === 'object' && v._id && mongoose.isValidObjectId(v._id)));

      let mapped = { ...t };
      if (td) {
        mapped.testDefinitionId = td._id;
        // shortName in TestDefinition refers to ServiceHead ObjectId
        mapped.serviceHeadId = isValidId(td.shortName) ? (td.shortName._id || td.shortName) : null;
        mapped.categoryId = isValidId(td.category) ? (td.category._id || td.category) : null;
        // If category string is generic or missing, set to actual category name
        if ((!mapped.category || /^(general|others?)$/i.test(mapped.category)) && td.category) {
          try {
            const catId = td.category._id || td.category;
            if (mongoose.isValidObjectId(catId)) {
              const catDoc = await TestCategory.findById(catId).select('name');
              if (catDoc && catDoc.name) mapped.category = catDoc.name.toString();
            }
          } catch {}
        }
      } else {
        // Try direct service head match
        const sh = await ServiceHead.findOne({ testName: { $regex: nameUpper, $options: 'i' } }).populate('category');
        if (sh) {
          mapped.serviceHeadId = sh._id;
          const catId = (sh.category && (sh.category._id || sh.category)) || null;
          mapped.categoryId = isValidId(catId) ? (catId._id || catId) : null;
          if (!mapped.category && (sh.category && sh.category.name)) mapped.category = sh.category.name;
        }
      }
      return mapped;
    }

    const enrichedTests = Array.isArray(tests) ? await Promise.all(tests.map(mapTest)) : [];

    // Normalize sampleCollection keys from UI to schema fields
    const sampleCollectionNormalized = sampleCollection ? {
      collectionDate: sampleCollection.collectionDate || sampleCollection.date ? new Date(sampleCollection.collectionDate || sampleCollection.date) : undefined,
      collectionTime: sampleCollection.collectionTime || sampleCollection.time || undefined,
      collectedBy: sampleCollection.collectedBy || sampleCollection.technician || undefined,
      sampleType: sampleCollection.sampleType || undefined,
      containerType: sampleCollection.containerType || undefined,
      instructions: sampleCollection.instructions || undefined
    } : {};

    // Normalize payment object to avoid type/cast errors
    const normalizedPayment = {
      subtotal: Number(payment?.subtotal) || 0,
      totalDiscount: Number(payment?.totalDiscount) || 0,
      totalAmount: Number(payment?.totalAmount) || 0,
      paymentMethod: payment?.paymentMethod || 'CASH',
      paymentStatus: payment?.paymentStatus || 'PAID',
      paymentDate: payment?.paymentDate ? new Date(payment.paymentDate) : new Date()
    };

    // Create registration data with enhanced information
    const registrationData = {
      // 🏢 Multi-Tenant: Lab ID from middleware
      labId: req.labId,
      receiptNumber: receiptNumberNum,
      registrationMode: registrationMode || 'OPD', // Save the registration mode (OPD/IPD)
      // 🚨 FIX: Don't set yearNumber and todayNumber here - let pre-save hook generate them
      patient: enhancedPatient,
      doctor: enhancedDoctor,
      department: enhancedDepartment,
      doctorRefNo: doctorRefNo || req._doctorRefNoFromInvoice || '',
      // Link to original invoice document if it exists
      invoiceRef: req._invoiceId || null,
      tests: enrichedTests,
      sampleCollection: sampleCollectionNormalized,
      samplesCollected: Array.isArray(samplesCollected) ? samplesCollected : (typeof samplesCollected === 'string' ? samplesCollected.split(',').map(s=>s.trim()).filter(Boolean) : []),
      payment: normalizedPayment,
      registrationDate: registrationDate ? new Date(registrationDate) : new Date(),
      remarks: remarks || 'Pathology Registration',
      status: 'REGISTERED'
    };

    console.log('📋 Final registration data:', JSON.stringify(registrationData, null, 2));

    // If receipt number already exists (coming from cash receipt), generate lab numbers here.
    // Otherwise, let the pre-save hook on PathologyRegistration generate all numbers.
    let registration;
    if (receiptNumberNum != null) {
      const now = new Date();
      const currentYear = now.getFullYear();
      const todayString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; // LOCAL YYYY-MM-DD

      // Generate year number (yearly counter for pathology registrations)
      const modeReg = String(registrationData.registrationMode || 'OPD').toUpperCase();
      const yearCounterName = modeReg === 'IPD' ? `pathology_year_ipd_${currentYear}` : `pathology_year_${currentYear}`;
      const yearCounter = await Counter.findOneAndUpdate(
        { name: yearCounterName },
        { $inc: { value: 1 } },
        { new: true, upsert: true }
      );
      registrationData.yearNumber = yearCounter.value;

      // Generate today number (daily counter for pathology registrations)
      const todayCounterName = modeReg === 'IPD' ? `pathology_today_ipd_${todayString}` : `pathology_today_${todayString}`;
      const todayCounter = await Counter.findOneAndUpdate(
        { name: todayCounterName },
        { $inc: { value: 1 } },
        { new: true, upsert: true }
      );
      registrationData.todayNumber = todayCounter.value;

      console.log(`📅 Generated year number: ${registrationData.yearNumber} for year ${currentYear}`);
      console.log(`📆 Generated today number: ${registrationData.todayNumber} for date ${todayString}`);

      // Create and save registration with precomputed numbers
      registration = new PathologyRegistration(registrationData);
      await registration.save();
    } else {
      // No receipt number passed; rely on schema pre-save to generate all numbers atomically
      registration = new PathologyRegistration(registrationData);
      await registration.save();
    }

    console.log('✅ Pathology registration created successfully');
    console.log('📧 Receipt Number:', registration.receiptNumber);
    console.log('📅 Year Number:', registration.yearNumber);
    console.log('📆 Today Number:', registration.todayNumber);
    console.log('👨‍⚕️ Doctor Name:', registration.doctor?.name);
    console.log('🏥 Department:', registration.department?.name);
    console.log('🏠 Room Number:', registration.doctor?.roomNumber);

    res.status(201).json({
      success: true,
      message: 'Pathology registration created successfully with complete data',
      registration: {
        receiptNumber: registration.receiptNumber,
        yearNumber: registration.yearNumber,
        todayNumber: registration.todayNumber,
        totalAmount: registration.payment.totalAmount,
        registrationDate: registration.registrationDate,
        patient: registration.patient,
        doctor: registration.doctor,
        department: registration.department,
        doctorRefNo: registration.doctorRefNo || '',
        _id: registration._id
      }
    });

  } catch (error) {
    try {
      const plain = JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error)));
      console.error('❌ Error creating pathology registration (detailed):', plain);
    } catch {}
    console.error('❌ Error creating pathology registration:', error);

    const details = error?.errors ? Object.fromEntries(Object.entries(error.errors).map(([k,v]) => [k, v?.message || String(v)])) : undefined;
    res.status(500).json({
      success: false,
      message: 'Failed to create pathology registration',
      error: error.message,
      details
    });
  }
});

// Get all pathology registrations with pagination + server-side filters
router.get('/list', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Incoming filters
    const receipt = (req.query.receipt || req.query.receiptNo || '').toString().trim();
    const registration = (req.query.registration || '').toString().trim();
    const yearly = (req.query.yearly || req.query.yearNumber || '').toString().trim();
    const test = (req.query.test || '').toString().trim();
    const search = (req.query.search || '').toString().trim();
    const range = (req.query.dateRange || '').toString().trim(); // today|yesterday|week|month
    const startDate = (req.query.startDate || req.query.start || '').toString().trim();
    const endDate = (req.query.endDate || req.query.end || '').toString().trim();

    console.log('📋 Fetching registrations - Page:', page, 'Limit:', limit, '\nFilters:', { receipt, registration, yearly, test, search, range, startDate, endDate });

    // 🏢 Multi-Tenant: Build Mongo query with labId filter
    const query = {};
    if (!req.isSuperAdmin && req.labId) {
      query.labId = req.labId;
      console.log(`🏢 Filtering by Lab: ${req.labId}`);
    } else if (req.isSuperAdmin) {
      console.log(`🏢 SuperAdmin: Fetching ALL labs data`);
    }

    const andConds = [];

    // Exact receipt number (supports number or string storage)
    if (receipt) {
      const asNum = parseInt(receipt, 10);
      const orConds = [];
      if (!Number.isNaN(asNum)) orConds.push({ receiptNumber: asNum });
      orConds.push({ receiptNumber: receipt });
      andConds.push({ $or: orConds });
    }

    // Registration number (patient.registrationNumber)
    if (registration) {
      andConds.push({ 'patient.registrationNumber': { $regex: registration, $options: 'i' } });
    }

    // Lab Yearly No (yearNumber exact)
    if (yearly) {
      const yNum = parseInt(yearly, 10);
      if (!Number.isNaN(yNum)) {
        andConds.push({ yearNumber: yNum });
      }
    }

    // Test name loose match
    if (test) {
      andConds.push({ 'tests.name': { $regex: test, $options: 'i' } });
    }

    // Generic search across patient name / yearly / daily numbers
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const asNum = parseInt(search, 10);
      const or = [
        { 'patient.name': { $regex: regex } },
        // Allow partial match on numbers as strings (exact numeric match to avoid scanning on strings)
        ...(Number.isNaN(asNum) ? [] : [{ yearNumber: asNum }, { todayNumber: asNum }])
      ];
      andConds.push({ $or: or });
    }

    if (andConds.length) {
      query['$and'] = (query['$and'] || []).concat(andConds);
    }

    // Date range filter on registrationDate (fallback createdAt)
    // Use LOCAL dates to avoid UTC shift issues (e.g., IST -5:30 causing previous-day results)
    const addDateRange = (from, to) => {
      const conds = [];
      if (from || to) {
        const toLocalStart = (v) => {
          if (!v) return null;
          if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate(), 0, 0, 0, 0);
          const s = String(v);
          const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
          const d = new Date(s);
          return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
        };
        const start = toLocalStart(from) || new Date(1970, 0, 1, 0, 0, 0, 0);
        const endBase = toLocalStart(to) || new Date(9999, 11, 31, 0, 0, 0, 0);
        const end = new Date(endBase.getFullYear(), endBase.getMonth(), endBase.getDate(), 23, 59, 59, 999);
        conds.push({ registrationDate: { $gte: start, $lte: end } });
        conds.push({ createdAt: { $gte: start, $lte: end } });
        query['$and'] = (query['$and'] || []).concat([{ $or: conds }]);
      }
    };

    if (startDate || endDate) {
      addDateRange(startDate, endDate);
    } else if (range) {
      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      if (range === 'today') {
        addDateRange(startOfToday, startOfToday);
      } else if (range === 'yesterday') {
        const y = new Date(startOfToday);
        y.setDate(y.getDate() - 1);
        addDateRange(y, y);
      } else if (range === 'week') {
        const s = new Date(startOfToday);
        s.setDate(s.getDate() - 6);
        addDateRange(s, startOfToday);
      } else if (range === 'month') {
        const s = new Date(today.getFullYear(), today.getMonth(), 1);
        const e = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        addDateRange(s, e);
      }
    }

    // Execute with pagination
    const [registrations, total] = await Promise.all([
      PathologyRegistration.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      PathologyRegistration.countDocuments(query)
    ]);

    console.log(`✅ Found ${registrations.length} registrations out of ${total} total (after filters)`);

    res.json({
      success: true,
      registrations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('❌ Error fetching registrations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch registrations',
      error: error.message
    });
  }
});

// 🔧 Backfill invoiceRef into existing registrations and optionally copy doctorRefNo if missing
router.post('/backfill-invoice-ref', async (req, res) => {
  try {
    const overwriteDoctorRefNo = Boolean(req.body?.overwriteDoctorRefNo);
    const limit = Number(req.body?.limit ?? 5000);

    const regs = await PathologyRegistration.find({
      $and: [
        { $or: [{ invoiceRef: { $exists: false } }, { invoiceRef: null }] },
        { receiptNumber: { $exists: true, $ne: null } }
      ]
    }).limit(limit);

    if (regs.length === 0) {
      return res.json({ success: true, message: 'Nothing to backfill', matched: 0, updated: 0 });
    }

    // Fetch invoices for all receiptNumbers
    const receiptNumbers = regs.map(r => r.receiptNumber);
    const invoices = await PathologyInvoice.find({ receiptNumber: { $in: receiptNumbers } });
    const byReceipt = new Map(invoices.map(inv => [inv.receiptNumber, inv]));

    const ops = [];
    let updated = 0;
    regs.forEach(r => {
      const inv = byReceipt.get(r.receiptNumber);
      if (inv) {
        const setDoc = { invoiceRef: inv._id };
        if (overwriteDoctorRefNo || (!r.doctorRefNo && inv.doctorRefNo)) {
          setDoc['doctorRefNo'] = inv.doctorRefNo || '';
        }
        ops.push({ updateOne: { filter: { _id: r._id }, update: { $set: setDoc } } });
        updated++;
      }
    });

    if (ops.length > 0) {
      await PathologyRegistration.bulkWrite(ops);
    }

    return res.json({ success: true, matched: regs.length, updated });
  } catch (error) {
    console.error('❌ Backfill invoiceRef error:', error);
    return res.status(500).json({ success: false, message: 'Backfill failed', error: error.message });
  }
});

// Toggle Cash Receipt edit permission for a receipt (allowed only until report is generated on UI)
router.put('/receipt/:receiptNumber/cash-edit', async (req, res) => {
  try {
    const { receiptNumber } = req.params;
    const allow = Boolean(req.body?.allow);
    const numericReceipt = parseInt(receiptNumber);

    // Hard stop if any pathology report exists for this receipt
    try {
      const candidates = [receiptNumber];
      if (!Number.isNaN(numericReceipt)) candidates.push(numericReceipt);
      const found = await mongoose.connection.db.collection('reports').findOne({
        reportType: 'pathology',
        $or: [ { receiptNo: { $in: candidates } }, { receiptNumber: { $in: candidates } } ]
      }, { projection: { _id: 1 } });
      if (found) {
        return res.status(403).json({ success: false, message: 'Cannot change permission: Report already generated' });
      }
    } catch (e) {
      console.warn('⚠️ Report existence check failed, proceeding cautiously:', e?.message);
    }

    const registration = await PathologyRegistration.findOneAndUpdate(
      { $or: [ { receiptNumber: numericReceipt }, { receiptNumber: receiptNumber } ] },
      { $set: { cashEditAllowed: allow } },
      { new: true }
    );

    if (!registration) {
      return res.status(404).json({ success: false, message: 'Registration not found for this receipt' });
    }

    return res.json({ success: true, cashEditAllowed: registration.cashEditAllowed, registrationId: registration._id });
  } catch (error) {
    console.error('❌ Failed to toggle cash edit permission:', error);
    return res.status(500).json({ success: false, message: 'Failed to update permission', error: error.message });
  }
});


// ✅ Update only Lab Yearly No and Lab Daily No by receipt number
router.put('/receipt/:receiptNumber/lab-numbers', async (req, res) => {
  try {
    const { receiptNumber } = req.params;
    const numericReceipt = parseInt(receiptNumber);
    let { yearNumber, todayNumber } = req.body || {};

    // Basic validation and normalization
    yearNumber = Number(yearNumber);
    todayNumber = Number(todayNumber);
    if (!Number.isFinite(yearNumber) || yearNumber <= 0 || !Number.isFinite(todayNumber) || todayNumber <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid lab numbers' });
    }

    const registration = await PathologyRegistration.findOneAndUpdate(
      { $or: [ { receiptNumber: numericReceipt }, { receiptNumber: receiptNumber } ] },
      { $set: { yearNumber, todayNumber } },
      { new: true }
    );

    if (!registration) {
      return res.status(404).json({ success: false, message: 'Registration not found for this receipt' });
    }

    return res.json({
      success: true,
      registration: {
        _id: registration._id,
        receiptNumber: registration.receiptNumber,
        yearNumber: registration.yearNumber,
        todayNumber: registration.todayNumber
      }
    });
  } catch (error) {
    console.error('❌ Failed to update lab numbers:', error);
    return res.status(500).json({ success: false, message: 'Failed to update lab numbers', error: error.message });
  }
});


// ✅ Delete pathology registration by receipt number (only allowed if no report exists)
router.delete('/receipt/:receiptNumber', async (req, res) => {
  try {
    const { receiptNumber } = req.params;
    const numericReceipt = parseInt(receiptNumber);

    // Block deletion if any pathology report exists for this receipt
    try {
      const candidates = [receiptNumber];
      if (!Number.isNaN(numericReceipt)) candidates.push(numericReceipt);
      const found = await mongoose.connection.db.collection('reports').findOne(
        {
          reportType: 'pathology',
          $or: [
            { receiptNo: { $in: candidates } },
            { receiptNumber: { $in: candidates } }
          ]
        },
        { projection: { _id: 1 } }
      );
      if (found) {
        return res.status(403).json({ success: false, message: 'Cannot delete registration: Report already generated for this receipt' });
      }
    } catch (e) {
      console.warn('⚠️ Report existence check failed before delete:', e?.message);
    }

    // Delete the registration by receipt number (supports string or number storage)
    const deleted = await PathologyRegistration.findOneAndDelete({
      $or: [
        { receiptNumber: numericReceipt },
        { receiptNumber: receiptNumber }
      ]
    });

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Pathology registration not found for this receipt' });
    }

    // Archive a copy of this registration before/after hard delete for audit/recovery
    try {
      const DeletedRecord = require('../models/DeletedRecord');
      const regDate = deleted.registrationDate ? new Date(deleted.registrationDate) : (deleted.createdAt ? new Date(deleted.createdAt) : new Date());
      await DeletedRecord.create({
        entityType: 'PATHOLOGY_REGISTRATION',
        originalCollection: 'pathologyregistration',
        originalId: deleted._id,
        receiptNumber: Number(deleted.receiptNumber),
        year: regDate.getFullYear(),
        reason: req.query.reason || req.body?.reason || '',
        deletedBy: (req.user && (req.user.name || req.user.email || req.user.id)) || 'System',
        deletedAt: new Date(),
        data: deleted.toObject ? deleted.toObject() : deleted
      });
    } catch (e) {
      console.warn('⚠️ Failed to archive deleted pathology registration:', e?.message);
    }

    // Decrement counters only if this deleted record was the latest issued number
    let yearDecremented = false;
    let todayDecremented = false;
    try {
      const regDate = deleted.registrationDate ? new Date(deleted.registrationDate) : (deleted.createdAt ? new Date(deleted.createdAt) : new Date());
      const y = regDate.getFullYear();
      const m = String(regDate.getMonth() + 1).padStart(2, '0');
      const d = String(regDate.getDate()).padStart(2, '0');
      const isIPD = String(deleted.registrationMode || 'OPD').toUpperCase() === 'IPD';
      const yearCounterName = isIPD ? `pathology_year_ipd_${y}` : `pathology_year_${y}`;
      const todayCounterName = isIPD ? `pathology_today_ipd_${y}-${m}-${d}` : `pathology_today_${y}-${m}-${d}`;

      // Yearly counter: only decrement if counter currently equals the deleted.yearNumber
      const yearCounter = await Counter.findOne({ name: yearCounterName });
      if (yearCounter && Number(yearCounter.value) === Number(deleted.yearNumber) && yearCounter.value > 0) {
        const updated = await Counter.findOneAndUpdate(
          { name: yearCounterName },
          { $inc: { value: -1 } },
          { new: true }
        );
        yearDecremented = true;
        console.log(`↘️ pathology_year decremented to ${updated?.value}`);
      } else {
        console.log('ℹ️ pathology_year not decremented (not the latest or counter missing)');
      }

      // Daily counter: only decrement if counter currently equals the deleted.todayNumber
      const todayCounter = await Counter.findOne({ name: todayCounterName });
      if (todayCounter && Number(todayCounter.value) === Number(deleted.todayNumber) && todayCounter.value > 0) {
        const updated = await Counter.findOneAndUpdate(
          { name: todayCounterName },
          { $inc: { value: -1 } },
          { new: true }
        );
        todayDecremented = true;
        console.log(`↘️ pathology_today decremented to ${updated?.value}`);
      } else {
        console.log('ℹ️ pathology_today not decremented (not the latest or counter missing)');
      }
    } catch (decErr) {
      console.warn('⚠️ Failed to decrement counters after deletion:', decErr?.message);
    }

    return res.json({
      success: true,
      message: 'Pathology registration deleted successfully',
      registrationId: deleted._id,
      receiptNumber: deleted.receiptNumber,
      counters: { yearDecremented, todayDecremented }
    });
  } catch (error) {
    console.error('❌ Failed to delete pathology registration:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete pathology registration', error: error.message });
  }
});

module.exports = router;
