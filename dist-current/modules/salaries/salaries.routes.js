"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.salariesRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const Salary_1 = require("../../models/Salary");
const SalaryTransaction_1 = require("../../models/SalaryTransaction");
const User_1 = require("../../models/User");
const auditService_1 = require("../../services/auditService");
const financeAggregationService_1 = require("../../services/financeAggregationService");
const router = (0, express_1.Router)();
const auditService = new auditService_1.AuditService();
const financeAggregationService = new financeAggregationService_1.FinanceAggregationService();
const payoutSchema = joi_1.default.object({
    body: joi_1.default.object({
        teacherId: joi_1.default.string().hex().length(24).required(),
        monthKey: joi_1.default.string().pattern(/^\d{4}-\d{2}$/).required(),
        amount: joi_1.default.number().positive().required(),
        notes: joi_1.default.string().allow('', null).optional()
    })
});
router.use(auth_1.authenticate);
router.get('/', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'owner']), async (req, res, next) => {
    try {
        const filter = { isDeleted: false };
        if (req.query.teacherId)
            filter.employeeId = req.query.teacherId;
        if (req.query.status)
            filter.status = req.query.status;
        if (req.user?.canonicalRole === 'branch_manager' && req.user.branchId) {
            filter.branchId = req.user.branchId;
        }
        const records = await Salary_1.Salary.find(filter).sort({ createdAt: -1 }).limit(200).lean();
        res.json((0, response_1.createResponse)(records));
    }
    catch (error) {
        next(error);
    }
});
router.get('/overview', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'owner']), async (req, res, next) => {
    try {
        const scopedBranchId = req.user?.canonicalRole === 'branch_manager' ? req.user.branchId : undefined;
        const teachers = await financeAggregationService.getTeacherOverview({
            startDate: req.query.startDate ? String(req.query.startDate) : undefined,
            endDate: req.query.endDate ? String(req.query.endDate) : undefined,
            branchId: req.query.branchId ? String(req.query.branchId) : undefined,
            teacherId: req.query.teacherId ? String(req.query.teacherId) : undefined,
            classId: req.query.classId ? String(req.query.classId) : undefined,
            subjectId: req.query.subjectId ? String(req.query.subjectId) : undefined,
            status: req.query.status ? String(req.query.status) : undefined
        }, scopedBranchId);
        res.json((0, response_1.createResponse)(teachers));
    }
    catch (error) {
        next(error);
    }
});
router.post('/payout', (0, auth_1.authorize)(['super_admin', 'admin', 'owner']), (0, validate_1.validate)(payoutSchema), async (req, res, next) => {
    try {
        const teacher = await User_1.User.findOne({ _id: req.body.teacherId, role: 'teacher', isDeleted: false }).lean();
        if (!teacher) {
            return res.status(404).json((0, response_1.createError)('Teacher not found'));
        }
        const duplicatePaid = await Salary_1.Salary.findOne({
            employeeId: teacher._id,
            monthKey: req.body.monthKey,
            status: 'paid',
            isDeleted: false
        }).lean();
        if (duplicatePaid) {
            return res.status(409).json((0, response_1.createError)('Salary for this teacher and month has already been paid'));
        }
        const payoutAmount = Number(req.body.amount);
        const salaryRecord = await Salary_1.Salary.findOneAndUpdate({ employeeId: teacher._id, monthKey: req.body.monthKey, isDeleted: false }, {
            $setOnInsert: {
                employeeId: teacher._id,
                branchId: teacher.branchId ?? null,
                monthKey: req.body.monthKey,
                baseAmount: payoutAmount,
                deductions: 0,
                netAmount: payoutAmount,
                currency: 'AFN'
            },
            $set: {
                paidAmount: payoutAmount,
                status: 'paid',
                paidAt: new Date(),
                paidBy: req.user?.userId ?? null,
                approvedBy: req.user?.userId ?? null
            },
            $push: {
                auditHistory: {
                    action: 'salary_payout',
                    actorId: req.user?.userId ?? null,
                    notes: req.body.notes ?? '',
                    amount: payoutAmount,
                    at: new Date()
                }
            }
        }, { upsert: true, new: true, setDefaultsOnInsert: true });
        await SalaryTransaction_1.SalaryTransaction.updateMany({
            teacherId: teacher._id,
            isDeleted: false,
            status: { $in: ['pending', 'approved'] },
            year: Number(req.body.monthKey.split('-')[0]),
            month: Number(req.body.monthKey.split('-')[1])
        }, {
            $set: {
                status: 'paid',
                paidAt: new Date()
            }
        });
        await auditService.recordAction({
            actorId: req.user.userId,
            branchId: teacher.branchId?.toString?.() ?? null,
            action: 'SALARY_PAYOUT',
            target: String(teacher._id),
            targetType: 'teacher',
            metadata: {
                monthKey: req.body.monthKey,
                amount: payoutAmount,
                salaryId: String(salaryRecord._id),
                notes: req.body.notes ?? ''
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent') ?? ''
        });
        res.status(201).json((0, response_1.createResponse)(salaryRecord, 'Salary payout recorded successfully'));
    }
    catch (error) {
        if (error?.code === 11000) {
            return res.status(409).json((0, response_1.createError)('Duplicate salary payout blocked for this teacher and month'));
        }
        next(error);
    }
});
exports.salariesRouter = router;
