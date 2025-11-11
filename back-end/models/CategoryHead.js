const mongoose = require('mongoose');

const categoryHeadSchema = new mongoose.Schema({
  categoryId: {
    type: String,
    unique: true,
    sparse: true
  },
  categoryName: {
    type: String,
    required: true,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Auto-generate categoryId before saving - Sequential ID without year-wise counter
categoryHeadSchema.pre('save', async function(next) {
  // Generate categoryId only for new documents
  if (this.isNew && !this.categoryId) {
    try {
      // Find the highest existing categoryId (no year-wise counter for setup/master data)
      const lastCategory = await this.constructor.findOne(
        { categoryId: { $regex: /^CAT\d{5}$/ } },
        { categoryId: 1 }
      ).sort({ categoryId: -1 });

      let nextNumber = 1;
      if (lastCategory && lastCategory.categoryId) {
        // Extract number from CAT00001 format
        const lastNumber = parseInt(lastCategory.categoryId.substring(3));
        nextNumber = lastNumber + 1;
      }

      // Generate new categoryId with CAT prefix and 5-digit number
      this.categoryId = `CAT${nextNumber.toString().padStart(5, '0')}`;
      console.log(`✅ Generated category ID: ${this.categoryId}`);
    } catch (error) {
      console.error('Error generating categoryId:', error);
      return next(error);
    }
  }
  next();
});

// Update updatedAt on save
categoryHeadSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method to find all categories
categoryHeadSchema.statics.findAll = function() {
  return this.find({}).sort({ createdAt: -1 });
};

module.exports = mongoose.model('CategoryHead', categoryHeadSchema);
