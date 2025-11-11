const mongoose = require('mongoose');

// Payment Schema
const paymentSchema = new mongoose.Schema({
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  paidAmount: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  dueAmount: {
    type: Number,
    required: true,
    min: 0
  },
  paymentStatus: {
    type: String,
    enum: ['Paid', 'Partial Paid', 'Due'],
    default: 'Due'
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque'],
    default: 'Cash'
  },
  transactionId: {
    type: String,
    default: ''
  },
  paymentDate: {
    type: Date,
    default: Date.now
  },
  paymentHistory: [{
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    method: {
      type: String,
      enum: ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque'],
      default: 'Cash'
    },
    transactionId: String,
    paidAt: {
      type: Date,
      default: Date.now
    },
    receivedBy: String
  }]
});

// Booked Test Schema
const bookedTestSchema = new mongoose.Schema({
  testId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ServiceHead',
    required: true
  },
  testName: {
    type: String,
    required: true
  },
  testCategory: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  quantity: {
    type: Number,
    default: 1,
    min: 1
  },
  discount: {
    type: Number,
    default: 0,
    min: 0
  },
  netAmount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['Pending', 'Sample Collected', 'In Progress', 'Completed', 'Reported'],
    default: 'Pending'
  },
  collectionDate: {
    type: Date,
    default: Date.now
  },
  reportDate: Date,
  technician: String,
  pathologist: String,
  remarks: String
});

// Main Pathology Booking Schema
const pathologyBookingSchema = new mongoose.Schema({
  bookingId: {
    type: String,
    unique: true
  },
  invoiceNumber: {
    type: String,
    unique: true
  },
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor'
  },
  prescribedBy: {
    name: String,
    designation: String,
    registrationNumber: String
  },
  bookedTests: [bookedTestSchema],
  payment: paymentSchema,
  bookingDate: {
    type: Date,
    default: Date.now
  },
  collectionDate: {
    type: Date,
    default: Date.now
  },
  expectedReportDate: {
    type: Date
  },
  priority: {
    type: String,
    enum: ['Normal', 'Urgent', 'Emergency'],
    default: 'Normal'
  },
  mode: {
    type: String,
    enum: ['OPD', 'IPD', 'Emergency', 'Home Collection'],
    default: 'OPD'
  },
  clinicalHistory: {
    type: String,
    default: ''
  },
  specialInstructions: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['Booked', 'Sample Collected', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Booked'
  },
  labInfo: {
    name: {
      type: String,
      default: 'राजकीय आयुर्वेद महाविद्यालय एवं चिकित्सालय'
    },
    address: {
      type: String,
      default: 'चौकाघाट, वाराणसी'
    },
    phone: {
      type: String,
      default: '+91-542-2307001'
    },
    email: {
      type: String,
      default: 'info@ayurvedcollege.com'
    },
    license: {
      type: String,
      default: 'LAB/2024/001'
    }
  },
  createdBy: {
    type: String,
    default: 'System'
  },
  updatedBy: {
    type: String,
    default: 'System'
  }
}, {
  timestamps: true
});

// Generate booking ID and invoice number automatically using CounterService
pathologyBookingSchema.pre('save', async function(next) {
  try {
    // BookingId auto-generation disabled as per requirement.
    // If bookingId is provided externally, keep it; otherwise leave undefined.

    if (!this.invoiceNumber) {
      console.log('🔢 Generating invoice number...');
      
      const Counter = mongoose.model('Counter');
      let counter = await Counter.findOneAndUpdate(
        { name: 'pathologyInvoiceNumber' },
        { $inc: { value: 1 } },
        { new: true, upsert: true }
      );
      
      const today = new Date();
      const year = today.getFullYear().toString().slice(-2);
      const month = String(today.getMonth() + 1).padStart(2, '0');
      
      this.invoiceNumber = `INV${year}${month}${String(counter.value).padStart(4, '0')}`;
      console.log('✅ Generated invoice number:', this.invoiceNumber);
    }

    // Calculate due amount
    if (this.payment) {
      this.payment.dueAmount = this.payment.totalAmount - this.payment.paidAmount;
      
      // Update payment status based on amounts
      if (this.payment.paidAmount === 0) {
        this.payment.paymentStatus = 'Due';
      } else if (this.payment.paidAmount >= this.payment.totalAmount) {
        this.payment.paymentStatus = 'Paid';
      } else {
        this.payment.paymentStatus = 'Partial Paid';
      }
    }

    next();
  } catch (error) {
    console.error('❌ Error in pathology booking pre-save:', error);
    next(error);
  }
});

// Calculate expected report date based on test types
pathologyBookingSchema.methods.calculateExpectedReportDate = function() {
  const collectionDate = this.collectionDate || new Date();
  const reportDate = new Date(collectionDate);
  
  // Add 1-3 days based on test complexity (simplified logic)
  const hasComplexTests = this.bookedTests.some(test => 
    test.testCategory === 'PATHOLOGY' && test.testName.toLowerCase().includes('culture')
  );
  
  if (hasComplexTests) {
    reportDate.setDate(reportDate.getDate() + 3); // 3 days for complex tests
  } else {
    reportDate.setDate(reportDate.getDate() + 1); // 1 day for routine tests
  }
  
  this.expectedReportDate = reportDate;
  return reportDate;
};

module.exports = mongoose.model('PathologyBooking', pathologyBookingSchema);
