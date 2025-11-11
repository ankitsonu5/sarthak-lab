const mongoose = require('mongoose');

const doctorRoomDirectorySchema = new mongoose.Schema({
  directoryId: {
    type: String,
    unique: true,
    sparse: true
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },

  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },

  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },

}, {
  timestamps: true
});

// Index for better search performance
doctorRoomDirectorySchema.index({ doctor: 1 });
doctorRoomDirectorySchema.index({ department: 1 });
doctorRoomDirectorySchema.index({ room: 1 });


// Compound index for unique doctor-room combination
doctorRoomDirectorySchema.index({ doctor: 1, room: 1 }, { unique: true });

// Pre-save middleware to generate directoryId (names are read via populate, not stored)
doctorRoomDirectorySchema.pre('save', async function(next) {
  if (!this.directoryId) {
    try {
      const count = await mongoose.model('DoctorRoomDirectory').countDocuments();
      this.directoryId = `DIR${String(count + 1).padStart(5, '0')}`;
    } catch (error) {
      this.directoryId = `DIR${Date.now().toString().slice(-5)}`;
    }
  }
  next();
});

// Safety: strip any legacy denormalized fields so only IDs are stored
const stripExtraFields = (update) => {
  if (!update) return;
  // Remove from $set or root if provided
  if (update.$set) {
    delete update.$set.doctorName;
    delete update.$set.departmentName;
    delete update.$set.roomNumber;
  } else {
    delete update.doctorName;
    delete update.departmentName;
    delete update.roomNumber;
  }
  // Ensure they are explicitly unset on update operations
  update.$unset = Object.assign({}, update.$unset, {
    doctorName: 1,
    departmentName: 1,
    roomNumber: 1
  });
};

// Ensure extra fields are not persisted on create/save
doctorRoomDirectorySchema.pre('save', function(next) {
  // In case any payload attached these fields
  // eslint-disable-next-line @typescript-eslint/no-this-alias
  delete this.doctorName;
  delete this.departmentName;
  delete this.roomNumber;
  next();
});

// Ensure extra fields are removed on update paths
doctorRoomDirectorySchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate() || {};
  stripExtraFields(update);
  this.setUpdate(update);
  next();
});

doctorRoomDirectorySchema.pre('updateOne', function(next) {
  const update = this.getUpdate() || {};
  stripExtraFields(update);
  this.setUpdate(update);
  next();
});

doctorRoomDirectorySchema.pre('updateMany', function(next) {
  const update = this.getUpdate() || {};
  stripExtraFields(update);
  this.setUpdate(update);
  next();
});


// Virtual for formatted display (relies on populated refs)
doctorRoomDirectorySchema.virtual('displayName').get(function() {
  const docName = this.doctor?.name || 'Unknown';
  const deptName = this.department?.name || 'Unknown';
  const roomNo = this.room?.roomNumber || 'Unknown';
  return `Dr. ${docName} - ${deptName} - Room ${roomNo}`;
});

// Static method to find by doctor
doctorRoomDirectorySchema.statics.findByDoctor = function(doctorId) {
  return this.find({ doctor: doctorId })
    .populate('doctor', 'name')
    .populate('department', 'name code')
    .populate('room', 'roomNumber');
};

// Static method to find by department
doctorRoomDirectorySchema.statics.findByDepartment = function(departmentId) {
  return this.find({ department: departmentId })
    .populate('doctor', 'name')
    .populate('department', 'name code')
    .populate('room', 'roomNumber');
};

// Static method to find by room
doctorRoomDirectorySchema.statics.findByRoom = function(roomId) {
  return this.find({ room: roomId })
    .populate('doctor', 'name')
    .populate('department', 'name code')
    .populate('room', 'roomNumber');
};

// Static method to search directories using populated fields
// Note: Mongoose can't query on populated paths directly with regex.
// For complex search across names, use aggregation or do it at API level after populate.

// Method to check if doctor-room combination exists
doctorRoomDirectorySchema.statics.checkDuplicateAssignment = function(doctorId, roomId, excludeId = null) {
  let query = { doctor: doctorId, room: roomId };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  return this.findOne(query);
};

// Ensure virtual fields are serialized
doctorRoomDirectorySchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

const DoctorRoomDirectory = mongoose.model('DoctorRoomDirectory', doctorRoomDirectorySchema);

module.exports = DoctorRoomDirectory;
