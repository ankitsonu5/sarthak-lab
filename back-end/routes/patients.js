const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');
const Counter = require('../models/Counter');

// Helper function to calculate date of birth from age
function calculateDateOfBirth(age, ageIn) {
  const currentDate = new Date();
  let birthDate = new Date(currentDate);

  if (ageIn === 'Years') {
    birthDate.setFullYear(currentDate.getFullYear() - age);
  } else if (ageIn === 'Months') {
    birthDate.setMonth(currentDate.getMonth() - age);
  } else if (ageIn === 'Days') {
    birthDate.setDate(currentDate.getDate() - age);
  }

  return birthDate;
}

// Helper function to capitalize first letter
const capitalizeFirstLetter = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

// Generate UHID by finding highest existing one
async function generateUHID() {
  let maxId = 0;

  try {
    const existingPatients = await Patient.find({}, { patientId: 1 }).sort({ patientId: -1 }).limit(20);

    existingPatients.forEach(patient => {
      if (patient.patientId && patient.patientId.startsWith('PAT')) {
        // Remove PAT prefix and leading zeros, then parse
        const idStr = patient.patientId.replace('PAT', '').replace(/^0+/, '') || '0';
        const idNum = parseInt(idStr);
        if (!isNaN(idNum) && idNum > maxId) maxId = idNum;
      }
    });
  } catch (error) {
    console.log('⚠️ Error checking existing UHIDs:', error.message);
  }

  const nextId = maxId + 1;
  const newUHID = `PAT${String(nextId).padStart(6, '0')}`; // PAT000001, PAT000002...

  console.log('🆕 Generated UHID:', newUHID);
  console.log('🆕 Previous max ID was:', maxId, '→ New ID is:', nextId);

  return newUHID;
}

// Get daily patient registration count (from Counter to keep in sync with save logic)
router.get('/daily-count', async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();

    // Get current year for year-wise counter
    const currentYear = targetDate.getFullYear();
    const counterName = `patientId_${currentYear}`;

    console.log('📊 Getting daily patient registration counter for year:', currentYear);

    // Read current counter value for the year
    const counter = await Counter.findOne({ name: counterName });
    const count = counter?.value || 0; // existing issued patient IDs this year

    console.log('📊 Patient registration counter value for year', currentYear, ':', count);

    res.json({
      success: true,
      count,
      year: currentYear,
      date: targetDate.toISOString().split('T')[0]
    });
  } catch (error) {
    console.error('❌ Error getting daily patient count:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting daily patient count',
      error: error.message
    });
  }
});

// Get yearly patient registration count (from Counter to keep in sync with save logic)
router.get('/yearly-count', async (req, res) => {
  try {
    const { year } = req.query;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();

    // Counter name for the year's patient registrations
    const counterName = `patientId_${targetYear}`;
    console.log('📅 Getting yearly patient registration counter for:', targetYear);

    // Read current counter value; do NOT count documents
    const counter = await Counter.findOne({ name: counterName });
    const count = counter?.value || 0;

    console.log('📅 Yearly patient registration counter value:', count);

    res.json({
      success: true,
      count,
      year: targetYear
    });
  } catch (error) {
    console.error('❌ Error getting yearly patient count:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting yearly patient count',
      error: error.message
    });
  }
});

