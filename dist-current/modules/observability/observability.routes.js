"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.observabilityRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mongoose_1 = __importDefault(require("mongoose"));
const env_1 = require("../../config/env");
const response_1 = require("../../helpers/response");
const AnalyticsEvent_1 = require("../../models/AnalyticsEvent");
const ClientErrorLog_1 = require("../../models/ClientErrorLog");
const validate_1 = require("../../middlewares/validate");
const roleHelpers_1 = require("../../utils/roleHelpers");
const router = (0, express_1.Router)();
const clientErrorSchema = joi_1.default.object({
    body: joi_1.default.object({
        message: joi_1.default.string().trim().max(4000).required(),
        stacktrace: joi_1.default.string().max(20000).allow('', null).optional(),
        stackTrace: joi_1.default.string().max(20000).allow('', null).optional(),
        appVersion: joi_1.default.string().trim().max(64).allow('', null).optional(),
        buildNumber: joi_1.default.string().trim().max(32).allow('', null).optional(),
        platform: joi_1.default.string().trim().max(64).allow('', null).optional(),
        platformVersion: joi_1.default.string().trim().max(128).allow('', null).optional(),
        deviceId: joi_1.default.string().trim().max(128).allow('', null).optional(),
        userId: joi_1.default.string().hex().length(24).allow('', null).optional(),
        context: joi_1.default.object().unknown(true).optional(),
        timestamp: joi_1.default.alternatives().try(joi_1.default.date(), joi_1.default.string()).allow(null).optional()
    })
});
const analyticsEventSchema = joi_1.default.object({
    body: joi_1.default.object({
        name: joi_1.default.string().trim().max(128).optional(),
        event: joi_1.default.string().trim().max(128).optional(),
        parameters: joi_1.default.object().unknown(true).optional(),
        metadata: joi_1.default.object().unknown(true).optional(),
        context: joi_1.default.object().unknown(true).optional(),
        timestamp: joi_1.default.alternatives().try(joi_1.default.date(), joi_1.default.string()).allow(null).optional()
    }).or('name', 'event')
});
function resolveClientTimestamp(value) {
    if (!value)
        return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
}
function resolveUserId(req, bodyUserId) {
    if (req.user?.userId && mongoose_1.default.Types.ObjectId.isValid(req.user.userId)) {
        return new mongoose_1.default.Types.ObjectId(req.user.userId);
    }
    if (bodyUserId && mongoose_1.default.Types.ObjectId.isValid(bodyUserId)) {
        return new mongoose_1.default.Types.ObjectId(bodyUserId);
    }
    return null;
}
async function optionalAuthenticate(req, _res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return next();
    }
    const token = authHeader.split(' ')[1];
    try {
        const payload = jsonwebtoken_1.default.verify(token, env_1.config.jwtSecret);
        if (payload.userId && mongoose_1.default.Types.ObjectId.isValid(payload.userId)) {
            const canonicalRole = (0, roleHelpers_1.normalizeRole)(payload.canonicalRole ?? payload.role);
            req.user = {
                userId: payload.userId,
                role: payload.role,
                canonicalRole,
                branchId: payload.branchId ?? null,
                sessionId: payload.sessionId ?? payload.jti ?? null,
                permissionKeys: [],
                revokedPermissionKeys: [],
                permissions: {}
            };
        }
    }
    catch {
        // Ignore invalid tokens for observability ingestion.
    }
    next();
}
router.post('/client-errors', optionalAuthenticate, (0, validate_1.validate)(clientErrorSchema), async (req, res, next) => {
    try {
        const body = req.body;
        const stacktrace = String(body.stacktrace ?? body.stackTrace ?? '').slice(0, 20000);
        const entry = await ClientErrorLog_1.ClientErrorLog.create({
            message: String(body.message ?? '').slice(0, 4000),
            stacktrace,
            appVersion: body.appVersion ?? '',
            buildNumber: body.buildNumber ?? '',
            platform: body.platform ?? '',
            platformVersion: body.platformVersion ?? '',
            deviceId: body.deviceId ?? '',
            userId: resolveUserId(req, typeof body.userId === 'string' ? body.userId : null),
            context: body.context ?? {},
            clientTimestamp: resolveClientTimestamp(body.timestamp)
        });
        res.status(201).json((0, response_1.createResponse)({ id: entry._id }, 'Client error logged'));
    }
    catch (error) {
        next(error);
    }
});
router.post('/analytics/event', optionalAuthenticate, (0, validate_1.validate)(analyticsEventSchema), async (req, res, next) => {
    try {
        const body = req.body;
        const name = String(body.name ?? body.event ?? '').trim();
        if (!name) {
            return res.status(400).json((0, response_1.createError)('Event name is required'));
        }
        const parameters = (body.parameters ?? body.metadata ?? {});
        const entry = await AnalyticsEvent_1.AnalyticsEvent.create({
            name,
            parameters,
            userId: resolveUserId(req, typeof body.context?.userId === 'string'
                ? String(body.context.userId)
                : null),
            context: body.context ?? {},
            clientTimestamp: resolveClientTimestamp(body.timestamp)
        });
        res.status(201).json((0, response_1.createResponse)({ id: entry._id }, 'Analytics event recorded'));
    }
    catch (error) {
        next(error);
    }
});
exports.observabilityRouter = router;
