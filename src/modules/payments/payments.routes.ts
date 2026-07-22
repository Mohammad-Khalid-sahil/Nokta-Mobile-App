import { Router, type Request } from 'express';
import Joi from 'joi';
import { authenticate, authorize } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { createError, createResponse } from '../../helpers/response';
import { paginationSchema } from '../../validators/pagination';
import { Expense } from '../../models/Expense';
import { Payment } from '../../models/Payment';
import { SalaryRecord } from '../../models/SalaryRecord';
import { Student } from '../../models/Student';
import { User } from '../../models/User';
import { Enrollment } from '../../models/Enrollment';
import { teacherCompensationService } from '../../services/teacherCompensationService';
import { calculateAfghanistanSalaryTax } from '../../services/afghanistanSalaryTaxService';
import { enrichStudentWithDisplay, studentPopulatePaths } from '../../utils/studentDisplay';

const router = Router();

function serializePayment(payment: any) {
  const display = payment?.studentId?.studentDisplay ?? {};
  return {
    ...payment,
    studentName: display.fullName ?? [payment?.studentId?.firstName, payment?.studentId?.lastName].filter(Boolean).join(' ').trim(),
    studentRollNo: display.studentNumber ?? payment?.studentId?.rollNo ?? payment?.studentId?.studentId ?? '',
    className: display.className ?? '',
    subjectName: display.subjectName ?? '',
    teacherName: display.teacherName ?? '',
    guardianPhone: display.guardianPhone ?? payment?.studentId?.familyPhone ?? '',
    studentPhone: display.studentPhone ?? '',
    branchName: display.branchName ?? '',
    enrollmentStatus: display.enrollmentStatus ?? '',
    studentDisplay: display,
    paymentFor: payment?.paymentFor ?? 'student_fee',
    payeeName: payment?.payeeUserId?.name ?? '',
    payeeRole: payment?.payeeRole ?? '',
    grossAmount: Number(payment?.grossAmount ?? payment?.amount ?? 0),
    taxAmount: Number(payment?.taxAmount ?? 0),
    netAmount: Number(payment?.netAmount ?? payment?.amount ?? 0),
    invoiceNumber: payment?.invoiceNumber ?? '',
    remainingBalance: Number(payment?.studentId?.remainingBalance ?? 0),
    remainingSalaryBalance: Number(payment?.remainingSalaryBalance ?? 0)
  };
}

async function normalizePayment(payment: any) {
  if (!payment?.studentId) return serializePayment(payment);
  const student = await enrichStudentWithDisplay(payment.studentId);
  return serializePayment({ ...payment, studentId: student });
}

async function normalizePayments(payments: any[]) {
  return Promise.all(payments.map(normalizePayment));
}

const paymentSchema = Joi.object({
  body: Joi.object({
    paymentType: Joi.string().valid('student_fee', 'employee_salary').optional(),
    paymentFor: Joi.string().valid('student_fee', 'teacher_salary', 'manager_salary').optional(),
    studentId: Joi.string().hex().length(24).allow('', null).optional(),
    classId: Joi.string().hex().length(24).allow('', null).optional(),
    employeeId: Joi.string().hex().length(24).allow('', null).optional(),
    payeeUserId: Joi.string().hex().length(24).allow('', null).optional(),
    employeeRole: Joi.string().valid('teacher', 'manager').allow('', null).optional(),
    payeeRole: Joi.string().valid('teacher', 'manager').allow('', null).optional(),
    amount: Joi.number().positive().required(),
    grossSalary: Joi.number().min(0).optional(),
    salaryMonth: Joi.number().min(1).max(12).optional(),
    salaryYear: Joi.number().min(1300).max(1500).optional(),
    discount: Joi.number().min(0).optional(),
    method: Joi.string().valid('cash', 'bank_transfer', 'mobile_money', 'card').optional(),
    paymentDate: Joi.date().iso().optional(),
    referenceNumber: Joi.string().allow('', null).optional(),
    notes: Joi.string().allow('', null).optional(),
    branchId: Joi.string().hex().length(24).optional()
  })
});

router.use(authenticate);

