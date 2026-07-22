"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.curriculumRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const Curriculum_1 = require("../../models/Curriculum");
const Class_1 = require("../../models/Class");
const Subject_1 = require("../../models/Subject");
const auth_1 = require("../../middlewares/auth");
const rbac_1 = require("../../middlewares/rbac");
const validate_1 = require("../../middlewares/validate");
const pagination_1 = require("../../validators/pagination");
const recordVisibility_1 = require("../../utils/recordVisibility");
const response_1 = require("../../helpers/response");
const router = (0, express_1.Router)();
const manageCurriculum = (0, rbac_1.requireRole)('super_admin', 'admin', 'branch_manager');
const viewCurriculum = (0, rbac_1.requireRole)('super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'parent', 'family_student', 'owner');
const payloadSchema = {
    title: joi_1.default.string().trim().required(),
    code: joi_1.default.string().trim().required(),
    level: joi_1.default.string().trim().allow('', null).optional(),
    academicYear: joi_1.default.string().trim().allow('', null).optional(),
    term: joi_1.default.string().valid('annual', 'semester_1', 'semester_2', 'quarter_1', 'quarter_2', 'quarter_3', 'quarter_4').optional(),
    weeklyHours: joi_1.default.number().min(0).optional(),
    durationWeeks: joi_1.default.number().min(0).optional(),
    classId: joi_1.default.string().hex().length(24).allow('', null).optional(),
    subjectId: joi_1.default.string().hex().length(24).allow('', null).optional(),
    branchId: joi_1.default.string().hex().length(24).allow('', null).optional(),
    objectives: joi_1.default.string().trim().required(),
    learningOutcomes: joi_1.default.string().trim().required(),
    standards: joi_1.default.string().trim().allow('', null).optional(),
    scopeSequence: joi_1.default.string().trim().allow('', null).optional(),
    assessmentPlan: joi_1.default.string().trim().allow('', null).optional(),
    resources: joi_1.default.string().trim().allow('', null).optional(),
    status: joi_1.default.string().valid('draft', 'approved', 'archived').optional(),
    active: joi_1.default.boolean().optional()
};
const createCurriculumSchema = joi_1.default.object({ body: joi_1.default.object(payloadSchema) });
const updateCurriculumSchema = joi_1.default.object({
    params: joi_1.default.object({ id: joi_1.default.string().hex().length(24).required() }),
    body: joi_1.default.object({ ...payloadSchema, title: payloadSchema.title.optional(), code: payloadSchema.code.optional(), objectives: payloadSchema.objectives.optional(), learningOutcomes: payloadSchema.learningOutcomes.optional() }).min(1)
});
const idParamsSchema = joi_1.default.object({ params: joi_1.default.object({ id: joi_1.default.string().hex().length(24).required() }) });
function normalizeNullableId(value) {
    return value === '' || value === undefined ? null : value;
}
async function assertRelations(payload) {
    const classId = normalizeNullableId(payload.classId);
    const subjectId = normalizeNullableId(payload.subjectId);
    const [klass, subject] = await Promise.all([
        classId ? Class_1.ClassModel.findOne({ _id: classId, isDeleted: false }).lean() : Promise.resolve(null),
        subjectId ? Subject_1.Subject.findOne({ _id: subjectId, isDeleted: false }).lean() : Promise.resolve(null)
    ]);
    if (classId && !klass)
        throw new Error('Selected class does not exist');
    if (subjectId && !subject)
        throw new Error('Selected subject does not exist');
    if (klass && subject && String(subject.classId) !== String(klass._id)) {
        throw new Error('Selected subject does not belong to the chosen class');
    }
}
function normalizePayload(req, body) {
    return {
        ...body,
        code: body.code ? String(body.code).trim().toUpperCase() : undefined,
        branchId: normalizeNullableId(body.branchId) ?? req.user?.branchId ?? null,
        classId: normalizeNullableId(body.classId),
        subjectId: normalizeNullableId(body.subjectId)
    };
}
function serializeCurriculum(item) {
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
router.use(auth_1.authenticate);
router.get('/', viewCurriculum, (0, validate_1.validate)(pagination_1.paginationSchema), async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        const search = String(req.query.search || '').trim();
        const filter = { ...(0, recordVisibility_1.listRecordFilter)(req.user) };
        if (search) {
            filter.$or = [
                { title: { $regex: search, $options: 'i' } },
                { code: { $regex: search, $options: 'i' } },
                { academicYear: { $regex: search, $options: 'i' } },
                { level: { $regex: search, $options: 'i' } }
            ];
        }
        const [items, total] = await Promise.all([
            Curriculum_1.Curriculum.find(filter)
                .populate('classId', 'className name')
                .populate('subjectId', 'title code')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Curriculum_1.Curriculum.countDocuments(filter)
        ]);
        res.json((0, response_1.createResponse)(items.map(serializeCurriculum), '', { page, limit, total }));
    }
    catch (error) {
        next(error);
    }
});
router.post('/', manageCurriculum, (0, validate_1.validate)(createCurriculumSchema), async (req, res, next) => {
    try {
        const payload = normalizePayload(req, req.body);
        await assertRelations(payload);
        const item = await Curriculum_1.Curriculum.create(payload);
        const saved = await Curriculum_1.Curriculum.findById(item._id).populate('classId', 'className name').populate('subjectId', 'title code').lean();
        res.status(201).json((0, response_1.createResponse)(serializeCurriculum(saved), 'Curriculum created successfully'));
    }
    catch (error) {
        if (/duplicate key/i.test(error?.message ?? ''))
            return res.status(409).json((0, response_1.createError)('Curriculum code already exists'));
        res.status(400).json((0, response_1.createError)(error?.message || 'Failed to create curriculum'));
    }
});
router.get('/:id', viewCurriculum, (0, validate_1.validate)(idParamsSchema), async (req, res, next) => {
    try {
        const item = await Curriculum_1.Curriculum.findOne({ _id: req.params.id, isDeleted: false })
            .populate('classId', 'className name')
            .populate('subjectId', 'title code')
            .lean();
        if (!item)
            return res.status(404).json((0, response_1.createError)('Curriculum not found'));
        res.json((0, response_1.createResponse)(serializeCurriculum(item)));
    }
    catch (error) {
        next(error);
    }
});
router.put('/:id', manageCurriculum, (0, validate_1.validate)(updateCurriculumSchema), async (req, res) => {
    try {
        const payload = normalizePayload(req, req.body);
        await assertRelations(payload);
        const item = await Curriculum_1.Curriculum.findOneAndUpdate({ _id: req.params.id, isDeleted: false }, payload, { new: true, runValidators: true }).populate('classId', 'className name').populate('subjectId', 'title code').lean();
        if (!item)
            return res.status(404).json((0, response_1.createError)('Curriculum not found'));
        res.json((0, response_1.createResponse)(serializeCurriculum(item), 'Curriculum updated successfully'));
    }
    catch (error) {
        res.status(400).json((0, response_1.createError)(error?.message || 'Failed to update curriculum'));
    }
});
router.delete('/:id', manageCurriculum, (0, validate_1.validate)(idParamsSchema), async (req, res) => {
    try {
        const item = await Curriculum_1.Curriculum.findOneAndUpdate({ _id: req.params.id, isDeleted: false }, { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.userId ?? null, active: false }, { new: true }).lean();
        if (!item)
            return res.status(404).json((0, response_1.createError)('Curriculum not found'));
        res.json((0, response_1.createResponse)({}, 'Curriculum deleted successfully'));
    }
    catch (error) {
        res.status(400).json((0, response_1.createError)(error?.message || 'Failed to delete curriculum'));
    }
});
exports.curriculumRouter = router;
