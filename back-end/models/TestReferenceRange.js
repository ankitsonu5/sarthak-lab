const mongoose = require('mongoose');

const testReferenceRangeSchema = new mongoose.Schema({
  rangeId: {
    type: String,
    unique: true,
    sparse: true
  },
  testParameterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestParameter',
    required: true
  },
  testParameterName: {
    type: String,
    required: true
  },
  rangeType: {
    type: String,
    enum: ['Numeric range', 'Text value', 'Positive/Negative', 'Present/Absent'],
    default: 'Numeric range'
  },
  gender: {
    type: String,
    enum: ['Any', 'Male', 'Female'],
    default: 'Any'
  },
  minAge: {
    type: Number,
    required: true,
    min: 0
  },
  maxAge: {
    type: Number,
    required: true,
    min: 0
  },
  ageUnit: {
    type: String,
    enum: ['Years', 'Months', 'Days'],
    default: 'Years'
  },
  // For numeric ranges
  lowerValue: {
    type: Number,
    required: function() {
      return this.rangeType === 'Numeric range';
    }
  },
  upperValue: {
    type: Number,
    required: function() {
      return this.rangeType === 'Numeric range';
    }
  },
  // For text values
  textValue: {
    type: String,
    required: function() {
      return this.rangeType !== 'Numeric range';
    }
  },
  // How it should be displayed in report
  displayText: {
    type: String,
    required: true
  },
  unit: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Additional metadata
  notes: {
    type: String,
    trim: true
  },
  priority: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  }
}, {
  timestamps: true
});

// Auto-generate rangeId before saving
testReferenceRangeSchema.pre('save', async function(next) {
  if (!this.rangeId) {
    try {
      const Counter = require('./Counter');
      const counter = await Counter.findOneAndUpdate(
        { name: 'testReferenceRange' },
        { $inc: { sequence: 1 } },
        { new: true, upsert: true }
      );
      this.rangeId = `REF${String(counter.sequence).padStart(6, '0')}`;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Auto-generate display text if not provided
testReferenceRangeSchema.pre('save', function(next) {
  if (!this.displayText) {
    if (this.rangeType === 'Numeric range') {
      this.displayText = `${this.lowerValue} - ${this.upperValue}`;
    } else {
      this.displayText = this.textValue;
    }
  }
  next();
});

// Populate test parameter information when querying
testReferenceRangeSchema.pre(['find', 'findOne', 'findOneAndUpdate'], function() {
  this.populate('testParameterId', 'name unit categoryId');
});

// Index for better performance
testReferenceRangeSchema.index({ testParameterId: 1 });
testReferenceRangeSchema.index({ gender: 1 });
testReferenceRangeSchema.index({ minAge: 1, maxAge: 1 });
testReferenceRangeSchema.index({ ageUnit: 1 });
testReferenceRangeSchema.index({ isActive: 1 });
testReferenceRangeSchema.index({ priority: 1 });

// Compound index for efficient range queries
testReferenceRangeSchema.index({ 
  testParameterId: 1, 
  gender: 1, 
  minAge: 1, 
  maxAge: 1, 
  ageUnit: 1 
});

// Static method to find appropriate range for a patient
testReferenceRangeSchema.statics.findRangeForPatient = function(testParameterId, patientAge, patientGender, ageUnit = 'Years') {
  return this.findOne({
    testParameterId: testParameterId,
    $or: [
      { gender: 'Any' },
      { gender: patientGender }
    ],
    minAge: { $lte: patientAge },
    maxAge: { $gte: patientAge },
    ageUnit: ageUnit,
    isActive: true
  }).sort({ 
    gender: patientGender === 'Any' ? 1 : -1, // Prefer specific gender over 'Any'
    priority: -1 // Higher priority first
  });
};

// Instance method to check if a value is normal
testReferenceRangeSchema.methods.isValueNormal = function(value) {
  if (this.rangeType === 'Numeric range') {
    const numValue = parseFloat(value);
    return numValue >= this.lowerValue && numValue <= this.upperValue;
  } else {
    return this.textValue === value;
  }
};

// Instance method to get status of a value
testReferenceRangeSchema.methods.getValueStatus = function(value) {
  if (this.rangeType === 'Numeric range') {
    const numValue = parseFloat(value);
    if (numValue < this.lowerValue) return 'Low';
    if (numValue > this.upperValue) return 'High';
    return 'Normal';
  } else {
    return this.textValue === value ? 'Normal' : 'Abnormal';
  }
};

module.exports = mongoose.model('TestReferenceRange', testReferenceRangeSchema);
