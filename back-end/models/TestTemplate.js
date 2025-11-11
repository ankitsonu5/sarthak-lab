const mongoose = require('mongoose');

const testTemplateSchema = new mongoose.Schema({
  templateId: {
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
  category: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  headerText: {
    type: String,
    trim: true
  },
  footerText: {
    type: String,
    trim: true
  },
  reportFormat: {
    type: String,
    enum: ['standard', 'tabular', 'narrative'],
    default: 'standard'
  },
  includeReferenceRanges: {
    type: Boolean,
    default: true
  },
  includeInterpretation: {
    type: Boolean,
    default: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Auto-generate templateId before saving using CounterService
testTemplateSchema.pre('save', async function(next) {
  if (!this.templateId) {
    try {
      const CounterService = require('../services/counter-service');
      const result = await CounterService.getNextValue('testTemplate', 'TPL', 3);
      this.templateId = result.formattedId;
      console.log(`✅ Generated template ID: ${this.templateId} (Counter: ${result.value})`);
    } catch (error) {
      console.error('❌ Error generating template ID:', error);
      return next(error);
    }
  }
  next();
});

// Index for better performance
testTemplateSchema.index({ name: 1 });
testTemplateSchema.index({ category: 1 });
testTemplateSchema.index({ isActive: 1 });

module.exports = mongoose.model('TestTemplate', testTemplateSchema);
