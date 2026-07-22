"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const AuditLog_1 = require("../../models/AuditLog");
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const router = (0, express_1.Router)();
const querySchema = joi_1.default.object({
    query: joi_1.default.object({
        page: joi_1.default.number().integer().min(1).default(1),
        limit: joi_1.default.number().integer().min(1).max(100).default(20),
        severity: joi_1.default.string().valid('info', 'warning', 'critical').optional()
    })
});
router.use(auth_1.authenticate, (0, auth_1.authorize)(['super_admin', 'admin', 'owner', 'branch_manager']));
function resolveAuditType(action) {
    const normalizedAction = String(action || '').toUpperCase();
    if (normalizedAction.startsWith('AUTH_'))
        return 'authentication';
    if (normalizedAction.startsWith('ATTENDANCE_'))
        return 'attendance';
    if (normalizedAction.startsWith('PAYMENT_') || normalizedAction.startsWith('FINANCE_') || normalizedAction.startsWith('EXPENSE_'))
        return 'finance';
    if (normalizedAction.startsWith('ROLE_') || normalizedAction.startsWith('PERMISSION_'))
        return 'rbac';
    if (normalizedAction.startsWith('REPORT_'))
        return 'reporting';
    return 'system';
}
router.get('/', (0, validate_1.validate)(querySchema), async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        const branchId = req.user?.canonicalRole === 'branch_manager' ? req.user.branchId : req.query.branchId;
        const filter = { isDeleted: false };
        if (branchId) {
            filter.branchId = branchId;
        }
        if (req.query.severity) {
            filter.severity = String(req.query.severity);
        }
        const [logs, total] = await Promise.all([
            AuditLog_1.AuditLog.find(filter).sort({ createdAt: -1 }).lean().skip((page - 1) * limit).limit(limit),
            AuditLog_1.AuditLog.countDocuments(filter)
        ]);
        res.json((0, response_1.createResponse)(logs.map((log) => ({
            ...log,
            type: log.type ?? resolveAuditType(log.action),
            severity: log.severity ?? 'info'
        })), '', { page, limit, total }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/security-events', auth_1.authenticate, (0, auth_1.authorize)(['super_admin', 'owner']), (0, validate_1.validate)(querySchema), async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        const branchId = req.query.branchId;
        const filter = {
            isDeleted: false,
            $or: [
                { action: { $regex: '^AUTH_', $options: 'i' } },
                { action: { $regex: '^SECURITY_', $options: 'i' } },
                { action: { $regex: '^PERMISSION_', $options: 'i' } }
            ]
        };
        if (branchId) {
            filter.branchId = branchId;
        }
        if (req.query.severity) {
            filter.severity = String(req.query.severity);
        }
        const [logs, total] = await Promise.all([
            AuditLog_1.AuditLog.find(filter).sort({ createdAt: -1 }).lean().skip((page - 1) * limit).limit(limit),
            AuditLog_1.AuditLog.countDocuments(filter)
        ]);
        res.json((0, response_1.createResponse)(logs.map((log) => ({
            ...log,
            type: 'security'
        })), '', { page, limit, total }));
    }
    catch (error) {
        next(error);
    }
});
exports.auditRouter = router;
