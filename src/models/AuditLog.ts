import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const auditLogSchema = createBaseSchema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    action: { type: String, required: true, trim: true, index: true },
    target: { type: String, default: '', trim: true },
    targetType: { type: String, default: '', trim: true },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info', index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: '', trim: true },
    userAgent: { type: String, default: '', trim: true }
  },
  { collection: 'audit_logs' }
);

auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ branchId: 1, action: 1, createdAt: -1 });

export const AuditLog = mongoose.models.AuditLog ?? mongoose.model('AuditLog', auditLogSchema);
