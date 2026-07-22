import { Router, type Request } from 'express';
import Joi from 'joi';
import { Curriculum } from '../../models/Curriculum';
import { ClassModel } from '../../models/Class';
import { Subject } from '../../models/Subject';
import { authenticate } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { paginationSchema } from '../../validators/pagination';
import { listRecordFilter } from '../../utils/recordVisibility';
import { createError, createResponse } from '../../helpers/response';

const router = Router();

const manageCurriculum = requireRole('super_admin', 'admin', 'branch_manager');
const viewCurriculum = requireRole('super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'parent', 'family_student', 'owner');

const payloadSchema = {
  title: Joi.string().trim().required(),
  code: Joi.string().trim().required(),
  level: Joi.string().trim().allow('', null).optional(),
  academicYear: Joi.string().trim().allow('', null).optional(),
  term: Joi.string().valid('annual', 'semester_1', 'semester_2', 'quarter_1', 'quarter_2', 'quarter_3', 'quarter_4').optional(),
  weeklyHours: Joi.number().min(0).optional(),
  durationWeeks: Joi.number().min(0).optional(),
  classId: Joi.string().hex().length(24).allow('', null).optional(),
  subjectId: Joi.string().hex().length(24).allow('', null).optional(),
  branchId: Joi.string().hex().length(24).allow('', null).optional(),
  objectives: Joi.string().trim().required(),
  learningOutcomes: Joi.string().trim().required(),
  standards: Joi.string().trim().allow('', null).optional(),
  scopeSequence: Joi.string().trim().allow('', null).optional(),
  assessmentPlan: Joi.string().trim().allow('', null).optional(),
  resources: Joi.string().trim().allow('', null).optional(),
  status: Joi.string().valid('draft', 'approved', 'archived').optional(),
  active: Joi.boolean().optional()
};

const createCurriculumSchema = Joi.object({ body: Joi.object(payloadSchema) });
const updateCurriculumSchema = Joi.object({
  params: Joi.object({ id: Joi.string().hex().length(24).required() }),
  body: Joi.object({ ...payloadSchema, title: payloadSchema.title.optional(), code: payloadSchema.code.optional(), objectives: payloadSchema.objectives.optional(), learningOutcomes: payloadSchema.learningOutcomes.optional() }).min(1)
});
const idParamsSchema = Joi.object({ params: Joi.object({ id: Joi.string().hex().length(24).required() }) });

function normalizeNullableId(value: unknown) {
  return value === '' || value === undefined ? null : value;
}

async function assertRelations(payload: Record<string, any>) {
  const classId = normalizeNullableId(payload.classId);
  const subjectId = normalizeNullableId(payload.subjectId);
  const [klass, subject] = await Promise.all([
    classId ? ClassModel.findOne({ _id: classId, isDeleted: false }).lean<any>() : Promise.resolve(null),
    subjectId ? Subject.findOne({ _id: subjectId, isDeleted: false }).lean<any>() : Promise.resolve(null)
  ]);

  if (classId && !klass) throw new Error('Selected class does not exist');
  if (subjectId && !subject) throw new Error('Selected subject does not exist');
  if (klass && subject && String(subject.classId) !== String(klass._id)) {
    throw new Error('Selected subject does not belong to the chosen class');
  }
}

function normalizePayload(req: Request, body: Record<string, any>) {
  return {
    ...body,
    code: body.code ? String(body.code).trim().toUpperCase() : undefined,
    branchId: normalizeNullableId(body.branchId) ?? req.user?.branchId ?? null,
    classId: normalizeNullableId(body.classId),
    subjectId: normalizeNullableId(body.subjectId)
  };
}

function serializeCurriculum(item: any) {
  const classRef = item?.classId;
  const subjectRef = item?.subjectId;
  return {
    ...item,
    classId: classRef?._id ?? classRef ?? null,
    subjectId: subjectRef?._id ?? subjectRef ?? null,
    className: classRef?.className ?? classRef?.name ?? '',
    subjectName: subjectRef?.title ?? ''
  };
}

router.use(authenticate);

router.get('/', viewCurriculum, validate(paginationSchema), async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const search = String(req.query.search || '').trim();
    const filter: any = { ...listRecordFilter(req.user) };
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { academicYear: { $regex: search, $options: 'i' } },
        { level: { $regex: search, $options: 'i' } }
      ];
    }

    const [items, total] = await Promise.all([
      Curriculum.find(filter)
        .populate('classId', 'className name')
        .populate('subjectId', 'title code')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Curriculum.countDocuments(filter)
    ]);

    res.json(createResponse(items.map(serializeCurriculum), '', { page, limit, total }));
  } catch (error) {
    next(error);
  }
});

router.post('/', manageCurriculum, validate(createCurriculumSchema), async (req, res, next) => {
  try {
    const payload = normalizePayload(req, req.body);
    await assertRelations(payload);
    const item = await Curriculum.create(payload);
    const saved = await Curriculum.findById(item._id).populate('classId', 'className name').populate('subjectId', 'title code').lean();
    res.status(201).json(createResponse(serializeCurriculum(saved), 'Curriculum created successfully'));
  } catch (error: any) {
    if (/duplicate key/i.test(error?.message ?? '')) return res.status(409).json(createError('Curriculum code already exists'));
    res.status(400).json(createError(error?.message || 'Failed to create curriculum'));
  }
});

router.get('/:id', viewCurriculum, validate(idParamsSchema), async (req, res, next) => {
  try {
    const item = await Curriculum.findOne({ _id: req.params.id, isDeleted: false })
      .populate('classId', 'className name')
      .populate('subjectId', 'title code')
      .lean();
    if (!item) return res.status(404).json(createError('Curriculum not found'));
    res.json(createResponse(serializeCurriculum(item)));
  } catch (error) {
    next(error);
  }
});

router.put('/:id', manageCurriculum, validate(updateCurriculumSchema), async (req, res) => {
  try {
    const payload = normalizePayload(req, req.body);
    await assertRelations(payload);
    const item = await Curriculum.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      payload,
      { new: true, runValidators: true }
    ).populate('classId', 'className name').populate('subjectId', 'title code').lean();
    if (!item) return res.status(404).json(createError('Curriculum not found'));
    res.json(createResponse(serializeCurriculum(item), 'Curriculum updated successfully'));
  } catch (error: any) {
    res.status(400).json(createError(error?.message || 'Failed to update curriculum'));
  }
});

router.delete('/:id', manageCurriculum, validate(idParamsSchema), async (req, res) => {
  try {
    const item = await Curriculum.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.userId ?? null, active: false },
      { new: true }
    ).lean();
    if (!item) return res.status(404).json(createError('Curriculum not found'));
    res.json(createResponse({}, 'Curriculum deleted successfully'));
  } catch (error: any) {
    res.status(400).json(createError(error?.message || 'Failed to delete curriculum'));
  }
});

export const curriculumRouter = router;
