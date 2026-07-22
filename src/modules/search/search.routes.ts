import { Router } from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import { authenticate, authorize } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { generalLimiter } from '../../middlewares/rateLimiter';
import { createResponse } from '../../helpers/response';
import { Student } from '../../models/Student';
import { User } from '../../models/User';
import { ClassModel } from '../../models/Class';
import { Subject } from '../../models/Subject';
import { Payment } from '../../models/Payment';

const router = Router();

const searchSchema = Joi.object({
  query: Joi.object({
    q: Joi.string().trim().min(2).max(80).required(),
    limit: Joi.number().integer().min(1).max(20).default(8)
  })
});

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveBranchFilter(req: any) {
  const role = req.user?.canonicalRole ?? req.user?.role;
  if (['super_admin', 'owner'].includes(String(role))) {
    return {};
  }
  const branchId = req.user?.branchId;
  if (!branchId || !mongoose.Types.ObjectId.isValid(branchId)) {
    return { _id: { $in: [] } };
  }
  return { branchId: new mongoose.Types.ObjectId(branchId) };
}

router.use(authenticate, authorize(['super_admin', 'admin', 'owner', 'branch_manager', 'teacher', 'accountant', 'librarian']));

router.get('/global', generalLimiter, validate(searchSchema), async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim();
    const limit = Number(req.query.limit || 8);
    const regex = new RegExp(escapeRegex(query), 'i');
    const branchFilter = resolveBranchFilter(req);
    const role = String(req.user?.canonicalRole ?? req.user?.role ?? '');
    const canViewFinance = ['super_admin', 'admin', 'owner', 'branch_manager', 'accountant'].includes(role);

    const [students, teachers, classes, subjects, payments] = await Promise.all([
      Student.find({ isDeleted: false, ...branchFilter, $or: [{ firstName: regex }, { lastName: regex }, { studentId: regex }] })
        .select('firstName lastName studentId classId')
        .lean()
        .limit(limit),
      User.find({ isDeleted: false, ...branchFilter, role: 'teacher', $or: [{ name: regex }, { email: regex }] })
        .select('name email')
        .lean()
        .limit(limit),
      ClassModel.find({ isDeleted: false, ...branchFilter, $or: [{ className: regex }, { classCode: regex }] })
        .select('className classCode')
        .lean()
        .limit(limit),
      Subject.find({ isDeleted: false, ...branchFilter, $or: [{ title: regex }, { code: regex }] })
        .select('title code')
        .lean()
        .limit(limit),
      canViewFinance
        ? Payment.find({ isDeleted: false, ...branchFilter, $or: [{ invoiceNumber: regex }, { referenceNumber: regex }] })
          .select('invoiceNumber referenceNumber amount paymentDate')
          .lean()
          .limit(limit)
        : Promise.resolve([])
    ]);

    const results = {
      students: students.map((item: any) => ({
        id: String(item._id),
        title: `${item.firstName} ${item.lastName}`.trim(),
        subtitle: item.studentId || '',
        path: '/students',
        type: 'student'
      })),
      teachers: teachers.map((item: any) => ({
        id: String(item._id),
        title: item.name,
        subtitle: item.email,
        path: '/teachers',
        type: 'teacher'
      })),
      classes: classes.map((item: any) => ({
        id: String(item._id),
        title: item.className,
        subtitle: item.classCode || '',
        path: '/classes',
        type: 'class'
      })),
      subjects: subjects.map((item: any) => ({
        id: String(item._id),
        title: item.title,
        subtitle: item.code || '',
        path: '/subjects',
        type: 'subject'
      })),
      payments: payments.map((item: any) => ({
        id: String(item._id),
        title: item.invoiceNumber || item.referenceNumber || 'Payment',
        subtitle: `${item.amount ?? 0}`,
        path: '/payments',
        type: 'payment'
      }))
    };

    res.json(createResponse(results));
  } catch (error) {
    next(error);
  }
});

export const searchRouter = router;
