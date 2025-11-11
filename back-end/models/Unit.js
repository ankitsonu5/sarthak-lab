const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  // Distinguish measurement units vs sample types living in the same collection
  // Values: 'UNIT' (default) | 'SAMPLE'
  kind: {
    type: String,
    enum: ['UNIT', 'SAMPLE'],
    default: 'UNIT'
  },

}, {
  timestamps: true
});

module.exports = mongoose.model('Unit', unitSchema);

