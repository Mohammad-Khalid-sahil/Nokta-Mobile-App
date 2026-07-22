"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.subjectRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const Class_1 = require("../../models/Class");
const Exam_1 = require("../../models/Exam");
const Subject_1 = require("../../models/Subject");
const User_1 = require("../../models/User");
const Student_1 = require("../../models/Student");
const Timetable_1 = require("../../models/Timetable");
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const recordVisibility_1 = require("../../utils/recordVisibility");
const router = (0, express_1.Router)();
const subjectCreateSchema = joi_1.default.object({
    body: joi_1.default.object({
        title: joi_1.default.string().trim().required(),
        code: joi_1.default.string().trim().required(),
        classId: joi_1.default.string().hex().length(24).required(),
        classIds: joi_1.default.array().items(joi_1.default.string().hex().length(24)).optional(),
        feeAmount: joi_1.default.number().min(0).default(0),
        teacher: joi_1.default.string().hex().length(24).allow('', null).optional(),
        branchId: joi_1.default.string().hex().length(24).allow('', null).optional(),
        description: joi_1.default.string().allow('', null).optional(),
        activeStatus: joi_1.default.boolean().optional()
    })
});
const subjectUpdateSchema = joi_1.default.object({
    params: joi_1.default.object({
        id: joi_1.default.string().hex().length(24).required()
    }),
    body: joi_1.default.object({
        title: joi_1.default.string().trim().optional(),
        code: joi_1.default.string().trim().optional(),
        classId: joi_1.default.string().hex().length(24).optional(),
        classIds: joi_1.default.array().items(joi_1.default.string().hex().length(24)).optional(),
        feeAmount: joi_1.default.number().min(0).optional(),
        teacher: joi_1.default.string().hex().length(24).allow('', null).optional(),
        branchId: joi_1.default.string().hex().length(24).allow('', null).optional(),
        description: joi_1.default.string().allow('', null).optional(),
        activeStatus: joi_1.default.boolean().optional()
    }).min(1)
});
const idParamsSchema = joi_1.default.object({
    params: joi_1.default.object({
        id: joi_1.default.string().hex().length(24).required()
    })
});
const subjectQuerySchema = joi_1.default.object({
    query: joi_1.default.object({
        page: joi_1.default.number().integer().min(1).default(1),
        limit: joi_1.default.number().integer().min(1).max(100).default(20),
        search: joi_1.default.string().allow('', null),
        classId: joi_1.default.string().hex().length(24).optional(),
        includeDeleted: joi_1.default.boolean().truthy('true').falsy('false').optional()
    })
});
router.use(auth_1.authenticate);
function serializeSubject(subject) {
    const classRef = subject?.classId;
    const teacherRef = subject?.teacher;
    return {
        ...subject,
        classId: classRef?._id ?? classRef ?? null,
        className: classRef?.className ?? classRef?.name ?? '',
        teacher: teacherRef?._id ?? teacherRef ?? null,
        teacherId: teacherRef?._id ?? teacherRef ?? null,
        teacherName: teacherRef?.name ?? '',
        feeAmount: Number(subject?.feeAmount ?? 0)
    };
}
async function validateSubjectRelations(classId, teacherId) {
    const klass = await Class_1.ClassModel.findOne({ _id: classId, isDeleted: false }).lean();
    if (!klass) {
        throw new Error('Selected class is invalid');
    }
    let teacher = null;
    if (teacherId) {
        teacher = await User_1.User.findOne({ _id: teacherId, role: 'teacher', isDeleted: false }).lean();
        if (!teacher) {
            throw new Error('Selected teacher is invalid');
        }
    }
    return { klass, teacher };
}
async function syncTeacherAssignments(subjectId, classId, nextTeacherId, previousTeacherId) {
    if (previousTeacherId && String(previousTeacherId) !== String(nextTeacherId)) {
        await User_1.User.updateOne({ _id: previousTeacherId, role: 'teacher' }, { $pull: { assignedSubjects: subjectId } });
    }
    if (nextTeacherId) {
        await User_1.User.updateOne({ _id: nextTeacherId, role: 'teacher' }, { $addToSet: { assignedSubjects: subjectId, assignedClasses: classId } });
    }
}
async function syncClassAssignments(subjectId, nextClassId, previousClassId) {
    if (previousClassId && String(previousClassId) !== String(nextClassId)) {
        await Class_1.ClassModel.updateOne({ _id: previousClassId }, { $pull: { assignedSubjects: subjectId } });
    }
    await Class_1.ClassModel.updateOne({ _id: nextClassId }, { $addToSet: { assignedSubjects: subjectId } });
}
async function canAccessSubject(req, subject) {
    const role = req.user?.canonicalRole ?? req.user?.role;
    if (['super_admin', 'admin', 'branch_manager', 'owner'].includes(role)) {
        if (['admin', 'branch_manager'].includes(role) && req.user?.branchId && String(subject.branchId ?? '') !== String(req.user.branchId)) {
            return false;
        }
        return true;
    }
    if (role === 'teacher') {
        return String(subject.teacher?._id ?? subject.teacher ?? '') === String(req.user.userId);
    }
    if (role === 'student') {
        const currentUser = await User_1.User.findById(req.user.userId).select('studentId classId subjectId').lean();
        const linkedStudent = currentUser?.studentId
            ? await Student_1.Student.findOne({ studentId: currentUser.studentId, isDeleted: false }).select('classId subjectId').lean()
            : null;
        const scopedClassId = linkedStudent?.classId ?? currentUser?.classId;
        const scopedSubjectId = linkedStudent?.subjectId ?? currentUser?.subjectId;
        return String(scopedClassId ?? '') === String(subject.classId?._id ?? subject.classId) && String(scopedSubjectId ?? '') === String(subject._id);
    }
    if (role === 'parent' || req.user?.role === 'family_student') {
        const currentUser = await User_1.User.findById(req.user.userId).select('familyId').lean();
        const students = currentUser?.familyId
            ? await Student_1.Student.find({ familyId: currentUser.familyId, isDeleted: false }).select('subjectId').lean()
            : [];
        return students.some((student) => String(student.subjectId) === String(subject._id));
    }
    return false;
}
router.get('/', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']), (0, validate_1.validate)(subjectQuerySchema), async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        const search = String(req.query.search || '').trim();
        const includeDeletedQuery = req.query.includeDeleted;
        const includeDeleted = (0, recordVisibility_1.isSuperAdminActor)(req.user) || includeDeletedQuery === true || includeDeletedQuery === 'true';
        const role = req.user?.canonicalRole ?? req.user?.role;
        const filter = (0, recordVisibility_1.listRecordFilter)(req.user, includeDeleted);
        if ((role === 'admin' || role === 'branch_manager') && req.user?.branchId) {
            filter.branchId = req.user.branchId;
        }
        if (search)
            filter.title = { $regex: search, $options: 'i' };
        if (req.query.classId) {
            filter.$or = [
                { classId: req.query.classId },
                { classIds: req.query.classId }
            ];
        }
        if (role === 'teacher') {
            filter.teacher = req.user?.userId;
        }
        if (role === 'student') {
            const currentUser = await User_1.User.findById(req.user?.userId).select('studentId classId subjectId').lean();
            const linkedStudent = currentUser?.studentId
                ? await Student_1.Student.findOne({ studentId: currentUser.studentId, isDeleted: false }).select('classId subjectId').lean()
                : null;
            const classId = linkedStudent?.classId ?? currentUser?.classId;
            const subjectId = linkedStudent?.subjectId ?? currentUser?.subjectId;
            if (classId && subjectId) {
                filter.$and = [
                    {
                        $or: [
                            { classId },
                            { classIds: classId }
                        ]
                    },
                    { _id: subjectId }
                ];
            }
            else {
                filter._id = { $in: [] };
            }
        }
        if (role === 'parent' || req.user?.role === 'family_student') {
            const currentUser = await User_1.User.findById(req.user?.userId).select('familyId parentProfileId').lean();
            const students = await Student_1.Student.find({
                isDeleted: false,
                ...(currentUser?.familyId ? { familyId: currentUser.familyId } : {}),
                ...(!currentUser?.familyId && currentUser?.parentProfileId ? { parentProfileId: currentUser.parentProfileId } : {})
            }).select('subjectId').lean();
            const subjectIds = students.map((student) => student.subjectId).filter(Boolean);
            filter._id = subjectIds.length ? { $in: subjectIds } : { $in: [] };
        }
        const [subjects, total] = await Promise.all([
            Subject_1.Subject.find(filter)
                .populate('teacher', 'name email')
                .populate('classId', 'className name classCode')
                .lean()
                .skip((page - 1) * limit)
                .limit(limit),
            Subject_1.Subject.countDocuments(filter)
        ]);
        res.json((0, response_1.createResponse)(subjects.map(serializeSubject), '', { page, limit, total }));
    }
    catch (error) {
        next(error);
    }
});
router.post('/', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager']), (0, validate_1.validate)(subjectCreateSchema), async (req, res, next) => {
    try {
        const { klass, teacher } = await validateSubjectRelations(req.body.classId, req.body.teacher || null);
        const duplicate = await Subject_1.Subject.findOne({
            $or: [
                { code: req.body.code.trim() },
                { title: req.body.title.trim(), classId: req.body.classId, isDeleted: false }
            ]
        }).lean();
        if (duplicate) {
            return res.status(409).json((0, response_1.createError)('Subject already exists'));
        }
        const subject = await Subject_1.Subject.create({
            ...req.body,
            branchId: req.body.branchId ?? klass.branchId ?? teacher?.branchId ?? null,
            title: req.body.title.trim(),
            code: req.body.code.trim(),
            description: req.body.description ?? '',
            teacher: req.body.teacher || null,
            classIds: Array.from(new Set([req.body.classId, ...(req.body.classIds ?? [])].map(String))),
            activeStatus: req.body.activeStatus ?? true
        });
        await Promise.all([
            syncTeacherAssignments(String(subject._id), String(req.body.classId), req.body.teacher || null),
            syncClassAssignments(String(subject._id), String(req.body.classId))
        ]);
        const savedSubject = await Subject_1.Subject.findById(subject._id)
            .populate('teacher', 'name email')
            .populate('classId', 'className name classCode')
            .lean();
        res.status(201).json((0, response_1.createResponse)(serializeSubject(savedSubject), 'Subject created successfully'));
    }
    catch (error) {
        if (/invalid/i.test(String(error?.message || ''))) {
            return res.status(400).json((0, response_1.createError)(String(error.message)));
        }
        next(error);
    }
});
router.get('/:id/details', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']), (0, validate_1.validate)(idParamsSchema), async (req, res, next) => {
    try {
        const subject = await Subject_1.Subject.findOne({ _id: req.params.id, isDeleted: false })
            .populate('teacher', 'name email phone whatsapp')
            .populate('classId', 'className name classCode feeAmount weeklySchedule')
            .lean();
        if (!subject)
            return res.status(404).json((0, response_1.createError)('Subject not found'));
        if (!(await canAccessSubject(req, subject)))
            return res.status(403).json((0, response_1.createError)('Access denied'));
        const [students, timetable] = await Promise.all([
            Student_1.Student.find({ subjectId: subject._id, isDeleted: false }).select('firstName lastName studentId status accountStatus').limit(100).lean(),
            Timetable_1.Timetable.find({ subjectId: subject._id, isDeleted: false }).populate('teacherId', 'name email').sort({ dayOfWeek: 1, startTime: 1 }).lean()
        ]);
        res.json((0, response_1.createResponse)({
            ...serializeSubject(subject),
            relatedClass: subject.classId,
            teachers: subject.teacher ? [subject.teacher] : [],
            students,
            studentCount: students.length,
            timetable,
            attendanceRules: {
                source: 'timetable',
                message: 'Attendance is available only during active timetable time.'
            },
            status: subject.activeStatus ? 'active' : 'inactive'
        }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/:id', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']), (0, validate_1.validate)(idParamsSchema), async (req, res, next) => {
    try {
        const subject = await Subject_1.Subject.findOne({ _id: req.params.id, isDeleted: false })
            .populate('teacher', 'name email')
            .populate('classId', 'className name classCode')
            .lean();
        if (!subject)
            return res.status(404).json((0, response_1.createError)('Subject not found'));
        if (!(await canAccessSubject(req, subject)))
            return res.status(403).json((0, response_1.createError)('Access denied'));
        res.json((0, response_1.createResponse)(serializeSubject(subject)));
    }
    catch (error) {
        next(error);
    }
});
const updateSubjectHandler = async (req, res, next) => {
    try {
        const existingSubject = await Subject_1.Subject.findOne({ _id: req.params.id, isDeleted: false }).lean();
        if (!existingSubject) {
            return res.status(404).json((0, response_1.createError)('Subject not found'));
        }
        const nextClassId = req.body.classId ?? String(existingSubject.classId);
        const nextTeacherId = req.body.teacher === '' ? null : (req.body.teacher ?? (existingSubject.teacher ? String(existingSubject.teacher) : null));
        const nextCode = req.body.code ? String(req.body.code).trim() : existingSubject.code;
        const nextTitle = req.body.title ? String(req.body.title).trim() : existingSubject.title;
        await validateSubjectRelations(nextClassId, nextTeacherId);
        const duplicate = await Subject_1.Subject.findOne({
            _id: { $ne: req.params.id },
            isDeleted: false,
            $or: [
                { code: nextCode },
                { title: nextTitle, classId: nextClassId }
            ]
        }).lean();
        if (duplicate) {
            return res.status(409).json((0, response_1.createError)('Subject already exists'));
        }
        const subject = await Subject_1.Subject.findByIdAndUpdate(req.params.id, {
            ...req.body,
            title: nextTitle,
            code: nextCode,
            classId: nextClassId,
            classIds: Array.from(new Set([nextClassId, ...(req.body.classIds ?? existingSubject.classIds ?? [])].map(String))),
            teacher: nextTeacherId,
            description: req.body.description ?? existingSubject.description ?? '',
            branchId: req.body.branchId ?? existingSubject.branchId ?? null
        }, { new: true, runValidators: true })
            .populate('teacher', 'name email')
            .populate('classId', 'className name classCode')
            .lean();
        await Promise.all([
            syncTeacherAssignments(String(req.params.id), String(nextClassId), nextTeacherId, existingSubject.teacher ? String(existingSubject.teacher) : null),
            syncClassAssignments(String(req.params.id), String(nextClassId), existingSubject.classId ? String(existingSubject.classId) : null)
        ]);
        res.json((0, response_1.createResponse)(serializeSubject(subject), 'Subject updated successfully'));
    }
    catch (error) {
        next(error);
    }
};
router.put('/:id', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager']), (0, validate_1.validate)(subjectUpdateSchema), updateSubjectHandler);
router.patch('/:id', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager']), (0, validate_1.validate)(subjectUpdateSchema), updateSubjectHandler);
router.patch('/:id/restore', (0, auth_1.authorize)(['super_admin']), (0, validate_1.validate)(idParamsSchema), async (req, res, next) => {
    try {
        const subject = await Subject_1.Subject.findOneAndUpdate({ _id: req.params.id }, { isDeleted: false, deletedAt: null, deletedBy: null }, { new: true }).lean();
        if (!subject) {
            return res.status(404).json((0, response_1.createError)('Subject not found'));
        }
        res.json((0, response_1.createResponse)(serializeSubject(subject), 'Subject restored successfully'));
    }
    catch (error) {
        next(error);
    }
});
router.delete('/:id', (0, auth_1.authorize)(['super_admin', 'admin']), (0, validate_1.validate)(idParamsSchema), async (req, res, next) => {
    try {
        const [studentCount, examCount, subject] = await Promise.all([
            Student_1.Student.countDocuments({ subjectId: req.params.id, isDeleted: false }),
            Exam_1.Exam.countDocuments({ subject: req.params.id, isDeleted: false }),
            Subject_1.Subject.findOne({ _id: req.params.id, isDeleted: false }).lean()
        ]);
        if (!subject) {
            return res.status(404).json((0, response_1.createError)('Subject not found'));
        }
        if (studentCount > 0 || examCount > 0) {
            return res.status(400).json((0, response_1.createError)('Cannot delete a subject that is linked to students or exams'));
        }
        const deletedAt = new Date();
        await Promise.all([
            Subject_1.Subject.updateOne({ _id: req.params.id }, {
                $set: {
                    isDeleted: true,
                    deletedAt,
                    deletedBy: req.user?.userId ?? null,
                    activeStatus: false
                }
            }),
            User_1.User.updateOne({ _id: subject.teacher, role: 'teacher' }, { $pull: { assignedSubjects: req.params.id } }),
            Class_1.ClassModel.updateOne({ _id: subject.classId }, { $pull: { assignedSubjects: req.params.id } })
        ]);
        res.json((0, response_1.createResponse)({}, 'Subject deleted successfully'));
    }
    catch (error) {
        next(error);
    }
});
exports.subjectRouter = router;
