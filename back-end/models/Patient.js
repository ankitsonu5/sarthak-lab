const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  patientId: {
    type: String,
    unique: true
  },
  registrationNumber: {
    type: Number,
    index: true
  },

  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: false, // Optional field
    trim: true
  },
  phone: {
    type: String,
    required: false // Optional as per client requirement; contact number not mandatory
  },
  // Add aadhar number field - No validation, multiple UHIDs allowed for same Aadhaar
  aadharNo: {
    type: String,
    // Removed unique constraint - multiple patients can have same Aadhaar
    // No validation - any format allowed
  },
  // Age fields
  age: {
    type: Number,
    required: true,
    min: 0
  },
  ageIn: {
    type: String,
    enum: ['Years', 'Months', 'Days'],
    default: 'Years'
  },
  dateOfBirth: {
    type: Date
  },
  designation: {
    type: String,
    trim: true
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    required: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
    post: String // Add post field
  },
  emergencyContact: {
    name: String,
    relationship: String,
    phone: String
  },
  medicalHistory: [{
    condition: String,
    diagnosedDate: Date,
    status: {
      type: String,
      enum: ['Active', 'Resolved', 'Chronic'],
      default: 'Active'
    }
  }],
  allergies: [String],
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'NA']
  },
  remark: {
    type: String
  },
  registrationDate: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Embedded edit history and count
  editHistory: [{
    editedAt: { type: Date, default: Date.now },
    editedBy: { type: String },
    changes: { type: mongoose.Schema.Types.Mixed }
  }],
  editCount: { type: Number, default: 0 }
}, {
  timestamps: true
});

// Generate patient ID and registration number automatically - Year-wise reset; registration number supports optional prefix
patientSchema.pre('save', async function(next) {
  try {
    const CounterService = require('../services/counter-service');
    const currentYear = new Date().getFullYear();

    // UHID generation (year-wise)
    if (!this.patientId) {
      try {
        const uhidCounterName = `patientId_${currentYear}`;
        const result = await CounterService.getNextValue(uhidCounterName, 'PAT', 6);
        this.patientId = result.formattedId;
        console.log(`🆕 Generated NEW UHID: ${this.patientId} for year ${currentYear} (Counter: ${result.value})`);
      } catch (err) {
        console.error('❌ Error generating UHID:', err);
        this.patientId = `PAT${Date.now().toString().slice(-6)}`;
      }
    }

    // Registration number generation (year-wise)
    if (!this.registrationNumber) {
      try {
        const regCounterName = `regNo_${currentYear}`;
        const regRes = await CounterService.getNextValue(regCounterName, '', 0);
        this.registrationNumber = regRes.value;
      } catch (err) {
        console.error('❌ Error generating registration number:', err);
        // Fallback: derive from UHID numeric part if available
        const num = (this.patientId || '').toString().replace('PAT','').replace(/^0+/, '');
        this.registrationNumber = parseInt(num, 10) || undefined;
      }
    }

    next();
  } catch (error) {
    console.error('❌ Patient pre-save error:', error);
    next(error);
  }
});

// Drop any existing unique index on aadharNo to allow multiple UHIDs per Aadhaar
patientSchema.index({ aadharNo: 1 }, { unique: false, sparse: true });

// Performance-critical indexes for search/listing
patientSchema.index({ registrationDate: -1, patientId: -1 });
patientSchema.index({ createdAt: -1 });
patientSchema.index({ phone: 1 });
patientSchema.index({ patientId: 1 });


module.exports = mongoose.model('Patient', patientSchema);
