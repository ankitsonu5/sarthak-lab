const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reportId: {
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
  reportType: {
    type: String,
    enum: ['Lab Test', 'X-Ray', 'MRI', 'CT Scan', 'Blood Test', 'Urine Test', 'ECG', 'Ultrasound', 'Other'],
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  findings: {
    type: String,
    required: true
  },
  recommendations: {
    type: String
  },
  testResults: [{
    testName: {
      type: String,
      required: true
    },
    result: {
      type: String,
      required: true
    },
    normalRange: {
      type: String
    },
    unit: {
      type: String
    },
    status: {
      type: String,
      enum: ['Normal', 'Abnormal', 'Critical'],
      default: 'Normal'
    }
  }],
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileType: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed', 'Reviewed'],
    default: 'Pending'
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Medium'
  },
  reportDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor'
  },
  reviewedAt: {
    type: Date
  },
  isConfidential: {
    type: Boolean,
    default: false
  },
  notes: {
    type: String
  }
}, {
  timestamps: true
});

// Generate report ID automatically
reportSchema.pre('save', async function(next) {
  if (!this.reportId) {
    const count = await mongoose.model('Report').countDocuments();
    this.reportId = `RPT${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

// Index for efficient queries
reportSchema.index({ patient: 1, reportDate: -1 });
reportSchema.index({ doctor: 1, reportDate: -1 });
reportSchema.index({ status: 1 });
reportSchema.index({ reportType: 1 });

module.exports = mongoose.model('Report', reportSchema);
