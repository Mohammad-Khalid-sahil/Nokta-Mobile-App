import type { Request, Response, NextFunction } from 'express';
import { AuditService } from '../services/auditService';
import { PermissionService } from '../services/permissionService';
import { redactSensitivePayload } from '../utils/requestSanitizer';

const auditService = new AuditService();
const permissionService = new PermissionService();

export function auditMiddleware(req: Request, res: Response, next: NextFunction) {
  const shouldAudit = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
  if (!shouldAudit) {
    return next();
  }

  res.on('finish', () => {
    if (!req.user?.userId || res.statusCode < 200 || res.statusCode >= 500) {
      return;
    }

    const policy = permissionService.getRoutePolicy(req.originalUrl, req.method);
    void auditService.recordAction({
      actorId: req.user.userId,
      branchId: req.user.branchId ?? null,
      action: policy?.auditAction ?? `${req.method.toUpperCase()} ${req.originalUrl}`,
      target: req.params.id ?? '',
      targetType: req.baseUrl || req.originalUrl,
      severity: res.statusCode >= 400 ? 'warning' : 'info',
      metadata: {
        method: req.method.toUpperCase(),
        url: req.originalUrl,
        requestBody: redactSensitivePayload(req.body)
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? ''
    });
  });

  next();
}