// Patient registration route - ALL PATIENTS PERMANENT IN MONGODB
router.post('/register', async (req, res) => {
  try {
    console.log('📝 Patient registration request received');
    console.log('📝 Request body:', req.body);

    const {
      firstName,
      lastName,
      age,
      ageIn = 'Years',
      gender,
      contact,
      aadharNo,
      address,
      city,
      post,
      remark,
      bloodGroup,
      date,
      designation
    } = req.body;

    // Validate required fields
    if (!firstName || !age || !gender) {
      return res.status(400).json({
        success: false,
        message: 'First name, age, and gender are required'
      });
    }

    // Calculate date of birth from age
    const dateOfBirth = calculateDateOfBirth(parseInt(age), ageIn);

    // Normalize address payload and map to schema shape (nested address fields)
    const addressString = typeof address === 'string'
      ? address.trim()
      : (address && address.street ? String(address.street).trim() : '');

    const cityString = city && city.trim() ? capitalizeFirstLetter(city) : undefined;
    const postString = post && post.trim() ? capitalizeFirstLetter(post) : undefined;

    const addressObj = {};
    if (addressString) addressObj.street = addressString;
    if (cityString) addressObj.city = cityString;
    if (postString) addressObj.post = postString;

    // Create patient data object
    const patientData = {
      firstName: capitalizeFirstLetter(firstName),
      lastName: lastName ? capitalizeFirstLetter(lastName) : '',
      age: parseInt(age),
      ageIn,
      dateOfBirth,
      gender,
      phone: contact, // Map contact to phone field for model compatibility
      aadharNo: aadharNo && aadharNo.trim() ? aadharNo.trim() : undefined,
      address: Object.keys(addressObj).length ? addressObj : undefined,
      remark: remark || '',
      bloodGroup: bloodGroup === 'NA' || !bloodGroup ? undefined : bloodGroup,
      registrationDate: date ? new Date(date) : new Date(),
      designation: designation && designation.trim() ? capitalizeFirstLetter(designation) : undefined
    };

    // Remove undefined fields
    Object.keys(patientData).forEach(key => {
      if (patientData[key] === undefined) {
        delete patientData[key];
      }
    });

    console.log('📝 Processed patient data:', patientData);

    // Create new patient - ALWAYS SAVE TO MONGODB
    const patient = new Patient(patientData);
    const savedPatient = await patient.save();

    // 🔐 Audit: CREATE
    try { const { recordAudit } = require('../utils/audit');
      await recordAudit({
        req,
        entityType: 'Patient',
        entityId: savedPatient._id,
        action: 'CREATE',
        beforeDoc: {},
        afterDoc: savedPatient.toObject(),
        meta: { endpoint: 'POST /patients/register', patientId: savedPatient.patientId }
      });
    } catch (e) { console.warn('⚠️ Patient create audit failed:', e?.message); }

    console.log('✅ Patient saved to MongoDB with UHID:', savedPatient.patientId);

    res.status(201).json({
      success: true,
      message: 'Patient registered successfully in MongoDB',
      patient: {
        _id: savedPatient._id,
        patientId: savedPatient.patientId,
        registrationNumber: savedPatient.registrationNumber,
        firstName: savedPatient.firstName,
        lastName: savedPatient.lastName,
        age: savedPatient.age,
        ageIn: savedPatient.ageIn,
        gender: savedPatient.gender,
        phone: savedPatient.phone,
        aadharNo: savedPatient.aadharNo,
        address: savedPatient.address,
        city: savedPatient.address?.city || savedPatient.city,
        post: savedPatient.address?.post || savedPatient.post,
        remark: savedPatient.remark,
        bloodGroup: savedPatient.bloodGroup,
        registrationDate: savedPatient.registrationDate,
        createdAt: savedPatient.createdAt,
        updatedAt: savedPatient.updatedAt
      }
    });

  } catch (error) {
    console.error('Patient registration error:', error);

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      console.error('❌ DUPLICATE KEY ERROR on field:', field, 'This should not happen for auto-generated patientId!');
      res.status(500).json({ success: false, message: 'Registration ID generation conflict. Please try again.' });
    } else if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      res.status(400).json({ success: false, message: 'Validation error: ' + messages.join(', ') });
    } else {
      res.status(500).json({ success: false, message: 'Failed to register patient: ' + error.message });
    }
  }
});

