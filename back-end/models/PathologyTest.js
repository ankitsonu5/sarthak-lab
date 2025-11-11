const mongoose = require('mongoose');

// Test Parameter Schema
const testParameterSchema = new mongoose.Schema({
  parameterName: {
    type: String,
    required: true
  },
  normalRange: {
    type: String,
    required: true
  },
  unit: {
    type: String,
    default: ''
  },
  isRequired: {
    type: Boolean,
    default: false
  },
  value: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['Normal', 'Abnormal', 'Critical'],
    default: 'Normal'
  }
});

// Test Result Schema
const testResultSchema = new mongoose.Schema({
  parameterName: {
    type: String,
    required: true
  },
  value: {
    type: String,
    required: true
  },
  unit: {
    type: String,
    default: ''
  },
  normalRange: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['Normal', 'Abnormal', 'Critical'],
    default: 'Normal'
  },
  flag: {
    type: String,
    default: ''
  }
});

// Selected Test Info Schema
const selectedTestSchema = new mongoose.Schema({
  testName: {
    type: String,
    required: true
  },
  testType: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    default: ''
  },
  parameters: [testParameterSchema]
});

// Main Pathology Test Schema
const pathologyTestSchema = new mongoose.Schema({
  testId: {
    type: String,
    required: false, // Will be auto-generated
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
  testCategory: {
    type: String,
    required: true,
    enum: [
      'PATHOLOGY',
      'X-RAY',
      'ECG',
      'SHALAKYA',
      'SHALYA',
      'PANCHKARMA',
      'IPD',
      'PRASUTI',
      'PRIVATE WARD',
      'AMBULANCE'
    ]
  },
  testType: {
    type: String,
    required: true
  },
  selectedTests: [selectedTestSchema],
  testNames: {
    type: String,
    required: true
  },
  collectionDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  reportDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['Pending', 'Sample Collected', 'In Progress', 'Completed', 'Reported'],
    default: 'Pending'
  },
  mode: {
    type: String,
    enum: ['OPD', 'IPD', 'Emergency'],
    default: 'OPD'
  },
  clinicalHistory: {
    type: String,
    default: ''
  },
  testParameters: [testParameterSchema],
  results: [testResultSchema],
  interpretation: {
    type: String,
    default: ''
  },
  recommendations: {
    type: String,
    default: ''
  },
  technician: {
    type: String,
    default: ''
  },
  pathologist: {
    type: String,
    default: ''
  },
  remarks: {
    type: String,
    default: ''
  },
  cost: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  totalCost: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  isPaid: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Generate test ID automatically using CounterService
pathologyTestSchema.pre('save', async function(next) {
  try {
    // testId auto-generation disabled as per requirement.
    // If testId is provided externally, keep it; otherwise leave undefined.
    next();
  } catch (error) {
    console.error('❌ Error in pathology test pre-save:', error);
    next(error);
  }
});

module.exports = mongoose.model('PathologyTest', pathologyTestSchema);
