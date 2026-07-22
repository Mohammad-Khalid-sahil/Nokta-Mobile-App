import { AuditLog } from '../models/AuditLog';

export class AuditService {
  async recordAction(params: {
    actorId: string;
    branchId?: string | null;
    action: string;
    target?: string;
    targetType?: string;
    severity?: 'info' | 'warning' | 'critical';
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return AuditLog.create({
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
