"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.teacherCompensationService = exports.TeacherCompensationService = exports.EXCLUDED_PAYMENT_STATUSES = exports.ELIGIBLE_PAYMENT_STATUSES = void 0;
exports.normalizeSalaryMode = normalizeSalaryMode;
exports.isEligiblePaymentStatus = isEligiblePaymentStatus;
exports.isExcludedPaymentStatus = isExcludedPaymentStatus;
exports.resolveCommissionPercentage = resolveCommissionPercentage;
exports.earnsCommission = earnsCommission;
exports.calculateCommissionAmount = calculateCommissionAmount;
exports.calculateTeacherPayable = calculateTeacherPayable;
exports.calculateUnpaidPayable = calculateUnpaidPayable;
const Payment_1 = require("../models/Payment");
const SalaryTransaction_1 = require("../models/SalaryTransaction");
const Student_1 = require("../models/Student");
const User_1 = require("../models/User");
exports.ELIGIBLE_PAYMENT_STATUSES = ['completed', 'paid'];
exports.EXCLUDED_PAYMENT_STATUSES = ['cancelled', 'refunded', 'pending'];
function normalizeSalaryMode(salaryType) {
    if (salaryType === 'fixed')
        return 'fixed_salary';
    if (salaryType === 'percentage')
        return 'percentage';
    if (salaryType === 'fixed_plus_percentage')
        return 'fixed_plus_percentage';
    if (salaryType === 'fixed_salary')
        return 'fixed_salary';
    return 'fixed_salary';
}
function isEligiblePaymentStatus(status) {
    if (!status)
        return true;
    return exports.ELIGIBLE_PAYMENT_STATUSES.includes(status);
}
function isExcludedPaymentStatus(status) {
    if (!status)
        return false;
    return exports.EXCLUDED_PAYMENT_STATUSES.includes(status);
}
function resolveCommissionPercentage(teacher) {
    const custom = Number(teacher.customPercentage ?? 0);
    if (custom > 0)
        return custom;
    return Number(teacher.percentageRate ?? 0);
}
function earnsCommission(salaryType) {
    const mode = normalizeSalaryMode(salaryType);
    return mode === 'percentage' || mode === 'fixed_plus_percentage';
}
function calculateCommissionAmount(paidAmount, percentage) {
    const amount = Number(paidAmount || 0);
    const rate = Number(percentage || 0);
    if (amount <= 0 || rate <= 0)
        return 0;
    return Number(((amount * rate) / 100).toFixed(2));
}
function calculateTeacherPayable(input) {
    const mode = normalizeSalaryMode(String(input.salaryMode));
    const fixed = mode === 'fixed_salary' || mode === 'fixed_plus_percentage' ? Number(input.fixedSalaryAmount || 0) : 0;
    const commission = mode === 'percentage' || mode === 'fixed_plus_percentage' ? Number(input.commissionEarned || 0) : 0;
    return Number((fixed + commission).toFixed(2));
}
function calculateUnpaidPayable(totalPayable, paidAmount) {
    return Math.max(0, Number((totalPayable - paidAmount).toFixed(2)));
}
class TeacherCompensationService {
    async recordPaymentCommission(params) {
        const { payment, student, teacher } = params;
        if (!isEligiblePaymentStatus(payment.status) || isExcludedPaymentStatus(payment.status)) {
            return null;
        }
        if (!earnsCommission(teacher.salaryType)) {
            return null;
        }
        const percentage = resolveCommissionPercentage(teacher);
        const earnedAmount = calculateCommissionAmount(Number(payment.amount || 0), percentage);
        if (earnedAmount <= 0) {
            return null;
        }
        const paymentDate = payment.paymentDate ? new Date(payment.paymentDate) : new Date();
        const salaryMode = normalizeSalaryMode(teacher.salaryType);
        const existing = await SalaryTransaction_1.SalaryTransaction.findOne({
            paymentId: payment._id,
            isDeleted: false
        }).lean();
        const transaction = await SalaryTransaction_1.SalaryTransaction.findOneAndUpdate({ paymentId: payment._id }, {
            teacherId: teacher._id,
            studentId: student._id,
            subjectId: student.subjectId,
            classId: student.classId,
            branchId: payment.branchId ?? student.branchId ?? null,
            paymentId: payment._id,
            feeAmount: Number(payment.amount || 0),
            percentage,
            earnedAmount,
            salaryType: salaryMode === 'fixed_plus_percentage' ? 'fixed_plus_percentage' : 'percentage',
            source: 'payment',
            month: paymentDate.getMonth() + 1,
            year: paymentDate.getFullYear(),
            status: 'approved',
            paymentReference: payment.referenceNumber || `INV-${String(payment._id).slice(-8).toUpperCase()}`,
            createdBy: params.createdBy ?? null
        }, { upsert: true, new: true, setDefaultsOnInsert: true });
        const previousEarned = Number(existing?.earnedAmount ?? 0);
        const delta = earnedAmount - previousEarned;
        if (delta !== 0) {
            await User_1.User.findByIdAndUpdate(teacher._id, {
                $inc: {
                    walletBalance: delta,
                    totalSalaryEarned: delta
                }
            });
        }
        return transaction;
    }
    async getAssignedStudentPaymentTotals(teacherIds, filters) {
        if (!teacherIds.length) {
            return new Map();
        }
        const studentFilter = {
            isDeleted: false,
            teacherId: { $in: teacherIds }
        };
        if (filters.branchId) {
            studentFilter.branchId = filters.branchId;
        }
        const students = await Student_1.Student.find(studentFilter).select('_id teacherId').lean();
        if (!students.length) {
            return new Map();
        }
        const studentTeacherMap = new Map(students.map((student) => [String(student._id), String(student.teacherId)]));
        const paymentMatch = {
            isDeleted: false,
            studentId: { $in: students.map((student) => student._id) },
            status: { $in: exports.ELIGIBLE_PAYMENT_STATUSES }
        };
        if (filters.branchId) {
            paymentMatch.branchId = filters.branchId;
        }
        if (filters.startDate || filters.endDate) {
            const range = {};
            if (filters.startDate)
                range.$gte = new Date(String(filters.startDate));
            if (filters.endDate) {
                const end = new Date(String(filters.endDate));
                end.setHours(23, 59, 59, 999);
                range.$lte = end;
            }
            paymentMatch.paymentDate = range;
        }
        const paymentTotals = await Payment_1.Payment.aggregate([
            { $match: paymentMatch },
            { $group: { _id: '$studentId', total: { $sum: '$amount' } } }
        ]);
        const teacherTotals = new Map();
        for (const row of paymentTotals) {
            const teacherKey = studentTeacherMap.get(String(row._id));
            if (!teacherKey)
                continue;
            teacherTotals.set(teacherKey, (teacherTotals.get(teacherKey) ?? 0) + Number(row.total ?? 0));
        }
        return teacherTotals;
    }
}
exports.TeacherCompensationService = TeacherCompensationService;
exports.teacherCompensationService = new TeacherCompensationService();
