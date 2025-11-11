const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['Equipment', 'Reagent'], required: true },
  category: { type: String, default: '' },
  unit: { type: String, default: '' }, // e.g., ml, pcs, kits
  minStock: { type: Number, default: 0 },
  description: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true
});

// Indexes for fast search
inventoryItemSchema.index({ name: 1 }, { unique: false });
inventoryItemSchema.index({ type: 1 });
inventoryItemSchema.index({ isActive: 1 });

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);

