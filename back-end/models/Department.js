const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  departmentId: {
    type: String,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    trim: true,
    uppercase: true
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

// Auto-generate departmentId and update updatedAt field before saving
departmentSchema.pre('save', async function(next) {
  this.updatedAt = Date.now();

  // Generate departmentId only for new documents
  if (this.isNew && !this.departmentId) {
    try {
      // Find the highest existing departmentId
      const lastDepartment = await this.constructor.findOne(
        { departmentId: { $regex: /^DEP\d{5}$/ } },
        { departmentId: 1 }
      ).sort({ departmentId: -1 });

      let nextNumber = 1;
      if (lastDepartment && lastDepartment.departmentId) {
        // Extract number from DEP00001 format
        const lastNumber = parseInt(lastDepartment.departmentId.substring(3));
        nextNumber = lastNumber + 1;
      }

      // Generate new departmentId with DEP prefix and 5-digit number
      this.departmentId = `DEP${nextNumber.toString().padStart(5, '0')}`;
    } catch (error) {
      return next(error);
    }
  }

  next();
});

// Create indexes for better performance
// Note: departmentId already has unique index from field definition
departmentSchema.index({ name: 1 });
departmentSchema.index({ code: 1 });
departmentSchema.index({ isActive: 1 });

module.exports = mongoose.model('Department', departmentSchema);
