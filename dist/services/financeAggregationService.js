"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinanceAggregationService = void 0;
exports.buildFinanceBranchFilter = buildFinanceBranchFilter;
const mongoose_1 = __importDefault(require("mongoose"));
const Branch_1 = require("../models/Branch");
const Class_1 = require("../models/Class");
const Expense_1 = require("../models/Expense");
const FinanceEntry_1 = require("../models/FinanceEntry");
const Payment_1 = require("../models/Payment");
const Salary_1 = require("../models/Salary");
const SalaryRecord_1 = require("../models/SalaryRecord");
const SalaryTransaction_1 = require("../models/SalaryTransaction");
const afghanistanSalaryTaxService_1 = require("./afghanistanSalaryTaxService");
const Student_1 = require("../models/Student");
const Subject_1 = require("../models/Subject");
const User_1 = require("../models/User");
const teacherCompensationService_1 = require("./teacherCompensationService");
const ACTIVE_PAYMENT_STATUSES = ['completed', 'paid'];
const EXCLUDED_COMMISSION_STATUSES = ['cancelled'];
function buildDateRange(query, field) {
    const range = {};
    if (query.startDate)
        range.$gte = new Date(String(query.startDate));
    if (query.endDate) {
        const end = new Date(String(query.endDate));
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
    }
    return Object.keys(range).length ? { [field]: range } : {};
}
function buildFinanceBranchFilter(query, scopedBranchId) {
    const requestedBranchId = query.branchId ? String(query.branchId) : '';
    const effectiveBranchId = scopedBranchId || requestedBranchId;
    if (!effectiveBranchId || !mongoose_1.default.Types.ObjectId.isValid(effectiveBranchId)) {
        return {};
    }
    return { branchId: new mongoose_1.default.Types.ObjectId(effectiveBranchId) };
}
function buildMonths(start, count) {
    return Array.from({ length: count }, (_, index) => {
        const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
        return { year: date.getFullYear(), month: date.getMonth() + 1 };
    });
}
function monthKeyFromDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
class FinanceAggregationService {
    paymentIncomeMatch(filters, branchFilter) {
        return {
            isDeleted: false,
            paymentFor: { $in: [null, 'student_fee'] },
            ...branchFilter,
            ...buildDateRange(filters, 'paymentDate'),
            $or: [
                { status: { $exists: false } },
                { status: { $in: ACTIVE_PAYMENT_STATUSES } }
            ]
        };
    }
    commissionMatch(filters, branchFilter, extra = {}) {
        const match = {
            isDeleted: false,
            status: { $nin: EXCLUDED_COMMISSION_STATUSES },
            source: { $in: ['payment', 'manual'] },
            ...branchFilter,
            ...buildDateRange(filters, 'createdAt'),
            ...extra
        };
        if (filters.teacherId && mongoose_1.default.Types.ObjectId.isValid(filters.teacherId)) {
            match.teacherId = new mongoose_1.default.Types.ObjectId(filters.teacherId);
        }
        if (filters.classId && mongoose_1.default.Types.ObjectId.isValid(filters.classId)) {
            match.classId = new mongoose_1.default.Types.ObjectId(filters.classId);
        }
        if (filters.subjectId && mongoose_1.default.Types.ObjectId.isValid(filters.subjectId)) {
            match.subjectId = new mongoose_1.default.Types.ObjectId(filters.subjectId);
        }
        return match;
    }
    async getSummary(filters, scopedBranchId) {
        const now = new Date();
        const chartStart = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0);
        const branchFilter = buildFinanceBranchFilter(filters, scopedBranchId);
        const paymentMatch = this.paymentIncomeMatch(filters, branchFilter);
        const expenseMatch = {
            isDeleted: false,
            category: { $ne: 'income' },
            ...branchFilter,
            ...buildDateRange(filters, 'date')
        };
        const salaryMatch = {
            isDeleted: false,
            ...branchFilter,
            ...buildDateRange(filters, 'createdAt')
        };
        const commissionMatch = this.commissionMatch(filters, branchFilter);
        const [paymentsTotal, manualIncomeTotal, expenseTotals, pendingPayments, paidInvoices, salaryPaidTotals, salaryPendingTotals, commissionEarnedTotals, commissionPaidTotals, commissionPendingTotals, monthlyPayments, monthlyManualIncome, monthlyExpensesRaw, monthlySalaryPaidRaw, monthlyCommissionPaidRaw, branches, teacherPayableRows] = await Promise.all([
            Payment_1.Payment.aggregate([
                { $match: paymentMatch },
                {
                    $group: {
                        _id: null,
                        total: { $sum: { $ifNull: ['$netAmount', '$amount'] } }
                    }
                }
            ]),
            FinanceEntry_1.FinanceEntry.aggregate([
                { $match: { isDeleted: false, ...branchFilter, ...buildDateRange(filters, 'date') } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            Expense_1.Expense.aggregate([{ $match: expenseMatch }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
            Student_1.Student.aggregate([
                { $match: { isDeleted: false, remainingBalance: { $gt: 0 }, ...branchFilter } },
                { $group: { _id: null, total: { $sum: '$remainingBalance' } } }
            ]),
            Payment_1.Payment.countDocuments(paymentMatch),
            Salary_1.Salary.aggregate([
                { $match: { ...salaryMatch, status: 'paid' } },
                { $group: { _id: null, total: { $sum: '$paidAmount' } } }
            ]),
            Salary_1.Salary.aggregate([
                { $match: { ...salaryMatch, $or: [{ status: 'pending' }, { status: { $exists: false } }] } },
                { $group: { _id: null, total: { $sum: '$netAmount' } } }
            ]),
            SalaryTransaction_1.SalaryTransaction.aggregate([
                { $match: commissionMatch },
                { $group: { _id: null, total: { $sum: '$earnedAmount' } } }
            ]),
            SalaryTransaction_1.SalaryTransaction.aggregate([
                { $match: { ...commissionMatch, status: 'paid' } },
                { $group: { _id: null, total: { $sum: '$earnedAmount' } } }
            ]),
            SalaryTransaction_1.SalaryTransaction.aggregate([
                { $match: { ...commissionMatch, status: { $in: ['pending', 'approved'] } } },
                { $group: { _id: null, total: { $sum: '$earnedAmount' } } }
            ]),
            Payment_1.Payment.aggregate([
                { $match: { ...paymentMatch, paymentDate: { $gte: chartStart } } },
                {
                    $group: {
                        _id: { year: { $year: '$paymentDate' }, month: { $month: '$paymentDate' } },
                        total: { $sum: { $ifNull: ['$netAmount', '$amount'] } }
                    }
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ]),
            FinanceEntry_1.FinanceEntry.aggregate([
                { $match: { isDeleted: false, ...branchFilter, date: { $gte: chartStart } } },
                { $group: { _id: { year: { $year: '$date' }, month: { $month: '$date' } }, total: { $sum: '$amount' } } },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ]),
            Expense_1.Expense.aggregate([
                { $match: { isDeleted: false, category: { $ne: 'income' }, ...branchFilter, date: { $gte: chartStart } } },
                { $group: { _id: { year: { $year: '$date' }, month: { $month: '$date' } }, total: { $sum: '$amount' } } },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ]),
            Salary_1.Salary.aggregate([
                { $match: { isDeleted: false, status: 'paid', ...branchFilter, paidAt: { $gte: chartStart } } },
                { $group: { _id: { year: { $year: '$paidAt' }, month: { $month: '$paidAt' } }, total: { $sum: '$paidAmount' } } },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ]),
            SalaryTransaction_1.SalaryTransaction.aggregate([
                { $match: { ...commissionMatch, status: 'paid', paidAt: { $gte: chartStart } } },
                { $group: { _id: { year: { $year: '$paidAt' }, month: { $month: '$paidAt' } }, total: { $sum: '$earnedAmount' } } },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ]),
            Branch_1.Branch.find({ isDeleted: false, ...(branchFilter.branchId ? { _id: branchFilter.branchId } : {}) }).select('name code').lean(),
            this.getTeacherOverview(filters, scopedBranchId)
        ]);
        const months = buildMonths(chartStart, 6);
        const monthlyIncome = months.map((month) => ({
            year: month.year,
            month: month.month,
            total: (monthlyPayments.find((entry) => entry._id.year === month.year && entry._id.month === month.month)?.total ?? 0) +
                (monthlyManualIncome.find((entry) => entry._id.year === month.year && entry._id.month === month.month)?.total ?? 0)
        }));
        const monthlyExpense = months.map((month) => ({
            year: month.year,
            month: month.month,
            total: monthlyExpensesRaw.find((entry) => entry._id.year === month.year && entry._id.month === month.month)?.total ?? 0
        }));
        const monthlyTeacherSalary = months.map((month) => ({
            year: month.year,
            month: month.month,
            total: (monthlySalaryPaidRaw.find((entry) => entry._id.year === month.year && entry._id.month === month.month)?.total ?? 0) +
                (monthlyCommissionPaidRaw.find((entry) => entry._id.year === month.year && entry._id.month === month.month)?.total ?? 0)
        }));
        const monthlyNetProfit = months.map((month) => {
            const income = monthlyIncome.find((entry) => entry.year === month.year && entry.month === month.month)?.total ?? 0;
            const expense = monthlyExpense.find((entry) => entry.year === month.year && entry.month === month.month)?.total ?? 0;
            const salary = monthlyTeacherSalary.find((entry) => entry.year === month.year && entry.month === month.month)?.total ?? 0;
            return { year: month.year, month: month.month, total: income - expense - salary };
        });
        const paymentsByBranch = await Payment_1.Payment.aggregate([
            { $match: { ...paymentMatch, branchId: { $ne: null } } },
            { $group: { _id: '$branchId', total: { $sum: { $ifNull: ['$netAmount', '$amount'] } } } }
        ]);
        const branchIncome = branches.map((branch) => ({
            branchId: String(branch._id),
            branch: branch.name,
            code: branch.code ?? '',
            total: paymentsByBranch.find((entry) => String(entry._id) === String(branch._id))?.total ?? 0
        }));
        const studentPayments = paymentsTotal[0]?.total ?? 0;
        const manualIncome = manualIncomeTotal[0]?.total ?? 0;
        const totalIncome = studentPayments + manualIncome;
        const totalExpenses = expenseTotals[0]?.total ?? 0;
        const totalTeacherPaidSalary = (salaryPaidTotals[0]?.total ?? 0) + (commissionPaidTotals[0]?.total ?? 0);
        const totalTeacherPendingSalary = (salaryPendingTotals[0]?.total ?? 0) + (commissionPendingTotals[0]?.total ?? 0);
        const totalTeacherPayableSalary = totalTeacherPaidSalary + totalTeacherPendingSalary;
        const netProfit = totalIncome - totalExpenses - totalTeacherPayableSalary;
        return {
            totalIncome,
            studentPayments,
            manualIncome,
            totalExpenses,
            totalTeacherPaidSalary,
            totalTeacherPendingSalary,
            totalTeacherPayableSalary,
            teacherCommissionEarned: commissionEarnedTotals[0]?.total ?? 0,
            teacherSalaryPayments: totalTeacherPaidSalary,
            netProfit,
            monthlyIncome,
            monthlyExpense,
            monthlyTeacherSalary,
            monthlyNetProfit,
            monthlyRevenue: monthlyIncome,
            monthlyExpenses: monthlyExpense,
            monthlyPendingBalances: [],
            salaryPayoutTrend: monthlyTeacherSalary,
            pendingPayments: pendingPayments[0]?.total ?? 0,
            paidInvoices,
            branchIncome,
            teachers: teacherPayableRows
        };
    }
    async getTeacherOverview(filters, scopedBranchId) {
        const branchFilter = buildFinanceBranchFilter(filters, scopedBranchId);
        const teacherFilter = {
            role: 'teacher',
            isDeleted: false,
            active: { $ne: false },
            ...branchFilter
        };
        if (filters.teacherId && mongoose_1.default.Types.ObjectId.isValid(filters.teacherId)) {
            teacherFilter._id = new mongoose_1.default.Types.ObjectId(filters.teacherId);
        }
        const teachers = await User_1.User.find(teacherFilter)
            .select('name email branchId salaryType fixedSalary percentageRate customPercentage walletBalance totalSalaryEarned assignedClasses assignedSubjects')
            .lean();
        const teacherIds = teachers.map((teacher) => teacher._id);
        const commissionMatch = this.commissionMatch(filters, branchFilter, { teacherId: { $in: teacherIds } });
        const commissionTransactions = await SalaryTransaction_1.SalaryTransaction.find(commissionMatch).select('teacherId earnedAmount status').lean();
        const salaryRecords = await Salary_1.Salary.find({
            isDeleted: false,
            employeeId: { $in: teacherIds },
            ...branchFilter,
            ...buildDateRange(filters, 'createdAt')
        }).select('employeeId paidAmount netAmount status').lean();
        const commissionMap = commissionTransactions.reduce((map, row) => {
            const key = String(row.teacherId);
            const current = map.get(key) ?? { totalEarning: 0, paidEarning: 0, pendingEarning: 0 };
            const amount = Number(row.earnedAmount ?? 0);
            current.totalEarning += amount;
            if (row.status === 'paid')
                current.paidEarning += amount;
            if (row.status === 'pending' || row.status === 'approved')
                current.pendingEarning += amount;
            map.set(key, current);
            return map;
        }, new Map());
        const commissionRows = [...commissionMap.entries()].map(([teacherKey, totals]) => ({ _id: teacherKey, ...totals }));
        const salaryMap = salaryRecords.reduce((map, row) => {
            const key = String(row.employeeId);
            const current = map.get(key) ?? { paidAmount: 0, pendingAmount: 0 };
            if (row.status === 'paid')
                current.paidAmount += Number(row.paidAmount ?? 0);
            else
                current.pendingAmount += Number(row.netAmount ?? 0);
            map.set(key, current);
            return map;
        }, new Map());
        const salaryRows = [...salaryMap.entries()].map(([teacherKey, totals]) => ({ _id: teacherKey, ...totals }));
        const [studentCounts, studentPaymentTotals] = await Promise.all([
            Student_1.Student.aggregate([
                { $match: { isDeleted: false, teacherId: { $in: teacherIds }, ...branchFilter } },
                { $group: { _id: '$teacherId', total: { $sum: 1 } } }
            ]),
            teacherCompensationService_1.teacherCompensationService.getAssignedStudentPaymentTotals(teacherIds, {
                startDate: filters.startDate,
                endDate: filters.endDate,
                branchId: branchFilter.branchId
            })
        ]);
        return teachers
            .map((teacher) => {
            const commission = commissionRows.find((row) => String(row._id) === String(teacher._id));
            const salary = salaryRows.find((row) => String(row._id) === String(teacher._id));
            const students = studentCounts.find((row) => String(row._id) === String(teacher._id))?.total ?? 0;
            const fixedSalary = Number(teacher.fixedSalary ?? 0);
            const commissionPercentage = Number(teacher.customPercentage || teacher.percentageRate || 0);
            const salaryMode = (0, teacherCompensationService_1.normalizeSalaryMode)(teacher.salaryType);
            const commissionEarned = Number(commission?.totalEarning ?? 0);
            const paidSalary = Number(salary?.paidAmount ?? 0) + Number(commission?.paidEarning ?? 0);
            const totalPayable = (0, teacherCompensationService_1.calculateTeacherPayable)({
                salaryMode,
                fixedSalaryAmount: fixedSalary,
                commissionEarned
            });
            const unpaidSalary = (0, teacherCompensationService_1.calculateUnpaidPayable)(totalPayable, paidSalary);
            const totalPaidStudentAmount = studentPaymentTotals.get(String(teacher._id)) ?? 0;
            return {
                teacherId: String(teacher._id),
                teacherName: teacher.name,
                email: teacher.email ?? '',
                branchId: teacher.branchId ? String(teacher.branchId) : null,
                salaryMode,
                fixedSalaryAmount: fixedSalary,
                commissionPercentage,
                totalPaidStudentAmount,
                commissionEarned,
                totalEarningFromPayments: commissionEarned,
                totalSalaryPayable: totalPayable,
                paidSalaryAmount: paidSalary,
                unpaidSalaryAmount: unpaidSalary,
                studentCount: students,
                paymentStatus: unpaidSalary > 0 ? 'unpaid' : 'paid'
            };
        })
            .filter((row) => {
            if (!filters.status)
                return true;
            return row.paymentStatus === filters.status;
        });
    }
    async getTeacherDetail(teacherId, filters, scopedBranchId) {
        const teacher = await User_1.User.findOne({ _id: teacherId, role: 'teacher', isDeleted: false })
            .select('name email branchId salaryType fixedSalary percentageRate customPercentage assignedClasses assignedSubjects')
            .lean();
        if (!teacher) {
            throw new Error('Teacher not found');
        }
        const branchFilter = buildFinanceBranchFilter(filters, scopedBranchId);
        const [classes, subjects, students, commissionTransactions, salaryRecords, linkedPayments] = await Promise.all([
            Class_1.ClassModel.find({ _id: { $in: teacher.assignedClasses ?? [] }, isDeleted: false }).select('className name classCode').lean(),
            Subject_1.Subject.find({ _id: { $in: teacher.assignedSubjects ?? [] }, isDeleted: false }).select('title code classId').lean(),
            Student_1.Student.find({ teacherId: teacher._id, isDeleted: false, ...branchFilter }).select('firstName lastName studentId classId subjectId paidAmount remainingBalance').lean(),
            SalaryTransaction_1.SalaryTransaction.find(this.commissionMatch(filters, branchFilter, { teacherId: teacher._id }))
                .populate('studentId', 'firstName lastName studentId')
                .populate('classId', 'className name')
                .populate('subjectId', 'title code')
                .sort({ createdAt: -1 })
                .limit(200)
                .lean(),
            Salary_1.Salary.find({ employeeId: teacher._id, isDeleted: false, ...branchFilter, ...buildDateRange(filters, 'createdAt') })
                .sort({ createdAt: -1 })
                .lean(),
            Payment_1.Payment.find({
                ...this.paymentIncomeMatch(filters, branchFilter),
                studentId: { $in: await Student_1.Student.find({ teacherId: teacher._id, isDeleted: false }).distinct('_id') }
            })
                .populate('studentId', 'firstName lastName studentId')
                .sort({ paymentDate: -1 })
                .limit(200)
                .lean()
        ]);
        const overview = (await this.getTeacherOverview({ ...filters, teacherId }, scopedBranchId))[0];
        const { year: hijriYear, month: hijriMonth } = (0, afghanistanSalaryTaxService_1.getHijriYearMonth)();
        const payrollRecord = await SalaryRecord_1.SalaryRecord.findOne({
            userId: teacher._id,
            hijriYear,
            hijriMonth,
            isDeleted: false
        }).lean();
        const payroll = payrollRecord
            ? {
                hijriYear,
                hijriMonth,
                grossSalary: Number(payrollRecord.grossSalary || 0),
                fixedAmount: Number(payrollRecord.fixedAmount || 0),
                commissionAmount: Number(payrollRecord.commissionAmount || 0),
                totalStudentPaymentsUsed: Number(payrollRecord.totalStudentPaymentsUsed || 0),
                percentageUsed: Number(payrollRecord.percentageUsed || 0),
                taxAmount: Number(payrollRecord.taxAmount || 0),
                netSalary: Number(payrollRecord.netSalary || 0),
                taxCategory: payrollRecord.taxCategory || '',
                taxExplanation: payrollRecord.taxExplanation || '',
                paymentStatus: payrollRecord.paymentStatus || 'unpaid'
            }
            : null;
        return {
            teacher: {
                teacherId: String(teacher._id),
                teacherName: teacher.name,
                email: teacher.email ?? '',
                salaryMode: (0, teacherCompensationService_1.normalizeSalaryMode)(teacher.salaryType),
                fixedSalaryAmount: Number(teacher.fixedSalary ?? 0),
                commissionPercentage: Number(teacher.customPercentage || teacher.percentageRate || 0)
            },
            overview: {
                ...overview,
                payrollGrossSalary: payroll?.grossSalary ?? 0,
                payrollTaxAmount: payroll?.taxAmount ?? 0,
                payrollNetSalary: payroll?.netSalary ?? 0,
                payrollPercentageUsed: payroll?.percentageUsed ?? Number(teacher.customPercentage || teacher.percentageRate || 0),
                payrollStudentFeeTotal: payroll?.totalStudentPaymentsUsed ?? 0
            },
            payroll,
            assignedClasses: classes.map((item) => ({
                id: String(item._id),
                name: item.className ?? item.name ?? ''
            })),
            assignedSubjects: subjects.map((item) => ({
                id: String(item._id),
                title: item.title ?? '',
                code: item.code ?? ''
            })),
            students: students.map((student) => ({
                id: String(student._id),
                name: `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim(),
                studentCode: student.studentId ?? '',
                paidAmount: Number(student.paidAmount ?? 0),
                remainingBalance: Number(student.remainingBalance ?? 0)
            })),
            commissionTransactions,
            salaryRecords,
            linkedPayments: linkedPayments.map((payment) => ({
                id: String(payment._id),
                amount: Number(payment.amount ?? 0),
                paymentDate: payment.paymentDate,
                studentName: `${payment.studentId?.firstName ?? ''} ${payment.studentId?.lastName ?? ''}`.trim(),
                referenceNumber: payment.referenceNumber ?? '',
                status: payment.status ?? 'completed'
            }))
        };
    }
    async getTeacherSelfEarnings(userId, filters = {}) {
        return this.getTeacherDetail(userId, { ...filters, teacherId: userId });
    }
    buildMonthKey(date = new Date()) {
        return monthKeyFromDate(date);
    }
}
exports.FinanceAggregationService = FinanceAggregationService;
