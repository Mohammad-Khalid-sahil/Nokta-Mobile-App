import { Payment } from '../models/Payment';
import { SalaryRecord } from '../models/SalaryRecord';
import { SalarySetting } from '../models/SalarySetting';
import { Student } from '../models/Student';
import { User } from '../models/User';
import { calculateAfghanistanSalaryTax, getHijriYearMonth } from './afghanistanSalaryTaxService';

export type CommissionScopeKind = 'teacher_assigned_students' | 'branch_all_students' | 'system_all_students';

function sumPaymentsInHijriMonth(payments: Array<{ amount?: number; paymentDate?: Date }>, hijriYear: number, hijriMonth: number) {
  return payments.reduce((sum, payment) => {
    const { year, month } = getHijriYearMonth(payment.paymentDate);
    if (year === hijriYear && month === hijriMonth) {
      return sum + Number(payment.amount || 0);
    }
    return sum;
  }, 0);
}

export function buildCommissionScopeNote(scope: CommissionScopeKind, studentCount: number, percentage: number, baseTotal: number, commissionAmount: number) {
  if (scope === 'teacher_assigned_students') {
    return `فیصدی ${percentage}% از فیس ${studentCount} شاگرد اختصاصی این استاد (مجموع فیس ماه: ${baseTotal.toFixed(2)} افغانی → سهم معاش: ${commissionAmount.toFixed(2)} افغانی).`;
  }
  if (scope === 'branch_all_students') {
    return `فیصدی ${percentage}% از مجموع فیس تمام شاگردان این نماینده‌گی در این ماه (مجموع فیس: ${baseTotal.toFixed(2)} → سهم معاش مدیر: ${commissionAmount.toFixed(2)} افغانی).`;
  }
  return `فیصدی ${percentage}% از مجموع فیس تمام شاگردان سیستم در این ماه (مجموع فیس: ${baseTotal.toFixed(2)} → سهم معاش: ${commissionAmount.toFixed(2)} افغانی).`;
}

export async function sumCommissionBaseForEmployee(args: {
  user: { _id: any; role?: string; branchId?: any };
  setting: { role: string; percentageScope?: string; branchId?: any };
  hijriYear: number;
  hijriMonth: number;
}): Promise<{ total: number; scope: CommissionScopeKind; assignedStudentCount: number }> {
  const paymentFilter: Record<string, unknown> = {
    isDeleted: false,
    paymentFor: 'student_fee',
    status: { $in: ['completed', 'paid'] }
  };

  const isTeacher = args.setting.role === 'teacher' || args.user.role === 'teacher';

  if (isTeacher) {
    const branchId = args.setting.branchId ?? args.user.branchId ?? null;
    const studentFilter: Record<string, unknown> = {
      teacherId: args.user._id,
      isDeleted: false
    };
    if (branchId) studentFilter.branchId = branchId;

    const students = await Student.find(studentFilter).select('_id').lean<any[]>();
    const studentIds = students.map((student) => student._id);
    if (!studentIds.length) {
      return { total: 0, scope: 'teacher_assigned_students', assignedStudentCount: 0 };
    }

    const payments = await Payment.find({
      ...paymentFilter,
      studentId: { $in: studentIds }
    })
      .select('amount paymentDate')
      .lean<any[]>();

    return {
      total: sumPaymentsInHijriMonth(payments, args.hijriYear, args.hijriMonth),
      scope: 'teacher_assigned_students',
      assignedStudentCount: studentIds.length
    };
  }

  const allSystem = args.setting.percentageScope === 'all_system';
  if (!allSystem) {
    const branchId = args.setting.branchId ?? args.user.branchId ?? null;
    if (branchId) paymentFilter.branchId = branchId;
  }

  const payments = await Payment.find(paymentFilter).select('amount paymentDate').lean<any[]>();
  return {
    total: sumPaymentsInHijriMonth(payments, args.hijriYear, args.hijriMonth),
    scope: allSystem ? 'system_all_students' : 'branch_all_students',
    assignedStudentCount: 0
  };
}

/** @deprecated Use sumCommissionBaseForEmployee — kept for compatibility */
export async function sumPaymentsForScope(args: {
  hijriYear: number;
  hijriMonth: number;
  branchId?: string | null;
  includeAllSystem?: boolean;
}) {
  const paymentFilter: Record<string, unknown> = {
    isDeleted: false,
    paymentFor: 'student_fee',
    status: { $in: ['completed', 'paid'] },
    ...(args.includeAllSystem ? {} : { branchId: args.branchId ?? null })
  };
  const payments = await Payment.find(paymentFilter).select('amount paymentDate').lean<any[]>();
  return sumPaymentsInHijriMonth(payments, args.hijriYear, args.hijriMonth);
}

export async function calculateSalaryRecord(args: {
  userId: string;
  hijriYear: number;
  hijriMonth: number;
  actorId?: string | null;
  allowAllSystemScope?: boolean;
  forceRecalculate?: boolean;
  settingOverride?: any;
}) {
  const user = await User.findOne({ _id: args.userId, isDeleted: false }).lean<any>();
  if (!user) throw new Error('کاربر پیدا نشد');

  const setting = args.settingOverride
    ?? await SalarySetting.findOne({ userId: user._id, isActive: true, isDeleted: false }).sort({ updatedAt: -1 }).lean<any>();
  if (!setting) throw new Error('تنظیمات معاش برای این کاربر ثبت نشده است');

  const isManagerRole = setting.role === 'manager' || setting.role === 'admin'
    || ['admin', 'branch_manager', 'owner'].includes(String(user.role));

  if (isManagerRole && setting.percentageScope === 'all_system' && !args.allowAllSystemScope) {
    throw new Error('محاسبه فیصدی کل سیستم فقط با اجازه سوپر ادمین ممکن است');
  }

  const existing = await SalaryRecord.findOne({
    userId: user._id,
    hijriYear: args.hijriYear,
    hijriMonth: args.hijriMonth,
    isDeleted: false
  });

  if (existing && !args.forceRecalculate) {
    return existing.toObject();
  }

  const commissionBase = setting.salaryType === 'fixed'
    ? { total: 0, scope: 'teacher_assigned_students' as CommissionScopeKind, assignedStudentCount: 0 }
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

  const tax = await calculateAfghanistanSalaryTax(grossSalary);
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
    ? await SalaryRecord.findByIdAndUpdate(existing._id, { $set: payload }, { new: true })
    : await SalaryRecord.create(payload);

  return record?.toObject?.() ?? record;
}

export async function ensureSalaryRecordsForPeriod(args: {
  hijriYear: number;
  hijriMonth: number;
  branchId?: string;
  role?: string;
  actorId?: string | null;
}) {
  const settingsFilter: Record<string, any> = { isDeleted: false, isActive: true };
  if (args.branchId) settingsFilter.branchId = args.branchId;
  if (args.role && args.role !== 'all') settingsFilter.role = args.role;

  const activeSettings = await SalarySetting.find(settingsFilter).select('userId').lean<any[]>();
  if (!activeSettings.length) return;

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
    } catch {
      // Skip invalid rows so one bad salary setting does not break payroll.
    }
  }));
}