// Get all patients - optimized server-side pagination and sorting
router.get('/list', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 100,
      search = '',
      todayOnly = 'false',
      dateFilter,
      customDate,
      ageFilter,
      genderFilter,
      sortBy,
      sortOrder
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(Math.max(1, parseInt(limit)), 200); // cap to 200
    const skip = (pageNum - 1) * pageSize;

    const query = {};

    // Fast search paths (anchored)
    if (search && String(search).trim()) {
      const s = String(search).trim();
      if (/^PAT\d+$/i.test(s)) {
        // Exact UHID match
        query.patientId = new RegExp(`^${s.toUpperCase()}$`, 'i');
      } else if (/^\d{10}$/.test(s)) {
        // Phone
        query.phone = new RegExp(`^${s}`);
      } else if (/^\d{12}$/.test(s)) {
        // Aadhaar
        query.aadharNo = new RegExp(`^${s}`);
      } else {
        // Fallback broad search (names/address)
        query.$or = [
          { firstName: { $regex: s, $options: 'i' } },
          { lastName: { $regex: s, $options: 'i' } },
          { 'address.street': { $regex: s, $options: 'i' } },
          { 'address.city': { $regex: s, $options: 'i' } },
          { patientId: { $regex: s, $options: 'i' } },
          { phone: { $regex: s, $options: 'i' } },
          { aadharNo: { $regex: s, $options: 'i' } }
        ];
      }
    }

    // Date window
    if (todayOnly === 'true') {
      const now = new Date();
      const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      const end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + 1));
      query.registrationDate = { $gte: start, $lt: end };
    } else if (dateFilter && dateFilter !== 'all') {
      const base = new Date();
      let from, to;
      switch (dateFilter) {
        case 'today':
          from = new Date(base); from.setHours(0,0,0,0);
          to = new Date(from); to.setDate(to.getDate() + 1); break;
        case 'yesterday':
          to = new Date(base); to.setHours(0,0,0,0);
          from = new Date(to); from.setDate(from.getDate() - 1); break;
        case 'week':
          from = new Date(base); from.setDate(from.getDate() - 7); from.setHours(0,0,0,0); break;
        case 'month':
          from = new Date(base); from.setMonth(from.getMonth() - 1); from.setHours(0,0,0,0); break;
        case 'custom':
          if (customDate) {
            from = new Date(customDate); from.setHours(0,0,0,0);
            to = new Date(from); to.setDate(to.getDate() + 1);
          }
          break;
      }
      if (from) query.registrationDate = to ? { $gte: from, $lt: to } : { $gte: from };
    }

    // Age filter
    if (ageFilter && ageFilter !== 'all') {
      switch (ageFilter) {
        case 'child': query.age = { $gte: 0, $lte: 12 }; break;
        case 'teen': query.age = { $gte: 13, $lte: 19 }; break;
        case 'adult': query.age = { $gte: 20, $lte: 59 }; break;
        case 'senior': query.age = { $gte: 60 }; break;
      }
    }

    // Gender filter
    if (genderFilter && genderFilter !== 'all') {
      query.gender = new RegExp(`^${genderFilter}$`, 'i');
    }

    // Sort
    const sort = {};
    if (sortBy) {
      sort[String(sortBy)] = (String(sortOrder).toLowerCase() === 'asc') ? 1 : -1;
    } else {
      sort.registrationDate = -1; // newest first
      sort.patientId = -1;        // tie-breaker
    }

    const projection = '_id patientId registrationNumber firstName lastName age ageIn gender phone aadharNo address registrationDate createdAt';

    const t0 = Date.now();
    const [patients, total] = await Promise.all([
      Patient.find(query).select(projection).sort(sort).skip(skip).limit(pageSize).lean(),
      Patient.countDocuments(query)
    ]);
    const dt = Date.now() - t0;
    console.log(`⏱️ /patients/list query=${JSON.stringify(query)} page=${pageNum} limit=${pageSize} -> ${dt}ms, rows=${patients.length}, total=${total}`);

    res.json({
      success: true,
      patients,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        totalPatients: total,
        hasNext: skip + patients.length < total,
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    console.error('❌ Error fetching patients:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch patients: ' + error.message });
  }
});

