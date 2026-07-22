"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.financeRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const Expense_1 = require("../../models/Expense");
const FinanceEntry_1 = require("../../models/FinanceEntry");
const Payment_1 = require("../../models/Payment");
const pagination_1 = require("../../validators/pagination");
const financeAggregationService_1 = require("../../services/financeAggregationService");
const router = (0, express_1.Router)();
const financeAggregationService = new financeAggregationService_1.FinanceAggregationService();
const financeSchema = joi_1.default.object({
    body: joi_1.default.object({
        title: joi_1.default.string().required(),
        amount: joi_1.default.number().positive().required(),
        category: joi_1.default.string().required(),
        date: joi_1.default.date().optional(),
        notes: joi_1.default.string().allow('', null),
        branchId: joi_1.default.string().hex().length(24).allow(null).optional()
    })
});
function readFinanceFilters(query) {
    return {
        startDate: query.startDate ? String(query.startDate) : undefined,
        endDate: query.endDate ? String(query.endDate) : undefined,
        branchId: query.branchId ? String(query.branchId) : undefined,
        teacherId: query.teacherId ? String(query.teacherId) : undefined,
        classId: query.classId ? String(query.classId) : undefined,
        subjectId: query.subjectId ? String(query.subjectId) : undefined,
        status: query.status ? String(query.status) : undefined
    };
}
router.get('/me/earnings', auth_1.authenticate, (0, auth_1.authorize)(['teacher']), async (req, res, next) => {
    try {
        const detail = await financeAggregationService.getTeacherSelfEarnings(req.user.userId, readFinanceFilters(req.query));
        res.json((0, response_1.createResponse)(detail));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load teacher earnings';
        res.status(404).json((0, response_1.createError)(message));
    }
});
router.use(auth_1.authenticate, (0, auth_1.authorize)(['super_admin', 'admin', 'accountant', 'branch_manager', 'owner']));
router.get('/summary', async (req, res, next) => {
    try {
        const scopedBranchId = req.user?.canonicalRole === 'branch_manager' ? req.user.branchId : undefined;
        const summary = await financeAggregationService.getSummary(readFinanceFilters(req.query), scopedBranchId);
        res.json((0, response_1.createResponse)(summary));
    }
    catch (error) {
        next(error);
    }
});
router.get('/teachers', async (req, res, next) => {
    try {
        const scopedBranchId = req.user?.canonicalRole === 'branch_manager' ? req.user.branchId : undefined;
        const teachers = await financeAggregationService.getTeacherOverview(readFinanceFilters(req.query), scopedBranchId);
        res.json((0, response_1.createResponse)(teachers));
    }
    catch (error) {
        next(error);
    }
});
router.get('/teachers/:id', async (req, res, next) => {
    try {
        const scopedBranchId = req.user?.canonicalRole === 'branch_manager' ? req.user.branchId : undefined;
        const detail = await financeAggregationService.getTeacherDetail(req.params.id, readFinanceFilters(req.query), scopedBranchId);
        res.json((0, response_1.createResponse)(detail));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load teacher finance detail';
        res.status(404).json((0, response_1.createError)(message));
    }
});
router.post('/income', (0, validate_1.validate)(financeSchema), async (req, res, next) => {
    try {
        const income = await FinanceEntry_1.FinanceEntry.create({
            ...req.body,
            branchId: req.body.branchId ?? req.user?.branchId ?? null,
            createdBy: req.user?.userId ?? null
        });
        res.status(201).json((0, response_1.createResponse)(income, 'Income recorded'));
    }
    catch (error) {
        next(error);
    }
});
router.get('/', (0, validate_1.validate)(pagination_1.paginationSchema), async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        const scopedBranchId = req.user?.canonicalRole === 'branch_manager' ? req.user.branchId : req.query.branchId;
        const branchFilter = scopedBranchId ? { branchId: scopedBranchId } : {};
        const [payments, financeEntries, expenses] = await Promise.all([
            Payment_1.Payment.find({ isDeleted: false, status: { $nin: ['cancelled', 'refunded'] }, ...branchFilter })
                .populate('studentId', 'firstName lastName studentId')
                .populate('payeeUserId', 'name role')
                .lean(),
            FinanceEntry_1.FinanceEntry.find({ isDeleted: false, ...branchFilter }).lean(),
            Expense_1.Expense.find({ isDeleted: false, category: { $ne: 'income' }, ...branchFilter }).lean()
        ]);
        const items = [
            ...payments.map((payment) => ({
                id: payment._id,
                title: payment.paymentFor === 'student_fee'
                    ? `Student payment - ${payment.studentId?.firstName ?? ''} ${payment.studentId?.lastName ?? ''}`.trim()
                    : `Salary payment - ${payment.payeeUserId?.name ?? 'Employee'}`,
                amount: payment.paymentFor === 'student_fee'
                    ? Number(payment.netAmount ?? payment.amount ?? 0)
                    : -Math.abs(Number(payment.grossAmount ?? payment.amount ?? 0)),
                category: payment.paymentFor === 'student_fee' ? 'student_payment' : 'salary_payment',
                date: payment.paymentDate,
                source: 'payment',
                referenceNumber: payment.referenceNumber ?? '',
                notes: payment.notes ?? '',
                status: payment.status ?? 'completed'
            })),
            ...financeEntries.map((entry) => ({
                id: entry._id,
                title: entry.title,
                amount: entry.amount,
                category: entry.category,
                date: entry.date,
                source: entry.source,
                notes: entry.notes ?? '',
                status: 'completed'
            })),
            ...expenses.map((entry) => ({
                id: entry._id,
                title: entry.title,
                amount: -Math.abs(entry.amount),
                category: entry.category,
                date: entry.date,
                source: 'expense',
                notes: entry.notes ?? '',
                status: 'completed'
            }))
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const paginatedItems = items.slice((page - 1) * limit, page * limit);
        res.json((0, response_1.createResponse)(paginatedItems, '', { page, limit, total: items.length }));
    }
    catch (error) {
        next(error);
    }
});
exports.financeRouter = router;
