const mongoose = require('mongoose');

const inventoryBatchSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  batchNo: { type: String, default: '' },
  lotNo: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 0 },
  remainingQuantity: { type: Number, required: true, min: 0 },
  unitCost: { type: Number, default: 0 },
  supplierName: { type: String, default: '' },
  receivedDate: { type: Date, default: Date.now },
  expiryDate: { type: Date },
  notes: { type: String, default: '' }
}, {
  timestamps: true
});

inventoryBatchSchema.index({ item: 1 });
inventoryBatchSchema.index({ expiryDate: 1 });

module.exports = mongoose.model('InventoryBatch', inventoryBatchSchema);

