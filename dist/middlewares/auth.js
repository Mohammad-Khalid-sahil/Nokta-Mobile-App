"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
exports.authenticate = authenticate;
exports.authorize = authorize;
exports.checkPermission = checkPermission;
exports.permissionGuard = permissionGuard;
exports.studentFilter = studentFilter;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const response_1 = require("../helpers/response");
const roleHelpers_1 = require("../utils/roleHelpers");
const User_1 = require("../models/User");
const roleHelpers_2 = require("../utils/roleHelpers");
const sessionService_1 = require("../services/sessionService");
const permissionService_1 = require("../services/permissionService");
const roleProfileService_1 = require("../services/roleProfileService");
const AuditLog_1 = require("../models/AuditLog");
const logger_1 = require("../utils/logger");
const networkAddresses_1 = require("../utils/networkAddresses");
const sessionService = new sessionService_1.SessionService();
const permissionService = new permissionService_1.PermissionService();
const roleProfileService = new roleProfileService_1.RoleProfileService();
function logAuthentication(req, result, metadata = {}) {
    const authorization = req.headers.authorization ?? '';
    const hasBearerToken = /^Bearer\s+\S+/i.test(authorization);
    logger_1.logger.info('Authentication check', {
        method: req.method,
        path: req.originalUrl,
        clientIp: (0, networkAddresses_1.resolveClientIp)(req),
        authorizationHeaderPresent: Boolean(authorization),
        bearerTokenExtracted: hasBearerToken,
        result,
        ...metadata
    });
}
async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        logAuthentication(req, 'authorization_header_missing');
        return res.status(401).json((0, response_1.createError)('Authentication required'));
    }
    if (!authHeader.startsWith('Bearer ')) {
        logAuthentication(req, 'bearer_prefix_missing');
        return res.status(401).json((0, response_1.createError)('Authentication required'));
    }
    const token = authHeader.split(' ')[1];
    if (!token?.trim()) {
        logAuthentication(req, 'bearer_token_empty');
        return res.status(401).json((0, response_1.createError)('Authentication required'));
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, env_1.config.jwtSecret);
        const sessionId = payload.jti || payload.sessionId;
        if (sessionId && await sessionService.isAccessTokenBlacklisted(sessionId)) {
            logAuthentication(req, 'session_revoked', {
                userId: payload.userId,
                role: payload.role,
                sessionId
            });
            return res.status(401).json((0, response_1.createError)('Session has been revoked'));
        }
        const currentUser = await User_1.User.findById(payload.userId)
            .select('role branchId permissionKeys revokedPermissionKeys permissions status isDeleted')
            .lean();
        if (!currentUser || currentUser.isDeleted) {
            logAuthentication(req, 'user_not_found', {
                userId: payload.userId,
                role: payload.role,
                sessionId
            });
            return res.status(401).json((0, response_1.createError)('Invalid token'));
        }
        if (['locked', 'suspended', 'inactive'].includes(String(currentUser.status || 'active'))) {
            logAuthentication(req, 'user_disabled', {
                userId: payload.userId,
                role: currentUser.role,
                status: currentUser.status,
                sessionId
            });
            return res.status(403).json((0, response_1.createError)(`Account is ${currentUser.status}`));
        }
        const canonicalRole = permissionService.getCanonicalRole(currentUser.role);
        const rolePermissionKeys = canonicalRole
            ? await roleProfileService.getRolePermissionOverride(canonicalRole)
            : null;
        const legacyPermissions = currentUser.permissions instanceof Map
            ? Object.fromEntries(currentUser.permissions.entries())
            : currentUser.permissions ?? {};
        const authUser = {
            userId: payload.userId,
            role: currentUser.role,
            canonicalRole,
            branchId: currentUser.branchId?.toString?.() ?? null,
            sessionId: sessionId ?? null,
            permissionKeys: Array.isArray(currentUser.permissionKeys) ? currentUser.permissionKeys : [],
            revokedPermissionKeys: Array.isArray(currentUser.revokedPermissionKeys) ? currentUser.revokedPermissionKeys : [],
            permissions: legacyPermissions,
            rolePermissionKeys: rolePermissionKeys ?? undefined
        };
        req.user = authUser;
        logAuthentication(req, 'authenticated', {
            userId: authUser.userId,
            role: authUser.role,
            canonicalRole: authUser.canonicalRole,
            sessionId: authUser.sessionId
        });
        next();
    }
    catch (error) {
        logAuthentication(req, error instanceof jsonwebtoken_1.default.TokenExpiredError ? 'token_expired' : 'token_invalid', {
            errorName: error instanceof Error ? error.name : 'unknown'
        });
        return res.status(401).json((0, response_1.createError)('Invalid token'));
    }
}
function authorize(allowedRoles) {
    return (req, res, next) => {
        const role = req.user?.role;
        if (!role) {
            return res.status(403).json((0, response_1.createError)('Access denied'));
        }
        const canonicalRole = (0, roleHelpers_2.normalizeRole)(role);
        if (canonicalRole === 'super_admin') {
            return next();
        }
        if (!(0, roleHelpers_1.roleMatches)(role, allowedRoles)) {
            void AuditLog_1.AuditLog.create({
                actor: req.user?.userId,
                branchId: req.user?.branchId ?? null,
                action: 'PERMISSION_DENIED_ROUTE',
                targetType: 'route',
                target: req.originalUrl,
                severity: 'warning',
                metadata: { method: req.method, requiredRoles: allowedRoles },
                ipAddress: req.ip,
                userAgent: req.get('user-agent') ?? ''
            }).catch(() => undefined);
            return res.status(403).json((0, response_1.createError)('Access denied'));
        }
        return next();
    };
}
function checkPermission(moduleKey, action) {
    const permission = (0, roleHelpers_1.permissionFromLegacy)(moduleKey, action);
    return async (req, res, next) => {
        if (!req.user?.userId) {
            return res.status(401).json((0, response_1.createError)('Authentication required'));
        }
        if (!permission) {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        const currentUser = await User_1.User.findById(req.user.userId)
            .select('role permissionKeys revokedPermissionKeys permissions')
            .lean();
        const canonicalRole = (0, roleHelpers_2.normalizeRole)(currentUser?.role);
        const rolePermissionKeys = canonicalRole
            ? await roleProfileService.getRolePermissionOverride(canonicalRole)
            : null;
        if (!currentUser || !permissionService.hasRequiredAccess({ ...currentUser, rolePermissionKeys: rolePermissionKeys ?? undefined }, { prefix: req.originalUrl, permissions: [permission] })) {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        next();
    };
}
function permissionGuard(req, res, next) {
    const policy = permissionService.getRoutePolicy(req.originalUrl, req.method);
    if (!policy || policy.public) {
        return next();
    }
    if (!req.user) {
        return res.status(401).json((0, response_1.createError)('Authentication required'));
    }
    return permissionService.hasRequiredAccess(req.user, policy)
        ? next()
        : res.status(403).json((0, response_1.createError)('Forbidden'));
}
function studentFilter(req, res, next) {
    if (req.user?.canonicalRole === 'student') {
        req.filter = { userId: req.user.userId };
    }
    next();
}
exports.authMiddleware = authenticate;
