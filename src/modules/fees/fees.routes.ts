import { Router } from 'express';
import Joi from 'joi';
import { authenticate, authorize } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { createError, createResponse } from '../../helpers/response';
import { ClassModel } from '../../models/Class';
import { Subject } from '../../models/Subject';
import { calculateEnrollmentFee } from '../../utils/feeCalculator';

const router = Router();

const resolveFeeSchema = Joi.object({
  query: Joi.object({
    classId: Joi.string().hex().length(24).required(),
    subjectId: Joi.string().hex().length(24).required()
  })
});

router.use(authenticate);

router.get('/resolve', authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'parent', 'owner']), validate(resolveFeeSchema), async (req, res, next) => {
  try {
    const [klass, subject] = await Promise.all([
      ClassModel.findOne({ _id: req.query.classId, isDeleted: false }).select('className feeAmount branchId assignedSubjects').lean<any>(),
      Subject.findOne({ _id: req.query.subjectId, isDeleted: false, activeStatus: true }).select('title feeAmount classId classIds branchId').lean<any>()
    ]);

    if (!klass) return res.status(404).json(createError('Class not found'));
    if (!subject) return res.status(404).json(createError('Subject not found'));

    const subjectClassIds = new Set([
      subject.classId ? String(subject.classId) : '',
      ...(Array.isArray(subject.classIds) ? subject.classIds.map((id: any) => String(id)) : [])
    ].filter(Boolean));
    const classSubjectIds = new Set((klass.assignedSubjects ?? []).map((id: any) => String(id)));
    if (!subjectClassIds.has(String(klass._id)) && !classSubjectIds.has(String(subject._id))) {
      return res.status(400).json(createError('This subject is not assigned to this class.'));
    }

    const pricing = calculateEnrollmentFee(klass.feeAmount, subject.feeAmount);
    res.json(createResponse({
      classId: klass._id,
      subjectId: subject._id,
      className: klass.className,
      subjectName: subject.title,
      classFee: pricing.classFee,
      subjectFee: pricing.subjectFee,
      resolvedFee: pricing.totalFee,
      currency: pricing.currency
    }));
  } catch (error) {
    next(error);
  }
});

export const feeRouter = router;
