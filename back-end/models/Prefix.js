const mongoose = require('mongoose');

const prefixSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

prefixSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

prefixSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: Date.now() });
  next();
});

prefixSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('Prefix', prefixSchema);

