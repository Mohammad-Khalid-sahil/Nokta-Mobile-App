"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLog = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const auditLogSchema = (0, schema_1.createBaseSchema)({
    actor: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    action: { type: String, required: true, trim: true, index: true },
    target: { type: String, default: '', trim: true },
    targetType: { type: String, default: '', trim: true },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info', index: true },
    metadata: { type: mongoose_1.default.Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: '', trim: true },
    userAgent: { type: String, default: '', trim: true }
}, { collection: 'audit_logs' });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ branchId: 1, action: 1, createdAt: -1 });
exports.AuditLog = mongoose_1.default.models.AuditLog ?? mongoose_1.default.model('AuditLog', auditLogSchema);
