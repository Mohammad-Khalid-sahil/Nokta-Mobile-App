"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const Attendance_1 = require("../../models/Attendance");
const AuditLog_1 = require("../../models/AuditLog");
const Branch_1 = require("../../models/Branch");
const Class_1 = require("../../models/Class");
const Exam_1 = require("../../models/Exam");
const Expense_1 = require("../../models/Expense");
const FinanceEntry_1 = require("../../models/FinanceEntry");
const Payment_1 = require("../../models/Payment");
const Report_1 = require("../../models/Report");
const Result_1 = require("../../models/Result");
const Salary_1 = require("../../models/Salary");
const StationerySale_1 = require("../../models/StationerySale");
const Student_1 = require("../../models/Student");
const Subject_1 = require("../../models/Subject");
const User_1 = require("../../models/User");
const Message_1 = require("../../models/Message");
const router = (0, express_1.Router)();
const reportSchema = joi_1.default.object({
    body: joi_1.default.object({
        type: joi_1.default.string().valid('financial', 'attendance', 'academic', 'security', 'operations', 'messages').required(),
        periodKey: joi_1.default.string().allow('', null).optional(),
        branchId: joi_1.default.string().hex().length(24).optional()
    })
});
async function buildReportData(type, branchId) {
    const branchFilter = branchId ? { branchId } : {};
    if (type === 'financial') {
        const [payments, expenses, salaries, stationerySales] = await Promise.all([
            Payment_1.Payment.aggregate([{ $match: { isDeleted: false, ...branchFilter } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
            Expense_1.Expense.aggregate([{ $match: { isDeleted: false, category: { $ne: 'income' }, ...branchFilter } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
            Salary_1.Salary.aggregate([{ $match: { isDeleted: false, ...branchFilter } }, { $group: { _id: null, total: { $sum: '$netAmount' } } }]),
            StationerySale_1.StationerySale.aggregate([{ $match: { isDeleted: false, ...branchFilter } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }])
        ]);
        return {
            totalPayments: payments[0]?.total ?? 0,
            totalExpenses: expenses[0]?.total ?? 0,
            totalSalaries: salaries[0]?.total ?? 0,
            totalStationerySales: stationerySales[0]?.total ?? 0
        };
    }
    if (type === 'attendance') {
        const [present, absent, late, suspendedStudents] = await Promise.all([
            Attendance_1.Attendance.countDocuments({ status: 'present', isDeleted: false, ...branchFilter }),
            Attendance_1.Attendance.countDocuments({ status: 'absent', isDeleted: false, ...branchFilter }),
            Attendance_1.Attendance.countDocuments({ status: 'late', isDeleted: false, ...branchFilter }),
            Student_1.Student.countDocuments({ status: 'suspended', isDeleted: false, ...branchFilter })
        ]);
        return { present, absent, late, suspendedStudents };
    }
    if (type === 'academic') {
        const [students, teachers, classes, subjects] = await Promise.all([
            Student_1.Student.countDocuments({ isDeleted: false, ...branchFilter }),
            User_1.User.countDocuments({ role: 'teacher', isDeleted: false, ...branchFilter }),
            Class_1.ClassModel.countDocuments({ isDeleted: false, ...branchFilter }),
            Subject_1.Subject.countDocuments({ isDeleted: false, ...branchFilter })
        ]);
        return { students, teachers, classes, subjects };
    }
    if (type === 'messages') {
        const [total, unread, students, teachers, customers] = await Promise.all([
            Message_1.Message.countDocuments({ isDeleted: false, ...branchFilter }),
            Message_1.Message.countDocuments({ isDeleted: false, status: 'unread', ...branchFilter }),
            Message_1.Message.countDocuments({ isDeleted: false, category: 'student', ...branchFilter }),
            Message_1.Message.countDocuments({ isDeleted: false, category: 'teacher', ...branchFilter }),
            Message_1.Message.countDocuments({ isDeleted: false, category: 'customer', ...branchFilter })
        ]);
        return { total, unread, students, teachers, customers };
    }
    if (type === 'security') {
        const [auditEntries, lockedUsers, sessionsRevoked] = await Promise.all([
            AuditLog_1.AuditLog.countDocuments({ isDeleted: false, ...branchFilter }),
            User_1.User.countDocuments({ status: 'locked', isDeleted: false, ...branchFilter }),
            AuditLog_1.AuditLog.countDocuments({ action: { $regex: 'AUTH_LOGOUT|PASSWORD_RESET' }, isDeleted: false, ...branchFilter })
        ]);
        return { auditEntries, lockedUsers, sessionsRevoked };
    }
    const [students, teachers, classes, notifications] = await Promise.all([
        Student_1.Student.countDocuments({ isDeleted: false, ...branchFilter }),
        User_1.User.countDocuments({ role: 'teacher', isDeleted: false, ...branchFilter }),
        Class_1.ClassModel.countDocuments({ isDeleted: false, ...branchFilter }),
        AuditLog_1.AuditLog.countDocuments({ action: { $regex: 'NOTIFICATION' }, isDeleted: false, ...branchFilter })
    ]);
    return { students, teachers, classes, notifications };
}
router.use(auth_1.authenticate);
router.get('/', (0, auth_1.authorize)(['super_admin', 'admin', 'owner', 'branch_manager']), async (req, res, next) => {
    try {
        const reports = await Report_1.Report.find({ isDeleted: false }).sort({ createdAt: -1 }).lean();
        res.json((0, response_1.createResponse)(reports));
    }
    catch (error) {
        next(error);
    }
});
router.get('/analytics', (0, auth_1.authorize)(['super_admin', 'admin', 'owner', 'branch_manager']), async (req, res, next) => {
    try {
        const branchId = req.user?.canonicalRole === 'branch_manager' ? req.user.branchId : req.query.branchId;
        const branchFilter = branchId ? { branchId } : {};
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0);
        const months = Array.from({ length: 6 }, (_, index) => {
            const date = new Date(startDate.getFullYear(), startDate.getMonth() + index, 1);
            return { year: date.getFullYear(), month: date.getMonth() + 1, label: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` };
        });
        const [totalStudents, totalTeachers, totalClasses, totalExams, totalResults, totalBranches, totalIncome, paymentTotal, manualIncomeTotal, expenseTotal, salaryTotal, attendanceSummary, pendingPayments, studentGrowthRaw, paymentGrowthRaw, expenseGrowthRaw, attendanceTrendRaw, expenseCategoryBreakdown] = await Promise.all([
            Student_1.Student.countDocuments({ isDeleted: false, ...branchFilter }),
            User_1.User.countDocuments({ role: 'teacher', isDeleted: false, ...branchFilter }),
            Class_1.ClassModel.countDocuments({ isDeleted: false, ...branchFilter }),
            Exam_1.Exam.countDocuments({ isDeleted: false, ...branchFilter }),
            Result_1.Result.countDocuments({ isDeleted: false, ...branchFilter }),
            branchId ? Promise.resolve(1) : Branch_1.Branch.countDocuments({ isDeleted: false }),
            Payment_1.Payment.aggregate([{ $match: { isDeleted: false, ...branchFilter } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
            Payment_1.Payment.aggregate([{ $match: { isDeleted: false, ...branchFilter } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
            FinanceEntry_1.FinanceEntry.aggregate([{ $match: { isDeleted: false, ...branchFilter } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
            Expense_1.Expense.aggregate([{ $match: { isDeleted: false, category: { $ne: 'income' }, ...branchFilter } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
            Salary_1.Salary.aggregate([{ $match: { isDeleted: false, ...branchFilter } }, { $group: { _id: null, total: { $sum: '$netAmount' } } }]),
            Attendance_1.Attendance.aggregate([{ $match: { isDeleted: false, ...branchFilter } }, { $group: { _id: '$status', total: { $sum: 1 } } }]),
            Student_1.Student.aggregate([{ $match: { isDeleted: false, remainingBalance: { $gt: 0 }, ...branchFilter } }, { $group: { _id: null, total: { $sum: '$remainingBalance' } } }]),
            Student_1.Student.aggregate([
                { $match: { isDeleted: false, createdAt: { $gte: startDate }, ...branchFilter } },
                { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, total: { $sum: 1 } } }
            ]),
            Payment_1.Payment.aggregate([
                { $match: { isDeleted: false, paymentDate: { $gte: startDate }, ...branchFilter } },
                { $group: { _id: { year: { $year: '$paymentDate' }, month: { $month: '$paymentDate' } }, total: { $sum: '$amount' } } }
            ]),
            Expense_1.Expense.aggregate([
                { $match: { isDeleted: false, category: { $ne: 'income' }, date: { $gte: startDate }, ...branchFilter } },
                { $group: { _id: { year: { $year: '$date' }, month: { $month: '$date' } }, total: { $sum: '$amount' } } }
            ]),
            Attendance_1.Attendance.aggregate([
                { $match: { isDeleted: false, attendanceDate: { $gte: startDate }, ...branchFilter } },
                {
                    $group: {
                        _id: { year: { $year: '$attendanceDate' }, month: { $month: '$attendanceDate' }, status: '$status' },
                        total: { $sum: 1 }
                    }
                }
            ]),
            Expense_1.Expense.aggregate([
                { $match: { isDeleted: false, category: { $ne: 'income' }, ...branchFilter } },
                { $group: { _id: '$category', total: { $sum: '$amount' } } },
                { $sort: { total: -1 } },
                { $limit: 6 }
            ])
        ]);
        res.json((0, response_1.createResponse)({
            cards: {
                totalStudents,
                totalTeachers,
                totalClasses,
                totalExams,
                totalResults,
                totalBranches,
                totalIncome: (totalIncome[0]?.total ?? 0) + (manualIncomeTotal[0]?.total ?? 0),
                monthlyRevenue: (paymentTotal[0]?.total ?? 0) + (manualIncomeTotal[0]?.total ?? 0),
                monthlyExpenses: (expenseTotal[0]?.total ?? 0) + (salaryTotal[0]?.total ?? 0),
                attendanceSummary: attendanceSummary.reduce((acc, item) => {
                    acc[item._id] = item.total;
                    return acc;
                }, {}),
                paymentSummary: {
                    totalCollected: paymentTotal[0]?.total ?? 0,
                    pending: pendingPayments[0]?.total ?? 0
                }
            },
            charts: {
                studentGrowth: months.map((month) => ({
                    label: month.label,
                    total: studentGrowthRaw.find((entry) => entry._id.year === month.year && entry._id.month === month.month)?.total ?? 0
                })),
                paymentGrowth: months.map((month) => ({
                    label: month.label,
                    total: paymentGrowthRaw.find((entry) => entry._id.year === month.year && entry._id.month === month.month)?.total ?? 0
                })),
                expenseComparison: months.map((month) => ({
                    label: month.label,
                    total: expenseGrowthRaw.find((entry) => entry._id.year === month.year && entry._id.month === month.month)?.total ?? 0
                })),
                attendanceTrend: months.map((month) => ({
                    label: month.label,
                    present: attendanceTrendRaw.find((entry) => entry._id.year === month.year && entry._id.month === month.month && entry._id.status === 'present')?.total ?? 0,
                    absent: attendanceTrendRaw.find((entry) => entry._id.year === month.year && entry._id.month === month.month && entry._id.status === 'absent')?.total ?? 0,
                    late: attendanceTrendRaw.find((entry) => entry._id.year === month.year && entry._id.month === month.month && entry._id.status === 'late')?.total ?? 0
                })),
                expenseBreakdown: expenseCategoryBreakdown.map((entry) => ({
                    category: entry._id,
                    total: entry.total
                }))
            }
        }));
    }
    catch (error) {
        next(error);
    }
});
router.post('/generate', (0, auth_1.authorize)(['super_admin', 'admin', 'owner', 'branch_manager', 'system_automation']), (0, validate_1.validate)(reportSchema), async (req, res, next) => {
    try {
        const reportData = await buildReportData(req.body.type, req.body.branchId ?? req.user?.branchId ?? null);
        const report = await Report_1.Report.create({
            branchId: req.body.branchId ?? req.user?.branchId ?? null,
            generatedBy: req.user?.userId ?? null,
            type: req.body.type,
            title: `${req.body.type} report`,
            periodKey: req.body.periodKey ?? new Date().toISOString().slice(0, 7),
            data: reportData,
            status: 'generated'
        });
        res.status(201).json((0, response_1.createResponse)(report, 'Report generated successfully'));
    }
    catch (error) {
        next(error);
    }
});
exports.reportRouter = router;
