"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditService = void 0;
const AuditLog_1 = require("../models/AuditLog");
class AuditService {
    async recordAction(params) {
        return AuditLog_1.AuditLog.create({
            actor: params.actorId,
            branchId: params.branchId ?? null,
            action: params.action,
            target: params.target ?? '',
            targetType: params.targetType ?? '',
            severity: params.severity ?? 'info',
            metadata: params.metadata ?? {},
            ipAddress: params.ipAddress ?? '',
            userAgent: params.userAgent ?? ''
        });
    }
}
exports.AuditService = AuditService;
