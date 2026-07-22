"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditMiddleware = auditMiddleware;
const auditService_1 = require("../services/auditService");
const permissionService_1 = require("../services/permissionService");
const requestSanitizer_1 = require("../utils/requestSanitizer");
const auditService = new auditService_1.AuditService();
const permissionService = new permissionService_1.PermissionService();
function auditMiddleware(req, res, next) {
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
                requestBody: (0, requestSanitizer_1.redactSensitivePayload)(req.body)
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent') ?? ''
        });
    });
    next();
}
