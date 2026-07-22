"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestContextMiddleware = requestContextMiddleware;
exports.requestSanitizationMiddleware = requestSanitizationMiddleware;
exports.csrfProtectionMiddleware = csrfProtectionMiddleware;
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../config/env");
const response_1 = require("../helpers/response");
const permissionService_1 = require("../services/permissionService");
const requestSanitizer_1 = require("../utils/requestSanitizer");
const permissionService = new permissionService_1.PermissionService();
function parseCookieHeader(cookieHeader) {
    return cookieHeader
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .reduce((acc, part) => {
        const separatorIndex = part.indexOf('=');
        if (separatorIndex <= 0)
            return acc;
        const key = part.slice(0, separatorIndex).trim();
        const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
        if (key)
            acc[key] = value;
        return acc;
    }, {});
}
function hasBearerAuthorization(req) {
    const authorization = req.get('authorization') ?? '';
    return /^Bearer\s+\S+/i.test(authorization);
}
function isCsrfExemptRequest(req) {
    if (hasBearerAuthorization(req)) {
        return true;
    }
    const pathname = req.originalUrl.split('?')[0];
    return permissionService.isPublicRoute(pathname, req.method);
}
function requestContextMiddleware(req, res, next) {
    req.requestId = crypto_1.default.randomUUID();
    res.setHeader('x-request-id', req.requestId);
    next();
}
function requestSanitizationMiddleware(req, _res, next) {
    req.body = (0, requestSanitizer_1.sanitizePayload)(req.body);
    req.query = (0, requestSanitizer_1.sanitizePayload)(req.query);
    req.params = (0, requestSanitizer_1.sanitizePayload)(req.params);
    next();
}
function csrfProtectionMiddleware(req, res, next) {
    const stateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
    if (!stateChanging || !req.headers.cookie || isCsrfExemptRequest(req)) {
        if (!stateChanging && req.headers.cookie) {
            const cookies = parseCookieHeader(req.headers.cookie);
            const existingToken = cookies[env_1.config.csrfCookieName];
            if (!existingToken) {
                const token = crypto_1.default.randomBytes(32).toString('hex');
                res.cookie(env_1.config.csrfCookieName, token, {
                    httpOnly: false,
                    sameSite: 'lax',
                    secure: env_1.config.environment === 'production',
                    path: '/'
                });
            }
        }
        return next();
    }
    const csrfToken = req.get(env_1.config.csrfHeaderName);
    const cookies = parseCookieHeader(req.headers.cookie);
    const cookieToken = cookies[env_1.config.csrfCookieName];
    const cookieTokenMatch = Boolean(csrfToken && cookieToken && csrfToken === cookieToken);
    const legacySecretMatch = env_1.config.csrfAllowLegacySecret && Boolean(csrfToken && csrfToken === env_1.config.csrfSecret);
    if (!cookieTokenMatch && !legacySecretMatch) {
        return res.status(403).json((0, response_1.createError)('CSRF token invalid'));
    }
    next();
}
