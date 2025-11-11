const mongoose = require('mongoose');

// Counter model for sequential numbers
const Counter = require('./Counter');

const pathologyRegistrationSchema = new mongoose.Schema({
  receiptNumber: {
    type: Number,
    unique: true, // Enforce one registration per receipt number
    sparse: true  // Allow documents without receiptNumber
  },

  // Year and Daily Numbers for tracking
  yearNumber: {
    type: Number
  },
  todayNumber: {
    type: Number
  },

  // Patient Information
  patient: {
    patientId: String,
    registrationNumber: String,
    name: String,
    phone: String,
    gender: String,
    age: Number,
    ageIn: String,
    address: String
  },

  // Doctor and Department Information
  doctor: {
    name: String,
    specialization: String,
    roomNumber: String
  },

  department: {
    name: String,
    code: String
  },

  // Doctor Reference Number (optional)
  doctorRefNo: {
    type: String,
    maxlength: 100
  },

  // Link to original invoice for live updates
  invoiceRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PathologyInvoice',
    default: null
  },

  // Registration Mode (OPD/IPD)
  registrationMode: {
    type: String,
    enum: ['OPD', 'IPD'],
    default: 'OPD'
  },

  // Test Information (store linkage IDs so future updates reflect correctly)
  tests: [{
    name: String,
    category: String,
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestCategory', default: null },
    serviceHeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceHead', default: null },
    testDefinitionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestDefinition', default: null },
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
  
  // Sample Collection Information
  sampleCollection: {
    collectionDate: Date,
    collectionTime: String,
    sampleType: String,
    containerType: String,
    instructions: String,
    collectedBy: String
  },

  // NEW: Samples selected/collected (from Scheduled Tests)
  samplesCollected: [String],
  
  // Payment Information
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
    }
  },
  
  // Dates
  bookingDate: {
    type: Date,
    default: Date.now
  },

  registrationDate: {
    type: Date,
    default: Date.now
  },

  // Status
  status: {
    type: String,
    enum: ['REGISTERED', 'SAMPLE_COLLECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
    default: 'REGISTERED'
  },

  // Cash Receipt edit permission (only until report generation)
  cashEditAllowed: {
    type: Boolean,
    default: false
  },

  // Remarks
  remarks: {
    type: String,
    maxlength: 500
  }
}, {
  timestamps: true
});

// Pre-save hook to generate sequential numbers
pathologyRegistrationSchema.pre('save', async function(next) {
  if (this.isNew && !this.receiptNumber) {
    try {
      // Get current year and date (LOCAL, avoid UTC shift around midnight)
      const now = new Date();
      const currentYear = now.getFullYear();
      const todayString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; // LOCAL YYYY-MM-DD

      // Generate receipt number (yearly counter)
      const receiptCounterName = `pathology_receipt_${currentYear}`;
      const receiptCounter = await Counter.findOneAndUpdate(
        { name: receiptCounterName },
        { $inc: { value: 1 } },
        { new: true, upsert: true }
      );
      this.receiptNumber = receiptCounter.value;
      
      // Generate year number (yearly counter for pathology registrations)
      const yearCounterName = `pathology_year_${currentYear}`;
      const yearCounter = await Counter.findOneAndUpdate(
        { name: yearCounterName },
        { $inc: { value: 1 } },
        { new: true, upsert: true }
      );
      this.yearNumber = yearCounter.value;
      
      // Generate today number (daily counter for pathology registrations)
      const todayCounterName = `pathology_today_${todayString}`;
      const todayCounter = await Counter.findOneAndUpdate(
        { name: todayCounterName },
        { $inc: { value: 1 } },
        { new: true, upsert: true }
      );
      this.todayNumber = todayCounter.value;
      
      console.log(`📧 Generated receipt number: ${this.receiptNumber} for year ${currentYear}`);
      console.log(`📅 Generated year number: ${this.yearNumber} for year ${currentYear}`);
      console.log(`📆 Generated today number: ${this.todayNumber} for date ${todayString}`);
    } catch (error) {
      console.error('❌ Error generating numbers:', error);
      return next(error);
    }
  }
  next();
});

// Index for faster queries
pathologyRegistrationSchema.index({ receiptNumber: 1 }, { unique: true, sparse: true });
pathologyRegistrationSchema.index({ yearNumber: 1 });
pathologyRegistrationSchema.index({ todayNumber: 1 });
pathologyRegistrationSchema.index({ 'patient.registrationNumber': 1 });
pathologyRegistrationSchema.index({ bookingDate: 1 });
pathologyRegistrationSchema.index({ status: 1 });

module.exports = mongoose.model('PathologyRegistration', pathologyRegistrationSchema, 'pathologyregistration');
