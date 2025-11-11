const mongoose = require('mongoose');

const serviceHeadSchema = new mongoose.Schema({
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CategoryHead',
    required: true
  },
  testName: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: String,
    required: true,
    min: 0
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

// Create compound index for category and testName to prevent duplicates
serviceHeadSchema.index({ category: 1, testName: 1 }, { unique: true });

// Add text index for search functionality
serviceHeadSchema.index({ testName: 'text', description: 'text' });

// Pre-save middleware to update the updatedAt field
serviceHeadSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Instance method to format price
serviceHeadSchema.methods.getFormattedPrice = function() {
  return `₹${this.price}`;
};

// Static method to get tests by category
serviceHeadSchema.statics.getByCategory = function(categoryId) {
  return this.find({
    category: categoryId
  }).populate('category', 'categoryName categoryId').sort({ testName: 1 });
};

// Static method to search tests
serviceHeadSchema.statics.searchTests = function(categoryId, searchTerm) {
  const query = {
    category: categoryId
  };

  if (searchTerm) {
    query.$text = { $search: searchTerm };
  }

  return this.find(query).populate('category', 'categoryName categoryId').sort({ testName: 1 });
};

const ServiceHead = mongoose.model('ServiceHead', serviceHeadSchema);

module.exports = ServiceHead;
