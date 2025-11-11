const mongoose = require('mongoose');

// Counter model for sequential receipt numbers
const Counter = require('./Counter');

const pathologyInvoiceSchema = new mongoose.Schema({
  receiptNumber: {
    type: Number
  },
  invoiceNumber: {
    type: String
  },
  bookingId: {
    type: String
  },

  // Lab Numbers for tracking
  labYearlyNo: {
    type: Number
  },
  labDailyNo: {
    type: Number
  },

  // Patient Information - NO VALIDATION
  patient: {
    patientId: String,
    registrationNumber: String,
    name: String,
    phone: String,
    gender: String,
    age: Number, // Store age as number only
    ageIn: String, // Store age unit separately (Years/Months/Days)
    address: String
  },

  // Doctor and Department Information - NO VALIDATION
  doctor: {
    name: String,
    specialization: String,
    roomNumber: String
  },

  department: {
    name: String,
    code: String
  },

  // Additional context
  mode: { type: String, default: '' },
  appointmentId: { type: String, default: '' },
  appointmentRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null, index: true }, // ✅ new
  departmentId: { type: String, default: '' },
  // Top-level references for reliable joins (legacy string IDs kept for compatibility)
  patientId: { type: String, default: '' },
  doctorId: { type: String, default: '' },

  // Proper Mongo refs for live joins
  patientRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null, index: true },
  doctorRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null, index: true },
  departmentRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },

  // Test Information - NO VALIDATION
  tests: [{
    name: String,
    category: String,
    categoryId: String,
    cost: Number,
    quantity: {
      type: Number,
      default: 1
    },
    discount: {
      type: Number,
      default: 0
    },
    netAmount: Number
  }],

  // Payment Information - NO VALIDATION
  payment: {
    subtotal: Number,
    totalDiscount: {
      type: Number,
      default: 0
    },
    totalAmount: Number,
    paymentMethod: {
      type: String,
      default: 'CASH'
    },
    paymentStatus: {
      type: String,
      default: 'PAID'
    },
    paymentDate: {
      type: Date,
      default: Date.now
    },
    // Track edits as adjustments: positive = collect more, negative = refund to patient
    adjustments: [{
      delta: { type: Number, default: 0 },
      reason: { type: String, default: 'EDIT' },
      note: { type: String, default: '' },
      at: { type: Date, default: Date.now }
    }]
  },

  // Lab Information
  labInfo: {
    name: {
      type: String,
      default: 'राजकीय आयुर्वेद महाविद्यालय एवं चिकित्सालय'
    },
    address: {
      type: String,
      default: 'चौकाघाट, वाराणसी'
    }
  },

  // Dates
  bookingDate: {
    type: Date,
    default: Date.now
  },

  registrationDate: {
    type: Date
  },

  // Status
  status: {
    type: String,
    enum: ['ACTIVE', 'CANCELLED', 'COMPLETED'],
    default: 'ACTIVE'
  },

  // Print Status
  isPrinted: {
    type: Boolean,
    default: false
  },

  printedAt: {
    type: Date
  },

  // Update tracking
  updatedAt: {
    type: Date
  },

  // Edit tracking
  isEdited: {
    type: Boolean,
    default: false
  },
  lastEditedAt: {
    type: Date
  },
  lastEditedBy: {
    type: String
  },
  editHistory: [{
    editedAt: { type: Date, default: Date.now },
    editedBy: { type: String, default: 'System' },
    changes: { type: mongoose.Schema.Types.Mixed }
  }],

  // DB-CRN tracking
  dbCrn: { type: Number, index: true },

  // Doctor Reference Number
  doctorRefNo: {
    type: String,
    maxlength: 100
  }
}, {
  timestamps: true
});


// Normalize patient age/ageIn before validation so it always persists
pathologyInvoiceSchema.pre('validate', function(next) {
  try {
    if (this.patient) {
      // Cast age to number and parse compact formats like "7 D" or "3M"
      if (typeof this.patient.age === 'string' && this.patient.age.trim()) {
        const s = this.patient.age.trim();
        let m = s.match(/^([0-9]+)\s*([YMD])?$/i);
        if (!m) m = s.match(/^([0-9]+)\s*([A-Za-z]+)/);
        if (m) {
          const n = parseInt(m[1], 10);
          if (!isNaN(n)) this.patient.age = n;
          const u = (m[2] || '').toString().toLowerCase();
          if (u) {
            if (u.startsWith('y')) this.patient.ageIn = 'Years';
            else if (u.startsWith('m')) this.patient.ageIn = 'Months';
            else if (u.startsWith('d')) this.patient.ageIn = 'Days';
          }
        } else {
          const n = parseInt(s, 10);
          if (!isNaN(n)) this.patient.age = n;
        }
      }

      // Normalize ageIn to full word; default to Years when age is a valid number
      const aiRaw = ((this.patient.ageIn ?? '') + '').trim().toLowerCase();
      if (aiRaw) {
        if (aiRaw.startsWith('y')) this.patient.ageIn = 'Years';
        else if (aiRaw.startsWith('m')) this.patient.ageIn = 'Months';
        else if (aiRaw.startsWith('d')) this.patient.ageIn = 'Days';
      } else if (typeof this.patient.age === 'number' && !isNaN(this.patient.age)) {
        // If age is present but ageIn missing, default to Years
        this.patient.ageIn = 'Years';
      }
    }
  } catch (e) {
    // Do not block save on normalization failures
    console.warn('⚠️ PathologyInvoice normalize age/ageIn failed:', e.message);
  }
  next();
});

// Pre-save hook to generate sequential receipt number
pathologyInvoiceSchema.pre('save', async function(next) {
  if (this.isNew && !this.receiptNumber) {
    try {
      // Get current year for receipt numbering
      const currentYear = new Date().getFullYear();
      const counterName = `pathology_receipt_${currentYear}`;

      // Find and increment counter for current year
      const counter = await Counter.findOneAndUpdate(
        { name: counterName },
        { $inc: { value: 1 } },
        { new: true, upsert: true }
      );

      this.receiptNumber = counter.value;
      console.log(`📧 Generated receipt number: ${this.receiptNumber} for year ${currentYear}`);
    } catch (error) {
      console.error('❌ Error generating receipt number:', error);
      return next(error);
    }
  }
  next();
});

// Index for faster queries
pathologyInvoiceSchema.index({ receiptNumber: 1 });
pathologyInvoiceSchema.index({ dbCrn: 1 });

pathologyInvoiceSchema.index({ 'patient.registrationNumber': 1 });
pathologyInvoiceSchema.index({ bookingDate: 1 });
pathologyInvoiceSchema.index({ status: 1 });
pathologyInvoiceSchema.index({ patientRef: 1 });
pathologyInvoiceSchema.index({ doctorRef: 1 });
pathologyInvoiceSchema.index({ departmentRef: 1 });
pathologyInvoiceSchema.index({ appointmentRef: 1 }); // ✅ index for queries by appointment

module.exports = mongoose.model('PathologyInvoice', pathologyInvoiceSchema);
