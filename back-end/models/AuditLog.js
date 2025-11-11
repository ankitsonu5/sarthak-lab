const mongoose = require('mongoose');

// Centralized audit log for CREATE/UPDATE/DELETE across modules
// Keep it compact and fast to write; query-friendly by entity and time
const auditLogSchema = new mongoose.Schema({
  entityType: { type: String, required: true },           // e.g. 'Patient', 'Appointment', 'PathologyInvoice'
  entityId:   { type: String, required: true, index: true }, // Store as string for mixed ObjectId/UHID/receipt
  action:     { type: String, enum: ['CREATE','UPDATE','DELETE'], required: true },

  // Minimal actor info (if available)
  by: {
    userId: { type: String },
    role:   { type: String },
    name:   { type: String }
  },

  // Flattened diff for changed fields: { fieldPath: { before, after } }
  diff: { type: Object, default: {} },
  // Optional metadata (receiptNumber, module, ip, etc.)
  meta: { type: Object, default: {} },

  at: { type: Date, default: Date.now, index: true }
}, { timestamps: false, minimize: true });

// Helpful compound index for common queries
auditLogSchema.index({ entityType: 1, entityId: 1, at: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

