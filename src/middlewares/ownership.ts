import type { Request, Response, NextFunction } from 'express';
import { createError } from '../helpers/response';
import { PermissionService } from '../services/permissionService';

const permissionService = new PermissionService();

export function ownershipMiddleware(req: Request, res: Response, next: NextFunction) {
  const policy = permissionService.getRoutePolicy(req.originalUrl, req.method);
  if (!policy?.ownership || ['governance', 'branch', 'assigned_or_branch'].includes(policy.ownership)) {
    return next();
  }

  if (!req.user) {
    return res.status(401).json(createError('Authentication required'));
  }

  if (['super_admin', 'admin', 'owner', 'branch_manager', 'system_automation'].includes(req.user.canonicalRole ?? '')) {
    return next();
  }

  const selfId = req.params.id || req.query.userId || req.body?.userId || req.body?.studentId || req.body?.teacherId;
  if (policy.ownership === 'self' && selfId && selfId.toString() !== req.user.userId) {
    return res.status(403).json(createError('Ownership check failed'));
  }

  next();
}
