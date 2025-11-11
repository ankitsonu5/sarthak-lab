const mongoose = require('mongoose');

/**
 * DeletedRecord archive collection
 * - Store a copy of any document we hard-delete for audit/recovery
 * - Generic shape so multiple modules can reuse it
 */
const deletedRecordSchema = new mongoose.Schema({
  entityType: { type: String, required: true }, // e.g., 'PATHOLOGY_INVOICE'
  originalCollection: { type: String, required: true }, // e.g., 'pathologyinvoices'
  originalId: { type: mongoose.Schema.Types.ObjectId, index: true },
  receiptNumber: { type: Number, index: true },
  year: { type: Number, index: true },
  reason: { type: String, default: '' },
  deletedBy: { type: String, default: 'System' },
  deletedAt: { type: Date, default: Date.now, index: true },
  data: { type: mongoose.Schema.Types.Mixed } // full snapshot of the deleted document
}, { timestamps: true });

module.exports = mongoose.model('DeletedRecord', deletedRecordSchema);