// 🎯 NEW: Get latest registered patient from database (MUST BE BEFORE /:id route)
router.get('/latest', async (req, res) => {
  try {
    console.log('🎯 API: Getting latest registered patient from database...');

    // Get the latest patient by registration date and UHID (highest number)
    const latestPatient = await Patient.findOne()
      .sort({
        registrationDate: -1,  // Latest registration date first
        patientId: -1          // Highest UHID first
      })
      .exec();

    if (!latestPatient) {
      console.log('❌ API: No patients found in database');
      return res.status(404).json({
        success: false,
        message: 'No patients found in database'
      });
    }

    console.log('✅ API: Latest patient found:', {
      uhid: latestPatient.patientId,
      name: `${latestPatient.firstName} ${latestPatient.lastName}`,
      registrationDate: latestPatient.registrationDate
    });

    res.json({
      success: true,
      patient: latestPatient,
      message: 'Latest patient retrieved successfully'
    });

  } catch (error) {
    console.error('❌ API: Error getting latest patient:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get latest patient',
      error: error.message
    });
  }
});

// Update patient by ID
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('PUT /api/patients/:id - Update request for ID:', id);

    // Fetch BEFORE snapshot for audit trail
    const before = await Patient.findById(id).lean();


    const {
      firstName,
      lastName,
      age,
      ageIn = 'Years',
      gender,
      contact,
      aadharNo,
      address,
      city,
      post,
      remark,
      bloodGroup,
      designation
    } = req.body;

    // Build update object with proper mappings and formatting
    const updateData = {};

    if (firstName !== undefined) updateData.firstName = capitalizeFirstLetter(firstName);
    if (lastName !== undefined) updateData.lastName = lastName ? capitalizeFirstLetter(lastName) : '';
    if (age !== undefined) updateData.age = parseInt(age);
    if (ageIn !== undefined) updateData.ageIn = ageIn;
    if (gender !== undefined) updateData.gender = gender;
    if (contact !== undefined) updateData.phone = String(contact).trim();
    if (designation !== undefined) updateData.designation = designation && String(designation).trim() ? capitalizeFirstLetter(String(designation)) : undefined;

    if (aadharNo !== undefined && aadharNo !== '') updateData.aadharNo = String(aadharNo).trim();
    if (remark !== undefined) updateData.remark = remark;
    if (bloodGroup !== undefined) updateData.bloodGroup = (bloodGroup === 'NA' || bloodGroup === '') ? undefined : bloodGroup;

    // Recalculate DOB only if age or ageIn provided
    if (age !== undefined || ageIn !== undefined) {
      const a = age !== undefined ? parseInt(age) : undefined;
      const ai = ageIn !== undefined ? ageIn : undefined;
      if (!isNaN(a) && ai) {
        updateData.dateOfBirth = calculateDateOfBirth(a, ai);
      }
    }

    // Normalize address payload and map to schema shape (nested address fields)
    const addressString = typeof address === 'string'
      ? address.trim()
      : (address && address.street ? String(address.street).trim() : '');

    const cityString = city && String(city).trim() ? capitalizeFirstLetter(String(city)) : undefined;
    const postString = post && String(post).trim() ? capitalizeFirstLetter(String(post)) : undefined;

    const addressObj = {};
    if (addressString) addressObj.street = addressString;
    if (cityString) addressObj.city = cityString;
    if (postString) addressObj.post = postString;

    if (Object.keys(addressObj).length) {
      updateData.address = addressObj;
    }

    // Remove undefined keys (only set what is provided)
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) delete updateData[key];
    });

    console.log('📝 Processed update data:', updateData);

    const updatedPatient = await Patient.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedPatient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // 🔐 Audit: UPDATE
    try { const { recordAudit } = require('../utils/audit');
      await recordAudit({
        req,
        entityType: 'Patient',
        entityId: updatedPatient._id,
        action: 'UPDATE',
        beforeDoc: before || {},
        afterDoc: updatedPatient.toObject(),
        meta: { endpoint: 'PUT /patients/:id', patientId: updatedPatient.patientId }
      });
    } catch (e) { console.warn('⚠️ Patient update audit failed:', e?.message); }


    console.log('✅ Patient updated successfully:', updatedPatient.patientId);

    // Persist embedded editHistory on Patient document
    try {
      const { buildDiff } = require('../utils/audit');
      const editedBy = (req.user && (req.user.name || req.user.email)) || 'System';
      const fields = [
        'firstName','lastName','phone','aadharNo','age','ageIn','dateOfBirth','gender','remark','bloodGroup','registrationDate','isActive',
        'address.street','address.city','address.state','address.zipCode','address.country','address.post'
      ];
      const changes = buildDiff(before || {}, updatedPatient.toObject(), fields);
      if (Object.keys(changes).length) {
        await Patient.updateOne({ _id: id }, {
          $push: { editHistory: { editedAt: new Date(), editedBy, changes } },
          $inc: { editCount: 1 }
        });
      }
    } catch (e) { console.warn('⚠️ Failed to push embedded patient editHistory:', e?.message); }


    return res.json({
      success: true,
      message: 'Patient updated successfully',
      patient: {
        _id: updatedPatient._id,
        patientId: updatedPatient.patientId,
        firstName: updatedPatient.firstName,
        lastName: updatedPatient.lastName,
        age: updatedPatient.age,
        ageIn: updatedPatient.ageIn,
        gender: updatedPatient.gender,
        phone: updatedPatient.phone,
        aadharNo: updatedPatient.aadharNo,
        address: updatedPatient.address,
        remark: updatedPatient.remark,
        bloodGroup: updatedPatient.bloodGroup,
        updatedAt: updatedPatient.updatedAt
      }
    });
  } catch (error) {
    console.error('❌ Error updating patient:', error);

    if (error.code === 11000) {
      // Duplicate key error (e.g., aadharNo unique)
      const field = Object.keys(error.keyPattern)[0];
      const message = field === 'aadharNo' ? 'Patient with this Aadhar number already exists' : 'Duplicate value';
      return res.status(400).json({ success: false, message });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to update patient: ' + error.message
    });
  }
});


