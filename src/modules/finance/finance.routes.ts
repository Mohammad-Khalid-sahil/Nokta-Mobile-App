import { Router } from 'express';
import Joi from 'joi';
import { authenticate, authorize } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { createError, createResponse } from '../../helpers/response';
import { Expense } from '../../models/Expense';
import { FinanceEntry } from '../../models/FinanceEntry';
import { Payment } from '../../models/Payment';
import { paginationSchema } from '../../validators/pagination';
import { FinanceAggregationService } from '../../services/financeAggregationService';

const router = Router();
const financeAggregationService = new FinanceAggregationService();

const financeSchema = Joi.object({
  body: Joi.object({
    title: Joi.string().required(),
    amount: Joi.number().positive().required(),
    category: Joi.string().required(),
    date: Joi.date().optional(),
    notes: Joi.string().allow('', null),
    branchId: Joi.string().hex().length(24).allow(null).optional()
  })
});

function readFinanceFilters(query: any) {
  return {
    startDate: query.startDate ? String(query.startDate) : undefined,
    endDate: query.endDate ? String(query.endDate) : undefined,
    branchId: query.branchId ? String(query.branchId) : undefined,
    teacherId: query.teacherId ? String(query.teacherId) : undefined,
    classId: query.classId ? String(query.classId) : undefined,
    subjectId: query.subjectId ? String(query.subjectId) : undefined,
    status: query.status ? String(query.status) as 'paid' | 'unpaid' | 'pending' : undefined
  };
}

router.get('/me/earnings', authenticate, authorize(['teacher']), async (req, res, next) => {
  try {
    const detail = await financeAggregationService.getTeacherSelfEarnings(req.user!.userId, readFinanceFilters(req.query));
    res.json(createResponse(detail));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load teacher earnings';
    res.status(404).json(createError(message));
  }
});

router.use(authenticate, authorize(['super_admin', 'admin', 'accountant', 'branch_manager', 'owner']));

router.get('/summary', async (req, res, next) => {
  try {
    const scopedBranchId = req.user?.canonicalRole === 'branch_manager' ? req.user.branchId : undefined;
    const summary = await financeAggregationService.getSummary(readFinanceFilters(req.query), scopedBranchId);
    res.json(createResponse(summary));
  } catch (error) {
    next(error);
  }
});

router.get('/teachers', async (req, res, next) => {
  try {
    const scopedBranchId = req.user?.canonicalRole === 'branch_manager' ? req.user.branchId : undefined;
    const teachers = await financeAggregationService.getTeacherOverview(readFinanceFilters(req.query), scopedBranchId);
    res.json(createResponse(teachers));
  } catch (error) {
    next(error);
  }
});

router.get('/teachers/:id', async (req, res, next) => {
  try {
    const scopedBranchId = req.user?.canonicalRole === 'branch_manager' ? req.user.branchId : undefined;
    const detail = await financeAggregationService.getTeacherDetail(req.params.id, readFinanceFilters(req.query), scopedBranchId);
    res.json(createResponse(detail));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load teacher finance detail';
    res.status(404).json(createError(message));
  }
});

router.post('/income', validate(financeSchema), async (req, res, next) => {
  try {
    const income = await FinanceEntry.create({
      ...req.body,
      branchId: req.body.branchId ?? req.user?.branchId ?? null,
      createdBy: req.user?.userId ?? null
    });

    res.status(201).json(createResponse(income, 'Income recorded'));
  } catch (error) {
    next(error);
  }
});

router.get('/', validate(paginationSchema), async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const scopedBranchId = req.user?.canonicalRole === 'branch_manager' ? req.user.branchId : req.query.branchId;
    const branchFilter = scopedBranchId ? { branchId: scopedBranchId } : {};

    const [payments, financeEntries, expenses] = await Promise.all([
      Payment.find({ isDeleted: false, status: { $nin: ['cancelled', 'refunded'] }, ...branchFilter })
        .populate('studentId', 'firstName lastName studentId')
        .populate('payeeUserId', 'name role')
        .lean(),
      FinanceEntry.find({ isDeleted: false, ...branchFilter }).lean(),
      Expense.find({ isDeleted: false, category: { $ne: 'income' }, ...branchFilter }).lean()
    ]);

    const items = [
      ...payments.map((payment: any) => ({
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
      ...financeEntries.map((entry: any) => ({
        id: entry._id,
        title: entry.title,
        amount: entry.amount,
        category: entry.category,
        date: entry.date,
        source: entry.source,
        notes: entry.notes ?? '',
        status: 'completed'
      })),
      ...expenses.map((entry: any) => ({
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

    res.json(createResponse(paginatedItems, '', { page, limit, total: items.length }));
  } catch (error) {
    next(error);
  }
});

export const financeRouter = router;
