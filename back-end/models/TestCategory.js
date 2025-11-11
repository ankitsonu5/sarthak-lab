const mongoose = require('mongoose');

const testCategorySchema = new mongoose.Schema({
  categoryId: {
    type: String,
    unique: true,
    sparse: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  }
}, {
  timestamps: true
});

// Auto-generate categoryId before saving (no Counter usage)
testCategorySchema.pre('save', async function(next) {
  // Only for new docs without categoryId
  if (this.isNew && !this.categoryId) {
    try {
      // Find highest existing CAT00001-style id and increment
      const last = await this.constructor
        .findOne({ categoryId: { $regex: /^CAT\d{5}$/ } }, { categoryId: 1 })
        .sort({ categoryId: -1 });

      let nextNumber = 1;
      if (last && last.categoryId) {
        const lastNumber = parseInt(String(last.categoryId).substring(3));
        if (!isNaN(lastNumber)) nextNumber = lastNumber + 1;
      }

      this.categoryId = `CAT${nextNumber.toString().padStart(5, '0')}`;
      console.log(`✅ Generated test category ID (no counter): ${this.categoryId}`);
    } catch (error) {
      console.error('❌ Error generating categoryId (no counter):', error);
      return next(error);
    }
  }
  next();
});

// Index for better performance
testCategorySchema.index({ name: 1 });

module.exports = mongoose.model('TestCategory', testCategorySchema);
