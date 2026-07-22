import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import { SalaryTransaction } from '../models/SalaryTransaction';
import { Student } from '../models/Student';
import { User } from '../models/User';

export const ELIGIBLE_PAYMENT_STATUSES = ['completed', 'paid'] as const;
export const EXCLUDED_PAYMENT_STATUSES = ['cancelled', 'refunded', 'pending'] as const;

export type SalaryMode = 'fixed_salary' | 'percentage' | 'fixed_plus_percentage';

export function normalizeSalaryMode(salaryType?: string | null): SalaryMode {
  if (salaryType === 'fixed') return 'fixed_salary';
  if (salaryType === 'percentage') return 'percentage';
  if (salaryType === 'fixed_plus_percentage') return 'fixed_plus_percentage';
  if (salaryType === 'fixed_salary') return 'fixed_salary';
  return 'fixed_salary';
}

export function isEligiblePaymentStatus(status?: string | null) {
  if (!status) return true;
  return ELIGIBLE_PAYMENT_STATUSES.includes(status as (typeof ELIGIBLE_PAYMENT_STATUSES)[number]);
}

export function isExcludedPaymentStatus(status?: string | null) {
  if (!status) return false;
  return EXCLUDED_PAYMENT_STATUSES.includes(status as (typeof EXCLUDED_PAYMENT_STATUSES)[number]);
}

export function resolveCommissionPercentage(teacher: { customPercentage?: number; percentageRate?: number }) {
  const custom = Number(teacher.customPercentage ?? 0);
  if (custom > 0) return custom;
  return Number(teacher.percentageRate ?? 0);
}

export function earnsCommission(salaryType?: string | null) {
  const mode = normalizeSalaryMode(salaryType);
  return mode === 'percentage' || mode === 'fixed_plus_percentage';
}

export function calculateCommissionAmount(paidAmount: number, percentage: number) {
  const amount = Number(paidAmount || 0);
  const rate = Number(percentage || 0);
  if (amount <= 0 || rate <= 0) return 0;
  return Number(((amount * rate) / 100).toFixed(2));
}

export function calculateTeacherPayable(input: {
  salaryMode: SalaryMode | string;
  fixedSalaryAmount: number;
  commissionEarned: number;
}) {
  const mode = normalizeSalaryMode(String(input.salaryMode));
  const fixed =
    mode === 'fixed_salary' || mode === 'fixed_plus_percentage' ? Number(input.fixedSalaryAmount || 0) : 0;
  const commission =
    mode === 'percentage' || mode === 'fixed_plus_percentage' ? Number(input.commissionEarned || 0) : 0;
  return Number((fixed + commission).toFixed(2));
}

export function calculateUnpaidPayable(totalPayable: number, paidAmount: number) {
  return Math.max(0, Number((totalPayable - paidAmount).toFixed(2)));
}

type TeacherLike = {
  _id: mongoose.Types.ObjectId | string;
  salaryType?: string | null;
  customPercentage?: number;
  percentageRate?: number;
};

type PaymentLike = {
  _id: mongoose.Types.ObjectId | string;
  amount: number;
  paymentDate?: Date;
  branchId?: mongoose.Types.ObjectId | string | null;
  referenceNumber?: string;
  status?: string;
};

type StudentLike = {
  _id: mongoose.Types.ObjectId | string;
  teacherId: mongoose.Types.ObjectId | string;
  subjectId: mongoose.Types.ObjectId | string;
  classId: mongoose.Types.ObjectId | string;
  branchId?: mongoose.Types.ObjectId | string | null;
};

export class TeacherCompensationService {
  async recordPaymentCommission(params: {
    payment: PaymentLike;
    student: StudentLike;
    teacher: TeacherLike;
    createdBy?: string | null;
    session?: mongoose.ClientSession;
  }) {
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

    const existing = await SalaryTransaction.findOne({
      paymentId: payment._id,
      isDeleted: false
    }).session(params.session ?? null).lean<any>();

    const transaction = await SalaryTransaction.findOneAndUpdate(
      { paymentId: payment._id },
      {
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
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, session: params.session }
    );

    const previousEarned = Number(existing?.earnedAmount ?? 0);
    const delta = earnedAmount - previousEarned;
    if (delta !== 0) {
      await User.findByIdAndUpdate(teacher._id, {
        $inc: {
          walletBalance: delta,
          totalSalaryEarned: delta
        }
      }, { session: params.session });
    }

    return transaction;
  }

  async getAssignedStudentPaymentTotals(
    teacherIds: mongoose.Types.ObjectId[],
    filters: { startDate?: string; endDate?: string; branchId?: mongoose.Types.ObjectId }
  ) {
    if (!teacherIds.length) {
      return new Map<string, number>();
    }

    const studentFilter: Record<string, unknown> = {
      isDeleted: false,
      teacherId: { $in: teacherIds }
    };
    if (filters.branchId) {
      studentFilter.branchId = filters.branchId;
    }

    const students = await Student.find(studentFilter).select('_id teacherId').lean<any[]>();
    if (!students.length) {
      return new Map<string, number>();
    }

    const studentTeacherMap = new Map(
      students.map((student) => [String(student._id), String(student.teacherId)])
    );

    const paymentMatch: Record<string, unknown> = {
      isDeleted: false,
      studentId: { $in: students.map((student) => student._id) },
      status: { $in: ELIGIBLE_PAYMENT_STATUSES }
    };

    if (filters.branchId) {
      paymentMatch.branchId = filters.branchId;
    }

    if (filters.startDate || filters.endDate) {
      const range: Record<string, Date> = {};
      if (filters.startDate) range.$gte = new Date(String(filters.startDate));
      if (filters.endDate) {
        const end = new Date(String(filters.endDate));
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      paymentMatch.paymentDate = range;
    }

    const paymentTotals = await Payment.aggregate([
      { $match: paymentMatch },
      { $group: { _id: '$studentId', total: { $sum: '$amount' } } }
    ]);

    const teacherTotals = new Map<string, number>();
    for (const row of paymentTotals) {
      const teacherKey = studentTeacherMap.get(String(row._id));
      if (!teacherKey) continue;
      teacherTotals.set(teacherKey, (teacherTotals.get(teacherKey) ?? 0) + Number(row.total ?? 0));
    }

    return teacherTotals;
  }
}

export const teacherCompensationService = new TeacherCompensationService();