// Get patient by ID for prefilling forms
router.get('/:id', async (req, res) => {
  try {
    console.log('GET /api/patients/:id - Request received for ID:', req.params.id);

    const patient = await Patient.findById(req.params.id);

    if (!patient) {
      console.log('❌ Patient not found with ID:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    console.log('✅ Patient found:', patient.firstName, patient.lastName, 'UHID:', patient.patientId);

    // Format patient data for frontend
    const patientObj = patient.toObject();

    // Ensure address is properly formatted for form fields
    if (patientObj.address && typeof patientObj.address === 'object') {
      // Keep the address object but also add a flat address field for compatibility
      patientObj.addressString = patientObj.address.street || '';
    } else {
      patientObj.addressString = patientObj.address || '';
    }

    // Return patient object directly (not wrapped in success object)
    res.json(patientObj);

  } catch (error) {
    console.error('Error fetching patient by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch patient: ' + error.message
    });
  }
});

// Get patient registration number suggestions
router.get('/suggestions/:query', async (req, res) => {
  try {
    const { query } = req.params;
    console.log(`🔍 Getting suggestions for: ${query}`);

    // Find patients whose patientId starts with the query
    const patients = await Patient.find({
      patientId: { $regex: `^${query}`, $options: 'i' }
    })
    .select('patientId firstName lastName')
    .limit(10)
    .sort({ patientId: 1 });

    const suggestions = patients.map(patient => patient.patientId);

    res.json({
      success: true,
      suggestions: suggestions
    });
  } catch (error) {
    console.error('❌ Error getting suggestions:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting suggestions',
      error: error.message
    });
  }
});

