"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.permissionMiddleware = permissionMiddleware;
exports.routePermissionMiddleware = routePermissionMiddleware;
const response_1 = require("../helpers/response");
const permissionService_1 = require("../services/permissionService");
const roleProfileService_1 = require("../services/roleProfileService");
const User_1 = require("../models/User");
const roleHelpers_1 = require("../utils/roleHelpers");
const permissionService = new permissionService_1.PermissionService();
const roleProfileService = new roleProfileService_1.RoleProfileService();
async function resolvePermissionPrincipal(req) {
    if (!req.user?.userId) {
        return null;
    }
    if (req.user.permissions !== undefined && req.user.revokedPermissionKeys !== undefined) {
        return req.user;
    }
    const currentUser = await User_1.User.findById(req.user.userId)
        .select('role permissionKeys revokedPermissionKeys permissions')
        .lean();
    if (!currentUser) {
        return req.user;
    }
    const canonicalRole = (0, roleHelpers_1.normalizeRole)(currentUser.role);
    const rolePermissionKeys = canonicalRole
        ? await roleProfileService.getRolePermissionOverride(canonicalRole)
        : null;
    const legacyPermissions = currentUser.permissions instanceof Map
        ? Object.fromEntries(currentUser.permissions.entries())
        : currentUser.permissions ?? {};
    return {
        ...req.user,
        role: currentUser.role,
        canonicalRole: canonicalRole ?? req.user.canonicalRole,
        permissionKeys: Array.isArray(currentUser.permissionKeys) ? currentUser.permissionKeys : [],
        revokedPermissionKeys: Array.isArray(currentUser.revokedPermissionKeys) ? currentUser.revokedPermissionKeys : [],
        permissions: legacyPermissions,
        rolePermissionKeys: rolePermissionKeys ?? req.user.rolePermissionKeys
    };
}
function permissionMiddleware(permission) {
    return async (req, res, next) => {
        if (!req.user?.userId) {
            return res.status(401).json((0, response_1.createError)('Authentication required'));
        }
        const currentUser = await User_1.User.findById(req.user.userId)
            .select('role permissionKeys revokedPermissionKeys permissions')
            .lean();
        const canonicalRole = (0, roleHelpers_1.normalizeRole)(currentUser?.role);
        const rolePermissionKeys = canonicalRole
            ? await roleProfileService.getRolePermissionOverride(canonicalRole)
            : null;
        if (!currentUser || !permissionService.hasRequiredAccess({ ...currentUser, rolePermissionKeys: rolePermissionKeys ?? undefined }, { prefix: req.originalUrl, permissions: [permission] })) {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        next();
    };
}
async function routePermissionMiddleware(req, res, next) {
    const policy = permissionService.getRoutePolicy(req.originalUrl, req.method);
    if (!policy || policy.public) {
        return next();
    }
    if (!req.user) {
        return res.status(401).json((0, response_1.createError)('Authentication required'));
    }
    try {
        const principal = await resolvePermissionPrincipal(req);
        if (!principal || !permissionService.hasRequiredAccess(principal, policy)) {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        req.user = principal;
        return next();
    }
    catch (error) {
        return next(error);
    }
}
