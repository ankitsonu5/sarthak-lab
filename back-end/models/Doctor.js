const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  doctorId: {
    type: String,
    unique: true,
    sparse: true
  },
  // Basic Information (Always required)
  name: {
    type: String,
    required: true,
   
  },
  fee: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  // Additional Information (Optional)

  email: {
    type: String,
    sparse: true,
    lowercase: true,
    default: null
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    sparse: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^[0-9]{10}$/.test(v);
      },
      message: 'Phone number must be 10 digits'
    }
  },
  dateOfBirth: {
    type: Date,
      default: null
  },
  age: {
    type: Number,
     default: null
  },
  gender: {
    type: String,
    required: true,
    enum: ['Male', 'Female', 'Other']
  },
  specialization: {
    type: String,
      default: null
  },
  qualification: {
    type: String,
     default: null
  },
  experience: {
    type: Number,
     default: null
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },
  licenseNumber: {
    type: String,
    sparse: true,
    default: null
  },
  address: {
    street: {
      type: String,
      default: null
    },
    city: {
      type: String,
      default: null
    },
    state: {
      type: String,
      default: null
    },
    zipCode: {
      type: String,
      default: null
    },
    country: {
      type: String,
      default: 'India'
    }
  },
  availableSlots: [{
    day: {
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      required: true
    },
    startTime: {
      type: String,
      required: true
    },
    endTime: {
      type: String,
      required: true
    }
  }],
  imageUrl: {
    type: String, // URL for accessing the image
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  registrationDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Auto-generate doctor ID before saving - Sequential ID without year-wise counter
doctorSchema.pre('save', async function(next) {
  // Generate doctorId only for new documents
  if (this.isNew && !this.doctorId) {
    try {
      // Find the highest existing doctorId (no year-wise counter for setup/master data)
      const lastDoctor = await this.constructor.findOne(
        { doctorId: { $regex: /^DOC\d{6}$/ } },
        { doctorId: 1 }
      ).sort({ doctorId: -1 });

      let nextNumber = 1;
      if (lastDoctor && lastDoctor.doctorId) {
        // Extract number from DOC000001 format
        const lastNumber = parseInt(lastDoctor.doctorId.substring(3));
        nextNumber = lastNumber + 1;
      }

      // Generate new doctorId with DOC prefix and 6-digit number
      this.doctorId = `DOC${nextNumber.toString().padStart(6, '0')}`;
      console.log(`✅ Generated doctor ID: ${this.doctorId}`);
    } catch (error) {
      console.error('Error generating doctorId:', error);
      return next(error);
    }
  }
  next();
});

// Virtual for full name - use name field if firstName/lastName not available
// doctorSchema.virtual('fullName').get(function() {
//   if (this.firstName && this.lastName) {
//     return `${this.firstName} ${this.lastName}`;
//   } else if (this.name) {
//     return this.name;
//   } else {
//     return 'Unknown';
//   }
// });

// Method to get doctor's available slots for a specific day
doctorSchema.methods.getAvailableSlotsForDay = function(day) {
  return this.availableSlots.filter(slot => slot.day === day);
};

// Method to check if doctor is available on a specific day and time
doctorSchema.methods.isAvailable = function(day, time) {
  const daySlots = this.getAvailableSlotsForDay(day);
  return daySlots.some(slot => {
    const startTime = new Date(`1970-01-01T${slot.startTime}`);
    const endTime = new Date(`1970-01-01T${slot.endTime}`);
    const checkTime = new Date(`1970-01-01T${time}`);
    return checkTime >= startTime && checkTime <= endTime;
  });
};

// Static method to find doctors by department
doctorSchema.statics.findByDepartment = function(departmentId) {
  return this.find({ department: departmentId, isActive: true }).populate('department');
};

// Static method to find doctors by specialization
doctorSchema.statics.findBySpecialization = function(specialization) {
  return this.find({ 
    specialization: new RegExp(specialization, 'i'), 
    isActive: true 
  }).populate('department');
};

// Ensure virtual fields are serialized
doctorSchema.set('toJSON', { virtuals: true });
doctorSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Doctor', doctorSchema);
