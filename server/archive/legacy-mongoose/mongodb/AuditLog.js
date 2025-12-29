import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    enum: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'PRINT']
  },
  resource: {
    type: String,
    required: true  // e.g., 'patient', 'appointment', 'prescription'
  },
  resourceId: String,
  changes: mongoose.Schema.Types.Mixed,  // What changed
  ipAddress: String,
  userAgent: String,
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  metadata: mongoose.Schema.Types.Mixed
}, {
  timestamps: true,
  collection: 'audit_logs'
});

// Index for efficient queries
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1 });

export default mongoose.model('AuditLog', auditLogSchema);