// Get patient by registration identifier (numeric registrationNumber or UHID)
router.get('/registration/:registrationNumber', async (req, res) => {
  try {
    const raw = (req.params.registrationNumber || '').toString().trim().toUpperCase();
    console.log(`🔍 Searching for patient by registration identifier: ${raw}`);

    let query;
    if (/^\d+$/.test(raw)) {
      // Numeric only -> use simple registrationNumber
      query = { registrationNumber: parseInt(raw, 10) };
    } else {
      // Fallback to UHID (e.g., PAT000123)
      query = { patientId: raw };
    }

    const patient = await Patient.findOne(query);

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found with this registration identifier'
      });
    }

    console.log('✅ Patient found:', patient.patientId, '(RegNo:', patient.registrationNumber, ')');

    res.json({
      success: true,
      patient: {
        _id: patient._id,
        patientId: patient.patientId,
        registrationNumber: patient.registrationNumber,
        firstName: patient.firstName,
        lastName: patient.lastName,
        age: patient.age,
        gender: patient.gender,
        contact: patient.phone,
        address: patient.address?.street || '',
        registrationDate: patient.registrationDate
      }
    });
  } catch (error) {
    console.error('❌ Error fetching patient by registration number:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching patient',
      error: error.message
    });
  }
});

// Delete patient by ID
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🗑️ DELETE /api/patients/:id - Request received for ID:', id);

    // Find the patient first to check if it's the last one
    const deletedPatient = await Patient.findById(id);

    if (!deletedPatient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Extract year from patient ID (PAT000521 → get registration year)
    const patientYear = deletedPatient.registrationDate
      ? new Date(deletedPatient.registrationDate).getFullYear()
      : new Date().getFullYear();

    const counterName = `patientId_${patientYear}`;

    // Get current counter value
    const counter = await Counter.findOne({ name: counterName });

    if (counter) {
      // Extract numeric part from patientId (PAT000521 → 521)
      const patientNumericId = parseInt(deletedPatient.patientId.replace('PAT', ''));

      // Check if this is the last patient (counter value matches patient ID)
      if (patientNumericId === counter.value) {
        console.log(`🔄 Last patient detected! Decrementing counter from ${counter.value} to ${counter.value - 1}`);



        // Decrement counter
        counter.value = Math.max(0, counter.value - 1);
        await counter.save();

        console.log(`✅ Counter decremented successfully to ${counter.value}`);
      } else {
        console.log(`ℹ️ Not the last patient. Patient ID: ${patientNumericId}, Counter: ${counter.value}. Counter unchanged.`);
      }
    }

    // Now delete the patient
    await Patient.findByIdAndDelete(id);

    console.log('✅ Patient deleted successfully:', deletedPatient.patientId);

    res.json({
      success: true,
      message: 'Patient deleted successfully',
      patient: {
        _id: deletedPatient._id,
        patientId: deletedPatient.patientId,
        firstName: deletedPatient.firstName,
        lastName: deletedPatient.lastName
      }
    });


    // 512 Audit: DELETE
    try { const { recordAudit } = require('../utils/audit');
      await recordAudit({
        req,
        entityType: 'Patient',
        entityId: deletedPatient._id,
        action: 'DELETE',
        beforeDoc: deletedPatient.toObject ? deletedPatient.toObject() : deletedPatient,
        afterDoc: {},
        meta: { endpoint: 'DELETE /patients/:id', patientId: deletedPatient.patientId }
      });
    } catch (e) { console.warn('\u26a0\ufe0f Patient delete audit failed:', e?.message); }

  } catch (error) {
    console.error('❌ Error deleting patient:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete patient',
      error: error.message
    });
  }
});

module.exports = router;
