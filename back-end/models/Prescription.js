const mongoose = require('mongoose');

const prescriptionSchema = new mongoose.Schema({
  prescriptionId: {
    type: String,
    required: true,
    unique: true
  },
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  appointment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    required: true
  },
  medicines: [{
    medicineName: {
      type: String,
      required: true,
      trim: true
    },
    genericName: {
      type: String,
      trim: true
    },
    dosage: {
      type: String,
      required: true
    },
    frequency: {
      type: String,
      required: true,
      enum: ['Once daily', 'Twice daily', 'Three times daily', 'Four times daily', 'As needed', 'Every 4 hours', 'Every 6 hours', 'Every 8 hours', 'Every 12 hours', 'Weekly', 'Monthly']
    },
    duration: {
      type: String,
      required: true
    },
    instructions: {
      type: String,
      required: true
    },
    beforeAfterMeal: {
      type: String,
      enum: ['Before meal', 'After meal', 'With meal', 'Empty stomach', 'Anytime'],
      default: 'After meal'
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    refills: {
      type: Number,
      default: 0,
      min: 0
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  diagnosis: {
    primary: {
      type: String,
      required: true
    },
    secondary: [String],
    icdCodes: [String]
  },
  symptoms: [String],
  vitalSigns: {
    bloodPressure: String,
    heartRate: String,
    temperature: String,
    weight: String,
    height: String,
    bmi: String,
    oxygenSaturation: String
  },
  allergies: [String],
  medicalHistory: [String],
  labTests: [{
    testName: String,
    instructions: String,
    urgent: {
      type: Boolean,
      default: false
    }
  }],
  followUpInstructions: {
    type: String
  },
  followUpDate: {
    type: Date
  },
  emergencyInstructions: {
    type: String
  },
  status: {
    type: String,
    enum: ['Active', 'Completed', 'Cancelled', 'Expired'],
    default: 'Active'
  },
  prescribedDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  validUntil: {
    type: Date,
    required: true
  },
  digitalSignature: {
    type: String
  },
  notes: {
    type: String
  }
}, {
  timestamps: true
});

// Generate prescription ID automatically
prescriptionSchema.pre('save', async function(next) {
  if (!this.prescriptionId) {
    const count = await mongoose.model('Prescription').countDocuments();
    this.prescriptionId = `PRX${String(count + 1).padStart(6, '0')}`;
  }
  
  // Set valid until date (default 30 days from prescribed date)
  if (!this.validUntil) {
    this.validUntil = new Date(this.prescribedDate.getTime() + (30 * 24 * 60 * 60 * 1000));
  }
  
  next();
});

// Index for efficient queries
prescriptionSchema.index({ patient: 1, prescribedDate: -1 });
prescriptionSchema.index({ doctor: 1, prescribedDate: -1 });
prescriptionSchema.index({ status: 1 });
prescriptionSchema.index({ validUntil: 1 });

module.exports = mongoose.model('Prescription', prescriptionSchema);
