"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.branchMiddleware = branchMiddleware;
const response_1 = require("../helpers/response");
const permissionService_1 = require("../services/permissionService");
const permissionService = new permissionService_1.PermissionService();
function branchMiddleware(req, res, next) {
    const policy = permissionService.getRoutePolicy(req.originalUrl, req.method);
    if (!policy?.branchScoped) {
        return next();
    }
    if (!req.user) {
        return res.status(401).json((0, response_1.createError)('Authentication required'));
    }
    if (['super_admin', 'owner', 'system_automation'].includes(req.user.canonicalRole ?? '')) {
        return next();
    }
    const userBranchId = req.user.branchId?.toString?.() ?? null;
    const requestBranchId = (req.body?.branchId || req.query?.branchId || null)?.toString?.() ?? null;
    if (!userBranchId && !requestBranchId) {
        return next();
    }
    if (!userBranchId || (requestBranchId && userBranchId !== requestBranchId)) {
        return res.status(403).json((0, response_1.createError)('Branch access denied'));
    }
    next();
}
