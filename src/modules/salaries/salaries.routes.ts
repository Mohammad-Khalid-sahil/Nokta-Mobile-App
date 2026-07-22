import { Router } from 'express';
import Joi from 'joi';
import { authenticate, authorize } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { createError, createResponse } from '../../helpers/response';
import { Salary } from '../../models/Salary';
import { SalaryTransaction } from '../../models/SalaryTransaction';
import { User } from '../../models/User';
import { AuditService } from '../../services/auditService';
import { FinanceAggregationService } from '../../services/financeAggregationService';

const router = Router();
const auditService = new AuditService();
const financeAggregationService = new FinanceAggregationService();

const payoutSchema = Joi.object({
  body: Joi.object({
    teacherId: Joi.string().hex().length(24).required(),
    monthKey: Joi.string().pattern(/^\d{4}-\d{2}$/).required(),
    amount: Joi.number().positive().required(),
    notes: Joi.string().allow('', null).optional()
  })
});

router.use(authenticate);

router.get('/', authorize(['super_admin', 'admin', 'branch_manager', 'owner']), async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = { isDeleted: false };
    if (req.query.teacherId) filter.employeeId = req.query.teacherId;
    if (req.query.status) filter.status = req.query.status;
    if (req.user?.canonicalRole === 'branch_manager' && req.user.branchId) {
      filter.branchId = req.user.branchId;
    }

    const records = await Salary.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json(createResponse(records));
  } catch (error) {
    next(error);
  }
});

router.get('/overview', authorize(['super_admin', 'admin', 'branch_manager', 'owner']), async (req, res, next) => {
  try {
    const scopedBranchId = req.user?.canonicalRole === 'branch_manager' ? req.user.branchId : undefined;
    const teachers = await financeAggregationService.getTeacherOverview(
      {
        startDate: req.query.startDate ? String(req.query.startDate) : undefined,
        endDate: req.query.endDate ? String(req.query.endDate) : undefined,
        branchId: req.query.branchId ? String(req.query.branchId) : undefined,
        teacherId: req.query.teacherId ? String(req.query.teacherId) : undefined,
        classId: req.query.classId ? String(req.query.classId) : undefined,
        subjectId: req.query.subjectId ? String(req.query.subjectId) : undefined,
        status: req.query.status ? String(req.query.status) as 'paid' | 'unpaid' | 'pending' : undefined
      },
      scopedBranchId
    );
    res.json(createResponse(teachers));
  } catch (error) {
    next(error);
  }
});

router.post('/payout', authorize(['super_admin', 'admin', 'owner']), validate(payoutSchema), async (req, res, next) => {
  try {
    const teacher = await User.findOne({ _id: req.body.teacherId, role: 'teacher', isDeleted: false }).lean<any>();
    if (!teacher) {
      return res.status(404).json(createError('Teacher not found'));
    }

    const duplicatePaid = await Salary.findOne({
      employeeId: teacher._id,
      monthKey: req.body.monthKey,
      status: 'paid',
      isDeleted: false
    }).lean();

    if (duplicatePaid) {
      return res.status(409).json(createError('Salary for this teacher and month has already been paid'));
    }

    const payoutAmount = Number(req.body.amount);
    const salaryRecord = await Salary.findOneAndUpdate(
      { employeeId: teacher._id, monthKey: req.body.monthKey, isDeleted: false },
      {
        $setOnInsert: {
          employeeId: teacher._id,
          branchId: teacher.branchId ?? null,
          monthKey: req.body.monthKey,
          baseAmount: payoutAmount,
          deductions: 0,
          netAmount: payoutAmount,
          currency: 'AFN'
        },
        $set: {
          paidAmount: payoutAmount,
          status: 'paid',
          paidAt: new Date(),
          paidBy: req.user?.userId ?? null,
          approvedBy: req.user?.userId ?? null
        },
        $push: {
          auditHistory: {
            action: 'salary_payout',
            actorId: req.user?.userId ?? null,
            notes: req.body.notes ?? '',
            amount: payoutAmount,
            at: new Date()
          }
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await SalaryTransaction.updateMany(
      {
        teacherId: teacher._id,
        isDeleted: false,
        status: { $in: ['pending', 'approved'] },
        year: Number(req.body.monthKey.split('-')[0]),
        month: Number(req.body.monthKey.split('-')[1])
      },
      {
        $set: {
          status: 'paid',
          paidAt: new Date()
        }
      }
    );

    await auditService.recordAction({
      actorId: req.user!.userId,
      branchId: teacher.branchId?.toString?.() ?? null,
      action: 'SALARY_PAYOUT',
      target: String(teacher._id),
      targetType: 'teacher',
      metadata: {
        monthKey: req.body.monthKey,
        amount: payoutAmount,
        salaryId: String(salaryRecord._id),
        notes: req.body.notes ?? ''
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? ''
    });

    res.status(201).json(createResponse(salaryRecord, 'Salary payout recorded successfully'));
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json(createError('Duplicate salary payout blocked for this teacher and month'));
    }
    next(error);
  }
});

export const salariesRouter = router;
