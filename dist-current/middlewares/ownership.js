"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ownershipMiddleware = ownershipMiddleware;
const response_1 = require("../helpers/response");
const permissionService_1 = require("../services/permissionService");
const permissionService = new permissionService_1.PermissionService();
function ownershipMiddleware(req, res, next) {
    const policy = permissionService.getRoutePolicy(req.originalUrl, req.method);
    if (!policy?.ownership || ['governance', 'branch', 'assigned_or_branch'].includes(policy.ownership)) {
        return next();
    }
    if (!req.user) {
        return res.status(401).json((0, response_1.createError)('Authentication required'));
    }
    if (['super_admin', 'admin', 'owner', 'branch_manager', 'system_automation'].includes(req.user.canonicalRole ?? '')) {
        return next();
    }
    const selfId = req.params.id || req.query.userId || req.body?.userId || req.body?.studentId || req.body?.teacherId;
    if (policy.ownership === 'self' && selfId && selfId.toString() !== req.user.userId) {
        return res.status(403).json((0, response_1.createError)('Ownership check failed'));
    }
    next();
}
