const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  roomNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },
  // REMOVED: isActive field as requested
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
roomSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Generate room ID with RN- prefix
roomSchema.pre('save', function(next) {
  if (!this.roomNumber.startsWith('RN-')) {
    this.roomNumber = 'RN-' + this.roomNumber;
  }
  next();
});

module.exports = mongoose.model('Room', roomSchema);
