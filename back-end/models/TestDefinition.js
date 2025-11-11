const mongoose = require('mongoose');

// Normal Value Schema
const normalValueSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Numeric range', 'Text'],
    required: true
  },
  gender: {
    type: String,
    enum: ['Any', 'Male', 'Female'],
    default: 'Any'
  },
  minAge: {
    type: String, // Changed to String to store "14 Years" format
    trim: true
  },
  maxAge: {
    type: String, // Changed to String to store "100 Years" format
    trim: true
  },
  lowerValue: {
    type: String
  },
  upperValue: {
    type: String
  },
  textValue: {
    type: String
  },
  displayInReport: {
    type: String
  },
  remark: {
    type: String,
    trim: true,
    default: ''
  }
}, { _id: true });

const testParameterDefinitionSchema = new mongoose.Schema({
  order: {
    type: Number,
    required: true,
    min: 1
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  unit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Unit'
  },
  inputType: {
    type: String,
    enum: ['Numeric', 'Single Line', 'Paragraph'],
    default: 'Numeric'
  },
  defaultResult: {
    type: String,
    trim: true
  },
  formula: {
    type: String,
    trim: true,
    default: ''
  },

  resultType: {
    type: String,
    enum: ['manual', 'dropdown', 'fixed', 'formula'],
    default: 'manual'
  },
  dropdownOptions: {
    type: String,
    trim: true,
    default: ''
  },
  isOptional: {
    type: Boolean,
    default: false
  },
  removed: {
    type: Boolean,
    default: false
  },
  groupBy: {
    type: String,
    trim: true
  },
  normalValues: [normalValueSchema]
});

const testDefinitionSchema = new mongoose.Schema({
  testId: {
    type: String,
    unique: true,
    sparse: true,
    required: false  // Made optional as per user requirement
  },
  name: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
    // Removed unique constraint to allow duplicate names
  },
  shortName: {
     type: mongoose.Schema.Types.ObjectId,
       ref: 'ServiceHead',
       required: true
  },
  category: {
     type: mongoose.Schema.Types.ObjectId,
       ref: 'TestCategory',
       required: true
  },
  testType: {
    type: String,
    enum: ['single', 'multiple', 'nested', 'document', 'panel'],
    default: 'single'
  },
  // Required for all test types - can be one or many sample types (Unit, kind: 'SAMPLE')
  sampleType: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Unit'
  }],
  // Only for single parameter tests
  unit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Unit'
  },
  inputType: {
    type: String,
    enum: ['Numeric', 'Single Line', 'Paragraph']
  },
  // Single parameter default-result system at root level (optional; set only for 'single')
  resultType: {
    type: String,
    enum: ['manual', 'dropdown', 'fixed', 'formula']
  },
  dropdownOptions: {
    type: String,
    trim: true
  },
  defaultResult: {
    type: String,
    trim: true
  },
  formula: {
    type: String,
    trim: true
  },

  isOptional: {
    type: Boolean
  },
  // Only for single parameter tests - normalValues at root level
  normalValues: {
    type: [normalValueSchema]
  },
  // Only for multiple and nested parameter tests
  parameters: {
    type: [testParameterDefinitionSchema],
    validate: {
      validator: function(parameters) {
        if (this.testType === 'multiple' || this.testType === 'nested') {
          return parameters && parameters.length > 0;
        }
        return true;
      },
      message: 'Parameters are required for multiple and nested test types'
    }
  },
  method: {
    type: String,
    trim: true
  },
  instrument: {
    type: String,
    trim: true
  },
  // For Test Panels: list of included tests
  tests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestDefinition'
  }]
}, {
  timestamps: true
});

// Removed auto-generation of testId as per user requirement

// Index for better performance
testDefinitionSchema.index({ category: 1 });
testDefinitionSchema.index({ testType: 1 });

module.exports = mongoose.model('TestDefinition', testDefinitionSchema);
