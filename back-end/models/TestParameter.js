const mongoose = require('mongoose');

const normalRangeSchema = new mongoose.Schema({
  min: {
    type: Number,
    required: false
  },
  max: {
    type: Number,
    required: false
  },
  textValue: {
    type: String,
    trim: true,
    required: false
  }
}, { _id: false });

const testParameterSchema = new mongoose.Schema({
  parameterId: {
    type: String,
    unique: true,
    sparse: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestCategory',
    required: true
  },
  unit: {
    type: String,
    required: true,
    trim: true
  },
  normalRanges: {
    male: normalRangeSchema,
    female: normalRangeSchema,
    child: normalRangeSchema
  },
  testMethod: {
    type: String,
    trim: true
  },
  sampleType: {
    type: String,
    required: true,
    enum: ['Blood', 'Urine', 'Stool', 'Serum', 'Plasma', 'CSF', 'Sputum', 'Saliva', 'Tissue', 'Other'],
    default: 'Blood'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Auto-generate parameterId before saving using CounterService
testParameterSchema.pre('save', async function(next) {
  if (!this.parameterId) {
    try {
      const CounterService = require('../services/counter-service');
      const result = await CounterService.getNextValue('testParameter', 'PARAM', 5);
      this.parameterId = result.formattedId;
      console.log(`✅ Generated parameter ID: ${this.parameterId} (Counter: ${result.value})`);
    } catch (error) {
      console.error('❌ Error generating parameter ID:', error);
      return next(error);
    }
  }
  next();
});

// Populate category information when querying
testParameterSchema.pre(['find', 'findOne', 'findOneAndUpdate'], function() {
  this.populate('categoryId', 'name description');
});

// Index for better performance
testParameterSchema.index({ name: 1 });
testParameterSchema.index({ categoryId: 1 });
testParameterSchema.index({ isActive: 1 });
testParameterSchema.index({ sampleType: 1 });

module.exports = mongoose.model('TestParameter', testParameterSchema);
