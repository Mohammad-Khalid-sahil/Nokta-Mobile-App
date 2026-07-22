"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.expenseRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const Expense_1 = require("../../models/Expense");
const Salary_1 = require("../../models/Salary");
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const pagination_1 = require("../../validators/pagination");
const router = (0, express_1.Router)();
const expenseSchema = joi_1.default.object({
    body: joi_1.default.object({
        title: joi_1.default.string().required(),
        amount: joi_1.default.number().positive().required(),
        category: joi_1.default.string().required(),
        date: joi_1.default.date().optional(),
        notes: joi_1.default.string().allow('', null)
    })
});
router.use(auth_1.authenticate, (0, auth_1.authorize)(['super_admin', 'admin', 'accountant', 'branch_manager', 'owner']));
router.post('/', (0, validate_1.validate)(expenseSchema), async (req, res, next) => {
    try {
        if (String(req.body.category).toLowerCase() === 'income') {
            return res.status(400).json((0, response_1.createError)('Income entries are not allowed in the expense module'));
        }
        const expense = await Expense_1.Expense.create(req.body);
        res.status(201).json((0, response_1.createResponse)(expense, 'Expense recorded'));
    }
    catch (error) {
        next(error);
    }
});
router.get('/summary', async (_req, res, next) => {
    try {
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0);
        const [expenseTotals, salaryTotals, monthlyExpenses, categoryBreakdown] = await Promise.all([
            Expense_1.Expense.aggregate([
                { $match: { isDeleted: false, category: { $ne: 'income' } } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            Salary_1.Salary.aggregate([
                { $match: { isDeleted: false } },
                { $group: { _id: null, total: { $sum: '$netAmount' } } }
            ]),
            Expense_1.Expense.aggregate([
                { $match: { isDeleted: false, category: { $ne: 'income' }, date: { $gte: startDate } } },
                {
                    $group: {
                        _id: {
                            year: { $year: '$date' },
                            month: { $month: '$date' }
                        },
                        total: { $sum: '$amount' }
                    }
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ]),
            Expense_1.Expense.aggregate([
                { $match: { isDeleted: false, category: { $ne: 'income' } } },
                { $group: { _id: '$category', total: { $sum: '$amount' } } },
                { $sort: { total: -1 } }
            ])
        ]);
        res.json((0, response_1.createResponse)({
            totalExpenses: expenseTotals[0]?.total ?? 0,
            teacherSalaries: salaryTotals[0]?.total ?? 0,
            monthlyExpenses: monthlyExpenses.map((entry) => ({
                year: entry._id.year,
                month: entry._id.month,
                total: entry.total
            })),
            categories: categoryBreakdown.map((entry) => ({
                category: entry._id,
                total: entry.total
            }))
        }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/', (0, validate_1.validate)(pagination_1.paginationSchema), async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        const [expenses, total] = await Promise.all([
            Expense_1.Expense.find({ isDeleted: false, category: { $ne: 'income' } }).lean().sort({ date: -1 }).skip((page - 1) * limit).limit(limit),
            Expense_1.Expense.countDocuments({ isDeleted: false, category: { $ne: 'income' } })
        ]);
        res.json((0, response_1.createResponse)(expenses, '', { page, limit, total }));
    }
    catch (error) {
        next(error);
    }
});
exports.expenseRouter = router;
