"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCommissionScopeNote = buildCommissionScopeNote;
exports.sumCommissionBaseForEmployee = sumCommissionBaseForEmployee;
exports.sumPaymentsForScope = sumPaymentsForScope;
exports.calculateSalaryRecord = calculateSalaryRecord;
exports.ensureSalaryRecordsForPeriod = ensureSalaryRecordsForPeriod;
const Payment_1 = require("../models/Payment");
const SalaryRecord_1 = require("../models/SalaryRecord");
const SalarySetting_1 = require("../models/SalarySetting");
const Student_1 = require("../models/Student");
const User_1 = require("../models/User");
const afghanistanSalaryTaxService_1 = require("./afghanistanSalaryTaxService");
function sumPaymentsInHijriMonth(payments, hijriYear, hijriMonth) {
    return payments.reduce((sum, payment) => {
        const { year, month } = (0, afghanistanSalaryTaxService_1.getHijriYearMonth)(payment.paymentDate);
        if (year === hijriYear && month === hijriMonth) {
            return sum + Number(payment.amount || 0);
        }
        return sum;
    }, 0);
}
function buildCommissionScopeNote(scope, studentCount, percentage, baseTotal, commissionAmount) {
    if (scope === 'teacher_assigned_students') {
        return `فیصدی ${percentage}% از فیس ${studentCount} شاگرد اختصاصی این استاد (مجموع فیس ماه: ${baseTotal.toFixed(2)} افغانی → سهم معاش: ${commissionAmount.toFixed(2)} افغانی).`;
    }
    if (scope === 'branch_all_students') {
        return `فیصدی ${percentage}% از مجموع فیس تمام شاگردان این نماینده‌گی در این ماه (مجموع فیس: ${baseTotal.toFixed(2)} → سهم معاش مدیر: ${commissionAmount.toFixed(2)} افغانی).`;
    }
    return `فیصدی ${percentage}% از مجموع فیس تمام شاگردان سیستم در این ماه (مجموع فیس: ${baseTotal.toFixed(2)} → سهم معاش: ${commissionAmount.toFixed(2)} افغانی).`;
}
async function sumCommissionBaseForEmployee(args) {
    const paymentFilter = {
        isDeleted: false,
        paymentFor: 'student_fee',
        status: { $in: ['completed', 'paid'] }
    };
    const isTeacher = args.setting.role === 'teacher' || args.user.role === 'teacher';
    if (isTeacher) {
        const branchId = args.setting.branchId ?? args.user.branchId ?? null;
        const studentFilter = {
            teacherId: args.user._id,
            isDeleted: false
        };
        if (branchId)
            studentFilter.branchId = branchId;
        const students = await Student_1.Student.find(studentFilter).select('_id').lean();
        const studentIds = students.map((student) => student._id);
        if (!studentIds.length) {
            return { total: 0, scope: 'teacher_assigned_students', assignedStudentCount: 0 };
        }
        const payments = await Payment_1.Payment.find({
            ...paymentFilter,
            studentId: { $in: studentIds }
        })
            .select('amount paymentDate')
            .lean();
        return {
            total: sumPaymentsInHijriMonth(payments, args.hijriYear, args.hijriMonth),
            scope: 'teacher_assigned_students',
            assignedStudentCount: studentIds.length
        };
    }
    const allSystem = args.setting.percentageScope === 'all_system';
    if (!allSystem) {
        const branchId = args.setting.branchId ?? args.user.branchId ?? null;
        if (branchId)
            paymentFilter.branchId = branchId;
    }
    const payments = await Payment_1.Payment.find(paymentFilter).select('amount paymentDate').lean();
    return {
        total: sumPaymentsInHijriMonth(payments, args.hijriYear, args.hijriMonth),
        scope: allSystem ? 'system_all_students' : 'branch_all_students',
        assignedStudentCount: 0
    };
}
/** @deprecated Use sumCommissionBaseForEmployee — kept for compatibility */
async function sumPaymentsForScope(args) {
    const paymentFilter = {
        isDeleted: false,
        paymentFor: 'student_fee',
        status: { $in: ['completed', 'paid'] },
        ...(args.includeAllSystem ? {} : { branchId: args.branchId ?? null })
    };
    const payments = await Payment_1.Payment.find(paymentFilter).select('amount paymentDate').lean();
    return sumPaymentsInHijriMonth(payments, args.hijriYear, args.hijriMonth);
}
async function calculateSalaryRecord(args) {
    const user = await User_1.User.findOne({ _id: args.userId, isDeleted: false }).lean();
    if (!user)
        throw new Error('کاربر پیدا نشد');
    const setting = args.settingOverride
        ?? await SalarySetting_1.SalarySetting.findOne({ userId: user._id, isActive: true, isDeleted: false }).sort({ updatedAt: -1 }).lean();
    if (!setting)
        throw new Error('تنظیمات معاش برای این کاربر ثبت نشده است');
    const isManagerRole = setting.role === 'manager' || setting.role === 'admin'
        || ['admin', 'branch_manager', 'owner'].includes(String(user.role));
    if (isManagerRole && setting.percentageScope === 'all_system' && !args.allowAllSystemScope) {
        throw new Error('محاسبه فیصدی کل سیستم فقط با اجازه سوپر ادمین ممکن است');
    }
    const existing = await SalaryRecord_1.SalaryRecord.findOne({
        userId: user._id,
        hijriYear: args.hijriYear,
        hijriMonth: args.hijriMonth,
        isDeleted: false
    });
    if (existing && !args.forceRecalculate) {
        return existing.toObject();
    }
    const commissionBase = setting.salaryType === 'fixed'
        ? { total: 0, scope: 'teacher_assigned_students', assignedStudentCount: 0 }
        : await sumCommissionBaseForEmployee({
            user,
            setting,
            hijriYear: args.hijriYear,
            hijriMonth: args.hijriMonth
        });
    const totalPayments = commissionBase.total;
    const fixedAmount = Number(setting.fixedAmount || 0);
    const percentage = Number(setting.percentage || 0);
    const commissionAmount = Number(((totalPayments * percentage) / 100).toFixed(2));
    const grossSalary = setting.salaryType === 'fixed'
        ? fixedAmount
        : setting.salaryType === 'percentage'
            ? commissionAmount
            : fixedAmount + commissionAmount;
    const tax = await (0, afghanistanSalaryTaxService_1.calculateAfghanistanSalaryTax)(grossSalary);
    const commissionNote = setting.salaryType === 'fixed'
        ? ''
        : buildCommissionScopeNote(commissionBase.scope, commissionBase.assignedStudentCount, percentage, totalPayments, commissionAmount);
    const payload = {
        userId: user._id,
        role: setting.role,
        branchId: setting.branchId ?? user.branchId ?? null,
        hijriYear: args.hijriYear,
        hijriMonth: args.hijriMonth,
        quarter: Math.ceil(Number(args.hijriMonth) / 3),
        grossSalary: tax.grossSalary,
        fixedAmount,
        commissionAmount,
        totalStudentPaymentsUsed: Number(totalPayments.toFixed(2)),
        percentageUsed: percentage,
        taxAmount: tax.taxAmount,
        netSalary: tax.netSalary,
        taxCategory: tax.taxCategory,
        taxExplanation: [tax.explanation, commissionNote].filter(Boolean).join(' '),
        taxFormula: tax.formula,
        isTaxExempt: tax.isTaxExempt,
        paymentStatus: existing?.paymentStatus ?? 'unpaid',
        taxStatus: existing?.taxStatus ?? 'pending',
        calculatedAt: new Date(),
        paidAt: existing?.paidAt ?? null,
        createdBy: args.actorId ?? null
    };
    const record = existing
        ? await SalaryRecord_1.SalaryRecord.findByIdAndUpdate(existing._id, { $set: payload }, { new: true })
        : await SalaryRecord_1.SalaryRecord.create(payload);
    return record?.toObject?.() ?? record;
}
async function ensureSalaryRecordsForPeriod(args) {
    const settingsFilter = { isDeleted: false, isActive: true };
    if (args.branchId)
        settingsFilter.branchId = args.branchId;
    if (args.role && args.role !== 'all')
        settingsFilter.role = args.role;
    const activeSettings = await SalarySetting_1.SalarySetting.find(settingsFilter).select('userId').lean();
    if (!activeSettings.length)
        return;
    await Promise.all(activeSettings.map(async (setting) => {
        try {
            await calculateSalaryRecord({
                userId: String(setting.userId),
                hijriYear: args.hijriYear,
                hijriMonth: args.hijriMonth,
                actorId: args.actorId ?? null,
                allowAllSystemScope: true,
                forceRecalculate: true
            });
        }
        catch {
            // Skip invalid rows so one bad salary setting does not break payroll.
        }
    }));
}
