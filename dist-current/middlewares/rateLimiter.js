"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.teacherCreateLimiter = exports.publicContactLimiter = exports.authLimiter = exports.writeLimiter = exports.generalLimiter = exports.apiWriteLimiter = exports.apiReadLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const env_1 = require("../config/env");
function resolveRequestIdentity(req) {
    const userId = req.user?.userId;
    if (userId) {
        return `user:${userId}`;
    }
    const forwardedFor = req.get('x-forwarded-for')?.split(',')[0]?.trim();
    const ipAddress = forwardedFor || req.ip || req.socket.remoteAddress || 'anonymous';
    return `ip:${ipAddress}`;
}
function createLimiter(params) {
    return (0, express_rate_limit_1.default)({
        windowMs: env_1.config.rateLimitWindow * 60 * 1000,
        max: params.max,
        message: { success: false, message: params.message },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: resolveRequestIdentity,
        skip: (req) => req.method.toUpperCase() === 'OPTIONS' || params.skip?.(req) === true
    });
}
function isReadRequest(req) {
    const method = req.method.toUpperCase();
    return method === 'GET' || method === 'HEAD';
}
function isWriteRequest(req) {
    return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
}
function isAuthRoute(req) {
    return req.path.startsWith('/auth/');
}
exports.apiReadLimiter = createLimiter({
    max: env_1.config.readRateLimitMax,
    message: 'Too many read requests, please wait a moment and try again.',
    skip: (req) => !isReadRequest(req) || req.path === '/health'
});
exports.apiWriteLimiter = createLimiter({
    max: env_1.config.writeRateLimitMax,
    message: 'Too many write requests, please slow down and try again.',
    skip: (req) => !isWriteRequest(req) || isAuthRoute(req)
});
exports.generalLimiter = exports.apiReadLimiter;
exports.writeLimiter = exports.apiWriteLimiter;
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: env_1.config.rateLimitWindow * 60 * 1000,
    max: env_1.config.authRateLimitMax,
    message: { success: false, message: 'Too many authentication attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: resolveRequestIdentity,
    skipSuccessfulRequests: true
});
exports.publicContactLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 8,
    message: { success: false, message: 'Too many contact requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: resolveRequestIdentity
});
exports.teacherCreateLimiter = (0, express_rate_limit_1.default)({
    windowMs: env_1.config.rateLimitWindow * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many teacher creation attempts. Please wait a moment.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: resolveRequestIdentity,
    skipSuccessfulRequests: true
});
