const mongoose = require('mongoose');

const testParameterResultSchema = new mongoose.Schema({
  parameterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestParameter',
    required: true
  },
  parameterName: {
    type: String,
    required: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed, // Can be string or number
    required: true
  },
  unit: {
    type: String,
    required: true
  },
  normalRange: {
    type: String,
    required: true
  },
  isAbnormal: {
    type: Boolean,
    default: false
  },
  remarks: {
    type: String,
    trim: true
  }
}, { _id: false });

const testCategoryResultSchema = new mongoose.Schema({
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestCategory',
    required: true
  },
  categoryName: {
    type: String,
    required: true
  },
  parameters: [testParameterResultSchema]
}, { _id: false });

const patientTestEntrySchema = new mongoose.Schema({
  entryId: {
    type: String,
    unique: true,
    sparse: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  patientName: {
    type: String,
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: false
  },
  doctorName: {
    type: String,
    required: false
  },
  testDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  sampleCollectionDate: {
    type: Date,
    required: false
  },
  reportDate: {
    type: Date,
    required: false
  },
  tests: [testCategoryResultSchema],
  overallRemarks: {
    type: String,
    trim: true
  },
  reportStatus: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed', 'Verified'],
    default: 'Pending'
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: false
  },
  verifiedDate: {
    type: Date,
    required: false
  }
}, {
  timestamps: true
});

// Auto-generate entryId before saving
patientTestEntrySchema.pre('save', async function(next) {
  if (!this.entryId) {
    try {
      const Counter = require('./Counter');
      const counter = await Counter.findOneAndUpdate(
        { name: 'patientTestEntry' },
        { $inc: { sequence: 1 } },
        { new: true, upsert: true }
      );
      this.entryId = `PTE${String(counter.sequence).padStart(6, '0')}`;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Populate patient and doctor information when querying
patientTestEntrySchema.pre(['find', 'findOne', 'findOneAndUpdate'], function() {
  this.populate('patientId', 'firstName lastName patientId phone')
      .populate('doctorId', 'firstName lastName doctorId')
      .populate('verifiedBy', 'firstName lastName doctorId');
});

// Index for better performance
patientTestEntrySchema.index({ patientId: 1 });
patientTestEntrySchema.index({ doctorId: 1 });
patientTestEntrySchema.index({ testDate: 1 });
patientTestEntrySchema.index({ reportStatus: 1 });
patientTestEntrySchema.index({ entryId: 1 });

module.exports = mongoose.model('PatientTestEntry', patientTestEntrySchema);
