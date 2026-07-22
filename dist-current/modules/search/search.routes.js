"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const mongoose_1 = __importDefault(require("mongoose"));
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const rateLimiter_1 = require("../../middlewares/rateLimiter");
const response_1 = require("../../helpers/response");
const Student_1 = require("../../models/Student");
const User_1 = require("../../models/User");
const Class_1 = require("../../models/Class");
const Subject_1 = require("../../models/Subject");
const Payment_1 = require("../../models/Payment");
const router = (0, express_1.Router)();
const searchSchema = joi_1.default.object({
    query: joi_1.default.object({
        q: joi_1.default.string().trim().min(2).max(80).required(),
        limit: joi_1.default.number().integer().min(1).max(20).default(8)
    })
});
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function resolveBranchFilter(req) {
    const role = req.user?.canonicalRole ?? req.user?.role;
    if (['super_admin', 'owner'].includes(String(role))) {
        return {};
    }
    const branchId = req.user?.branchId;
    if (!branchId || !mongoose_1.default.Types.ObjectId.isValid(branchId)) {
        return { _id: { $in: [] } };
    }
    return { branchId: new mongoose_1.default.Types.ObjectId(branchId) };
}
router.use(auth_1.authenticate, (0, auth_1.authorize)(['super_admin', 'admin', 'owner', 'branch_manager', 'teacher', 'accountant', 'librarian']));
router.get('/global', rateLimiter_1.generalLimiter, (0, validate_1.validate)(searchSchema), async (req, res, next) => {
    try {
        const query = String(req.query.q || '').trim();
        const limit = Number(req.query.limit || 8);
        const regex = new RegExp(escapeRegex(query), 'i');
        const branchFilter = resolveBranchFilter(req);
        const role = String(req.user?.canonicalRole ?? req.user?.role ?? '');
        const canViewFinance = ['super_admin', 'admin', 'owner', 'branch_manager', 'accountant'].includes(role);
        const [students, teachers, classes, subjects, payments] = await Promise.all([
            Student_1.Student.find({ isDeleted: false, ...branchFilter, $or: [{ firstName: regex }, { lastName: regex }, { studentId: regex }] })
                .select('firstName lastName studentId classId')
                .lean()
                .limit(limit),
            User_1.User.find({ isDeleted: false, ...branchFilter, role: 'teacher', $or: [{ name: regex }, { email: regex }] })
                .select('name email')
                .lean()
                .limit(limit),
            Class_1.ClassModel.find({ isDeleted: false, ...branchFilter, $or: [{ className: regex }, { classCode: regex }] })
                .select('className classCode')
                .lean()
                .limit(limit),
            Subject_1.Subject.find({ isDeleted: false, ...branchFilter, $or: [{ title: regex }, { code: regex }] })
                .select('title code')
                .lean()
                .limit(limit),
            canViewFinance
                ? Payment_1.Payment.find({ isDeleted: false, ...branchFilter, $or: [{ invoiceNumber: regex }, { referenceNumber: regex }] })
                    .select('invoiceNumber referenceNumber amount paymentDate')
                    .lean()
                    .limit(limit)
                : Promise.resolve([])
        ]);
        const results = {
            students: students.map((item) => ({
                id: String(item._id),
                title: `${item.firstName} ${item.lastName}`.trim(),
                subtitle: item.studentId || '',
                path: '/students',
                type: 'student'
            })),
            teachers: teachers.map((item) => ({
                id: String(item._id),
                title: item.name,
                subtitle: item.email,
                path: '/teachers',
                type: 'teacher'
            })),
            classes: classes.map((item) => ({
                id: String(item._id),
                title: item.className,
                subtitle: item.classCode || '',
                path: '/classes',
                type: 'class'
            })),
            subjects: subjects.map((item) => ({
                id: String(item._id),
                title: item.title,
                subtitle: item.code || '',
                path: '/subjects',
                type: 'subject'
            })),
            payments: payments.map((item) => ({
                id: String(item._id),
                title: item.invoiceNumber || item.referenceNumber || 'Payment',
                subtitle: `${item.amount ?? 0}`,
                path: '/payments',
                type: 'payment'
            }))
        };
        res.json((0, response_1.createResponse)(results));
    }
    catch (error) {
        next(error);
    }
});
exports.searchRouter = router;