async function getScopedPaymentStudentIds(req: Request) {
  const role = req.user?.canonicalRole;
  if (!role || !req.user?.userId) {
    return null;
  }

  if (role === 'student') {
    const user = await User.findById(req.user.userId).select('studentId').lean<Record<string, any>>();
    if (!user?.studentId) {
      return [];
    }
    const student = await Student.findOne({ studentId: user.studentId, isDeleted: false }).select('_id').lean<Record<string, any>>();
    return student ? [student._id] : [];
  }

  if (role === 'parent') {
    const user = await User.findById(req.user.userId).select('familyId parentProfileId').lean<Record<string, any>>();
    const filter: Record<string, unknown> = { isDeleted: false };
    if (user?.familyId) {
      filter.familyId = user.familyId;
    } else if (user?.parentProfileId) {
      filter.parentProfileId = user.parentProfileId;
    } else {
      return [];
    }

    const students = await Student.find(filter).select('_id').lean();
    return students.map((student: any) => student._id);
  }

  return null;
}

function buildPaymentReference() {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  const entropy = `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  return `PAY-${stamp}-${entropy}`;
}

function buildInvoiceNumber() {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  const entropy = `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  return `INV-${stamp}-${entropy}`;
}

async function generateInvoiceNumber() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = buildInvoiceNumber();
    const exists = await Payment.findOne({ invoiceNumber: candidate }).select('_id').lean();
    if (!exists) return candidate;
  }
  throw new Error('Unable to generate invoice number');
}

async function resolvePaymentReference(rawReference?: string | null) {
  const trimmedReference = String(rawReference ?? '').trim();
  if (trimmedReference) {
    const duplicate = await Payment.findOne({ referenceNumber: trimmedReference, isDeleted: false }).select('_id').lean();
    if (duplicate) {
      return { error: 'Duplicate payment reference. Use a unique reference number.' };
    }
    return { referenceNumber: trimmedReference };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const generated = buildPaymentReference();
    const exists = await Payment.findOne({ referenceNumber: generated, isDeleted: false }).select('_id').lean();
    if (!exists) {
      return { referenceNumber: generated };
    }
  }

  return { error: 'Unable to generate a unique payment reference. Please try again.' };
}

router.get('/', authorize(['super_admin', 'admin', 'branch_manager', 'owner', 'student', 'parent']), validate(paginationSchema), async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const filter: Record<string, unknown> = { isDeleted: false };
    if (req.query.studentId) {
      filter.studentId = req.query.studentId;
    }

    const scopedStudentIds = await getScopedPaymentStudentIds(req);
    if (Array.isArray(scopedStudentIds)) {
      filter.studentId = { $in: scopedStudentIds };
    }

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate({ path: 'studentId', populate: studentPopulatePaths, select: 'firstName lastName studentId rollNo remainingBalance classId subjectId teacherId branchId familyId parentProfileId familyPhone whatsapp status accountStatus' })
        .populate('payeeUserId', 'name email role')
        .lean()
        .sort({ paymentDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Payment.countDocuments(filter)
    ]);

    res.json(createResponse(await normalizePayments(payments), '', { page, limit, total }));
  } catch (error) {
    next(error);
  }
});

router.post('/', authorize(['super_admin', 'admin', 'branch_manager', 'student']), validate(paymentSchema), async (req, res, next) => {
  try {
    const isStudentSelfPayment = req.user?.canonicalRole === 'student';
    let selectedPaymentClassId: string | null = null;
    const requestedPaymentType = String(req.body.paymentType || '');
    const requestedRole = String(req.body.employeeRole || req.body.payeeRole || '');
    let paymentFor = String(req.body.paymentFor || 'student_fee') as 'student_fee' | 'teacher_salary' | 'manager_salary';

    if (requestedPaymentType === 'student_fee') paymentFor = 'student_fee';
    if (requestedPaymentType === 'employee_salary') {
      paymentFor = requestedRole === 'manager' ? 'manager_salary' : 'teacher_salary';
    }

    const isStudentPayment = paymentFor === 'student_fee';
    const isSalaryPayment = paymentFor === 'teacher_salary' || paymentFor === 'manager_salary';
    const payeeUserId = req.body.employeeId || req.body.payeeUserId;
    const payeeRole = requestedRole || (paymentFor === 'teacher_salary' ? 'teacher' : paymentFor === 'manager_salary' ? 'manager' : null);

    let selfStudent: any = null;
    if (isStudentSelfPayment) {
      if (!isStudentPayment) {
        return res.status(403).json(createError('Students can only submit their own fee payments'));
      }
      const currentUser = await User.findById(req.user?.userId).select('studentId').lean<any>();
      selfStudent = currentUser?.studentId
        ? await Student.findOne({ studentId: currentUser.studentId, isDeleted: false, status: 'active' }).lean<any>()
        : null;
      if (!selfStudent) {
        return res.status(404).json(createError('Student not found'));
      }
      if (req.body.studentId && String(req.body.studentId) !== String(selfStudent._id)) {
        return res.status(403).json(createError('Students can only submit their own fee payments'));
      }
      const enrollments = await Enrollment.find({
        studentId: selfStudent._id,
        isDeleted: false
      }).select('classId').lean<any[]>();
      const allowedClassIds = new Set([
        String(selfStudent.classId ?? ''),
        ...enrollments.map((item) => String(item.classId ?? ''))
      ].filter(Boolean));
      if (req.body.classId && !allowedClassIds.has(String(req.body.classId))) {
        return res.status(403).json(createError('Selected class is not assigned to this student'));
      }
      selectedPaymentClassId = String(req.body.classId || selfStudent.classId || '');
      req.body.studentId = String(selfStudent._id);
    }

    if (isStudentPayment && !req.body.studentId) {
      return res.status(400).json(createError('Student is required for student fee payment'));
    }

    if (isSalaryPayment && !payeeUserId) {
      return res.status(400).json(createError('Employee is required for salary payment'));
    }

    if (isSalaryPayment && !payeeRole) {
      return res.status(400).json(createError('Employee role is required for salary payment'));
    }

    if (isSalaryPayment && (!req.body.salaryMonth || !req.body.salaryYear)) {
      return res.status(400).json(createError('Salary month and year are required for salary payment'));
    }

    const student = isStudentPayment
      ? selfStudent ?? await Student.findOne({ _id: req.body.studentId, isDeleted: false, status: 'active' }).lean<any>()
      : null;
    if (isStudentPayment && !student) {
      return res.status(404).json(createError('Student not found'));
    }

    const payee = isSalaryPayment
      ? await User.findOne({
        _id: payeeUserId,
        isDeleted: false,
        active: { $ne: false },
        status: { $nin: ['inactive', 'blocked', 'expired'] }
      }).lean<any>()
      : null;
    if (isSalaryPayment && !payee) {
      return res.status(404).json(createError('Employee not found'));
    }

    if (isSalaryPayment) {
      const allowedRoles = payeeRole === 'teacher' ? ['teacher'] : ['admin', 'branch_manager', 'owner'];
      if (!allowedRoles.includes(String(payee?.role))) {
        return res.status(400).json(createError('Selected employee does not match the selected salary role'));
      }
    }

    const referenceResult = await resolvePaymentReference(req.body.referenceNumber);
    if (referenceResult.error) {
      return res.status(409).json(createError(referenceResult.error));
    }

    const resolvedPaymentDate = req.body.paymentDate ? new Date(req.body.paymentDate) : new Date();
    if (Number.isNaN(resolvedPaymentDate.getTime())) {
      return res.status(400).json(createError('Payment date is invalid'));
    }

    const invoiceNumber = await generateInvoiceNumber();
    const studentNetAmount = isStudentPayment
      ? Math.max(0, Number(req.body.amount || 0) - Number(req.body.discount || 0))
      : 0;
    const baseAmount = isSalaryPayment
      ? Number(req.body.grossSalary || req.body.amount || 0)
      : studentNetAmount;
    let grossAmount = baseAmount;
    let taxAmount = 0;
    let netAmount = baseAmount;
    let taxCategory = '';
    let taxExplanation = '';
    let remainingSalaryBalance = 0;
    const consumedSalaryRecordIds: string[] = [];

    if (isSalaryPayment) {
      const tax = await calculateAfghanistanSalaryTax(baseAmount);
      grossAmount = Number(tax.grossSalary || baseAmount);
      taxAmount = Number(tax.taxAmount || 0);
      netAmount = Number(tax.netSalary || Math.max(0, grossAmount - taxAmount));
      taxCategory = tax.taxCategory;
      taxExplanation = tax.explanation;

      const salaryRecords = await SalaryRecord.find({
        userId: payeeUserId,
        isDeleted: false,
        hijriMonth: Number(req.body.salaryMonth),
        hijriYear: Number(req.body.salaryYear)
      })
        .sort({ hijriYear: 1, hijriMonth: 1, calculatedAt: 1 })
        .lean<any[]>();

      let remainingNetToApply = netAmount;
      for (const record of salaryRecords) {
        if (remainingNetToApply <= 0) break;
        const alreadyPaid = Number(record.paidAmount || 0);
        const remaining = Math.max(0, Number(record.netSalary || 0) - alreadyPaid);
        if (remaining <= 0) continue;

        const applied = Math.min(remaining, remainingNetToApply);
        remainingNetToApply -= applied;
        const nextPaidAmount = alreadyPaid + applied;
        const isFullyPaid = nextPaidAmount >= Number(record.netSalary || 0);

        await SalaryRecord.updateOne(
          { _id: record._id },
          {
            $set: {
              paidAmount: Number(nextPaidAmount.toFixed(2)),
              paymentStatus: isFullyPaid ? 'paid' : 'unpaid',
              paidAt: isFullyPaid ? new Date() : record.paidAt ?? null,
              taxStatus: isFullyPaid ? 'paid' : record.taxStatus ?? 'pending'
            }
          }
        );
        consumedSalaryRecordIds.push(String(record._id));
      }

      const unpaidAggregation = await SalaryRecord.aggregate([
        {
          $match: {
            userId: payee?._id,
            isDeleted: false
          }
        },
        {
          $project: {
            remaining: {
              $max: [
                0,
                { $subtract: [{ $ifNull: ['$netSalary', 0] }, { $ifNull: ['$paidAmount', 0] }] }
              ]
            }
          }
        },
        { $group: { _id: null, totalRemaining: { $sum: '$remaining' } } }
      ]);
      remainingSalaryBalance = Number(unpaidAggregation[0]?.totalRemaining ?? 0);
    }

    const payment = await Payment.create({
      paymentFor,
      status: 'completed',
      studentId: student?._id ?? null,
      teacherId: student?.teacherId ?? null,
      classId: selectedPaymentClassId ?? req.body.classId ?? student?.classId ?? null,
      subjectId: student?.subjectId ?? null,
      payeeUserId: payee?._id ?? null,
      ...(isSalaryPayment && payeeRole ? { payeeRole } : {}),
      salaryRecordIds: consumedSalaryRecordIds,
      amount: netAmount,
      grossAmount,
      taxAmount,
      netAmount,
      remainingSalaryBalance,
      invoiceNumber,
      referenceNumber: referenceResult.referenceNumber,
      branchId: req.body.branchId ?? student?.branchId ?? payee?.branchId ?? req.user?.branchId ?? null,
      collectedBy: req.user?.userId ?? null,
      paymentDate: resolvedPaymentDate,
      method: req.body.method ?? 'cash',
      notes: req.body.notes ?? ''
    });

    if (student) {
      const paidTotals = await Payment.aggregate([
      {
        $match: {
          studentId: student._id,
          isDeleted: false,
          status: { $nin: ['cancelled', 'refunded'] }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
      const nextPaidAmount = Number(paidTotals[0]?.total ?? 0);
      const nextRemainingBalance = Number(student.feeAmount || 0) - nextPaidAmount;

      await Student.updateOne(
        { _id: student._id },
        {
          $set: {
            paidAmount: nextPaidAmount,
            remainingBalance: nextRemainingBalance
          }
        }
      );
    }

    if (student) {
      await Expense.create({
        branchId: payment.branchId ?? null,
        title: `Student fee payment - ${student.firstName} ${student.lastName}`,
        amount: Number(netAmount),
        category: 'income',
        date: payment.paymentDate,
        createdBy: req.user?.userId ?? null,
        notes: req.body.notes ?? ''
      });
    } else if (payee) {
      await Expense.create({
        branchId: payment.branchId ?? null,
        title: `Salary payment - ${payee.name}`,
        amount: Number(grossAmount),
        category: 'salary',
        date: payment.paymentDate,
        createdBy: req.user?.userId ?? null,
        notes: `Gross: ${grossAmount}, Tax: ${taxAmount}, Net paid: ${netAmount}. ${req.body.notes ?? ''}`.trim()
      });
    }

    const teacher = student?.teacherId
      ? await User.findOne({ _id: student.teacherId, role: 'teacher', isDeleted: false }).lean<any>()
      : null;

    if (teacher) {
      await teacherCompensationService.recordPaymentCommission({
        payment,
        student,
        teacher,
        createdBy: req.user?.userId ?? null
      });
    }

    const populatedPayment = await Payment.findById(payment._id)
      .populate({ path: 'studentId', populate: studentPopulatePaths, select: 'firstName lastName studentId rollNo remainingBalance classId subjectId teacherId branchId familyId parentProfileId familyPhone whatsapp status accountStatus' })
      .populate('payeeUserId', 'name email role')
      .lean();

    res.status(201).json(createResponse(await normalizePayment(populatedPayment), 'Payment recorded successfully'));
  } catch (error: any) {
    if (error?.code === 11000 && String(error?.message ?? '').includes('referenceNumber')) {
      return res.status(409).json(createError('Duplicate payment reference. Use a unique reference number.'));
    }
    if (error?.code === 11000 && String(error?.message ?? '').includes('invoiceNumber')) {
      return res.status(409).json(createError('Duplicate invoice number. Please retry.'));
    }
    next(error);
  }
});

router.get('/payees', authorize(['super_admin', 'admin', 'branch_manager', 'owner']), async (req, res, next) => {
  try {
    const role = String(req.query.role || 'all');
    const filter: Record<string, any> = {
      isDeleted: false,
      active: { $ne: false },
      status: { $nin: ['inactive', 'blocked', 'expired'] },
      role: role === 'teacher'
        ? 'teacher'
        : role === 'manager'
          ? { $in: ['admin', 'branch_manager', 'owner'] }
          : { $in: ['teacher', 'admin', 'branch_manager', 'owner'] }
    };
    if (req.query.branchId) {
      filter.branchId = req.query.branchId;
    }
    if (req.user?.canonicalRole === 'branch_manager' && req.user?.branchId) {
      filter.branchId = req.user.branchId;
    }
    const users = await User.find(filter).select('name role branchId salaryType fixedSalary percentageRate customPercentage').lean<any[]>();
    const payload = users.map((user) => ({
      value: String(user._id),
      label: user.name,
      role: user.role === 'teacher' ? 'teacher' : 'manager',
      salaryType: user.salaryType,
      fixedSalary: Number(user.fixedSalary || 0),
      percentageRate: Number(user.customPercentage || user.percentageRate || 0),
      branchId: user.branchId ? String(user.branchId) : ''
    }));
    res.json(createResponse(payload));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/invoice', authorize(['super_admin', 'admin', 'branch_manager', 'owner', 'student', 'parent']), async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate({ path: 'studentId', populate: studentPopulatePaths, select: 'firstName lastName studentId rollNo feeAmount paidAmount remainingBalance classId subjectId teacherId branchId familyId parentProfileId familyPhone whatsapp status accountStatus' })
      .populate('collectedBy', 'name email')
      .lean<any>();

    if (!payment || payment.isDeleted) {
      return res.status(404).json(createError('Payment invoice not found'));
    }

    const normalizedPayment = await normalizePayment(payment);
    res.json(createResponse({
      ...normalizedPayment,
      issuedAt: payment.paymentDate,
      collectedByName: (payment as any).collectedBy?.name ?? '',
      studentFeeAmount: Number((payment as any).studentId?.feeAmount ?? 0),
      totalPaidAmount: Number((payment as any).studentId?.paidAmount ?? 0)
    }));
  } catch (error) {
    next(error);
  }
});

export const paymentRouter = router;
