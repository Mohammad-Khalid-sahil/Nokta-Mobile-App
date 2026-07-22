"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.examRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const Exam_1 = require("../../models/Exam");
const Subject_1 = require("../../models/Subject");
const Class_1 = require("../../models/Class");
const User_1 = require("../../models/User");
const Student_1 = require("../../models/Student");
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const pagination_1 = require("../../validators/pagination");
const recordVisibility_1 = require("../../utils/recordVisibility");
const timetableValidationService_1 = require("../../services/timetableValidationService");
const Teacher_1 = require("../../models/Teacher");
const router = (0, express_1.Router)();
const examSchema = joi_1.default.object({
    body: joi_1.default.object({
        title: joi_1.default.string().required(),
        subject: joi_1.default.string().hex().length(24).required(),
        class: joi_1.default.string().hex().length(24).required(),
        teacherId: joi_1.default.string().hex().length(24).optional(),
        date: joi_1.default.date().required(),
        totalMarks: joi_1.default.number().min(1).default(100),
        passingMarks: joi_1.default.number().min(1).optional(),
        examType: joi_1.default.string().valid('weekly', 'monthly', 'book').required(),
        onlineExamUrl: joi_1.default.string().uri().allow('', null).optional(),
        googleFormUrl: joi_1.default.string().uri().allow('', null).optional(),
        status: joi_1.default.string().valid('draft', 'published').optional()
    })
});
const examUpdateSchema = joi_1.default.object({
    body: joi_1.default.object({
        title: joi_1.default.string().optional(),
        subject: joi_1.default.string().hex().length(24).optional(),
        class: joi_1.default.string().hex().length(24).optional(),
        teacherId: joi_1.default.string().hex().length(24).optional(),
        date: joi_1.default.date().optional(),
        totalMarks: joi_1.default.number().min(1).optional(),
        passingMarks: joi_1.default.number().min(1).optional(),
        examType: joi_1.default.string().valid('weekly', 'monthly', 'book').optional(),
        onlineExamUrl: joi_1.default.string().uri().allow('', null).optional(),
        googleFormUrl: joi_1.default.string().uri().allow('', null).optional(),
        status: joi_1.default.string().valid('draft', 'published').optional()
    }).min(1)
});
const readRoles = ['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'parent', 'owner'];
const writeRoles = ['super_admin', 'admin', 'branch_manager', 'teacher'];
const deleteRoles = ['super_admin', 'admin'];
function buildExamCode(title) {
    const slug = title
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 18) || 'EXAM';
    return `${slug}-${Date.now().toString().slice(-6)}`;
}
function idsEqual(left, right) {
    return String(left ?? '') === String(right ?? '');
}
async function ensureExamRelations(subjectId, classId, teacherId) {
    const [subject, klass, teacher, teacherProfile] = await Promise.all([
        Subject_1.Subject.findOne({ _id: subjectId, isDeleted: false }).lean(),
        Class_1.ClassModel.findOne({ _id: classId, isDeleted: false }).lean(),
        User_1.User.findOne({ _id: teacherId, role: 'teacher', isDeleted: false }).lean(),
        Teacher_1.TeacherProfile.findOne({ userId: teacherId, isDeleted: false }).lean()
    ]);
    if (!subject || Array.isArray(subject))
        return 'Subject not found';
    if (!klass || Array.isArray(klass))
        return 'Class not found';
    if (!teacher || Array.isArray(teacher) || teacher.role !== 'teacher')
        return 'Teacher not found';
    if (!(0, timetableValidationService_1.subjectBelongsToClass)(subject, klass)) {
        return 'Selected subject does not belong to the selected class';
    }
    const mergedTeacher = {
        ...teacher,
        assignedSubjects: [
            ...(Array.isArray(teacher.assignedSubjects) ? teacher.assignedSubjects : []),
            ...(Array.isArray(teacherProfile?.assignedSubjectIds) ? teacherProfile.assignedSubjectIds : [])
        ],
        assignedClasses: [
            ...(Array.isArray(teacher.assignedClasses) ? teacher.assignedClasses : []),
            ...(Array.isArray(teacherProfile?.assignedClassIds) ? teacherProfile.assignedClassIds : [])
        ]
    };
    if ((0, timetableValidationService_1.teacherCanTeachClassSubject)(mergedTeacher, klass, subject)) {
        return null;
    }
    // Teachers assigned to the class may create exams for any subject linked to that class.
    const assignedClassIds = mergedTeacher.assignedClasses.map((item) => String(item?._id ?? item));
    const classTeacherIds = Array.isArray(klass.assignedTeachers)
        ? klass.assignedTeachers.map((item) => String(item?._id ?? item))
        : [];
    const teachesClass = (klass.teacherId && String(klass.teacherId) === String(teacher._id)) ||
        classTeacherIds.includes(String(teacher._id)) ||
        assignedClassIds.includes(String(klass._id));
    if (teachesClass) {
        return null;
    }
    return 'Selected teacher is not assigned to the selected subject';
}
function serializeExam(exam) {
    const googleFormUrl = String(exam?.googleFormUrl ?? '').trim();
    const onlineExamUrl = String(exam?.onlineExamUrl ?? '').trim();
    const mode = googleFormUrl || onlineExamUrl ? 'online' : 'in_person';
    return {
        ...exam,
        subjectName: exam?.subject?.title ?? exam?.subjectName ?? exam?.subjectTitle ?? '',
        className: exam?.class?.className ?? exam?.class?.name ?? exam?.className ?? '',
        teacherName: exam?.teacherId?.name ?? exam?.teacher?.name ?? exam?.teacherName ?? '',
        googleFormUrl,
        onlineExamUrl,
        examUrl: onlineExamUrl || googleFormUrl || '',
        mode,
        deliveryMode: mode
    };
}
async function resolveScopedStudentAssignment(userId) {
    const currentUser = await User_1.User.findById(userId).select('studentId classId subjectId').lean();
    const linkedStudent = currentUser?.studentId
        ? await Student_1.Student.findOne({ studentId: currentUser.studentId, isDeleted: false }).select('classId subjectId').lean()
        : null;
    return {
        classId: linkedStudent?.classId ?? currentUser?.classId ?? null,
        subjectId: linkedStudent?.subjectId ?? currentUser?.subjectId ?? null
    };
}
router.use(auth_1.authenticate);
router.post('/', (0, auth_1.authorize)(writeRoles), (0, validate_1.validate)(examSchema), async (req, res, next) => {
    try {
        const teacherId = req.body.teacherId ?? (req.user?.canonicalRole === 'teacher' ? req.user.userId : null);
        if (!teacherId) {
            return res.status(400).json((0, response_1.createError)('Teacher is required'));
        }
        const relationError = await ensureExamRelations(req.body.subject, req.body.class, teacherId);
        if (relationError) {
            return res.status(400).json((0, response_1.createError)(relationError));
        }
        const subjectDoc = await Subject_1.Subject.findById(req.body.subject).select('branchId').lean();
        const exam = await Exam_1.Exam.create({
            ...req.body,
            teacherId,
            totalMarks: Number(req.body.totalMarks ?? 100) || 100,
            passingMarks: Number(req.body.passingMarks ?? 60) || 60,
            branchId: subjectDoc?.branchId ?? null,
            examCode: buildExamCode(req.body.title),
            publishedAt: req.body.status === 'published' ? new Date() : null
        });
        const populated = await Exam_1.Exam.findById(exam._id)
            .populate('subject', 'title code')
            .populate('class', 'className name classCode')
            .populate('teacherId', 'name email')
            .lean();
        res.status(201).json((0, response_1.createResponse)(serializeExam(populated), 'Exam created successfully'));
    }
    catch (error) {
        next(error);
    }
});
router.put('/:id', (0, auth_1.authorize)(writeRoles), (0, validate_1.validate)(examUpdateSchema), async (req, res, next) => {
    try {
        const currentExam = await Exam_1.Exam.findById(req.params.id).lean();
        if (!currentExam) {
            return res.status(404).json((0, response_1.createError)('Exam not found'));
        }
        if (req.user?.canonicalRole === 'teacher' && String(currentExam.teacherId) !== String(req.user.userId)) {
            return res.status(403).json((0, response_1.createError)('Teachers can only edit their own exams'));
        }
        const nextSubject = req.body.subject ?? String(currentExam.subject);
        const nextClass = req.body.class ?? String(currentExam.class);
        const nextTeacherId = req.body.teacherId ?? String(currentExam.teacherId);
        const relationError = await ensureExamRelations(nextSubject, nextClass, nextTeacherId);
        if (relationError) {
            return res.status(400).json((0, response_1.createError)(relationError));
        }
        const subjectDoc = await Subject_1.Subject.findById(nextSubject).select('branchId').lean();
        const nextStatus = req.body.status ?? currentExam.status;
        const updatePayload = {
            ...req.body,
            teacherId: nextTeacherId,
            branchId: subjectDoc?.branchId ?? currentExam.branchId ?? null,
            publishedAt: nextStatus === 'published' ? currentExam.publishedAt ?? new Date() : null
        };
        // Keep online/in-person mode consistent with submitted link fields.
        if (Object.prototype.hasOwnProperty.call(req.body, 'googleFormUrl') ||
            Object.prototype.hasOwnProperty.call(req.body, 'onlineExamUrl')) {
            const nextGoogle = Object.prototype.hasOwnProperty.call(req.body, 'googleFormUrl')
                ? String(req.body.googleFormUrl ?? '').trim()
                : String(currentExam.googleFormUrl ?? '').trim();
            const nextOnline = Object.prototype.hasOwnProperty.call(req.body, 'onlineExamUrl')
                ? String(req.body.onlineExamUrl ?? '').trim()
                : String(currentExam.onlineExamUrl ?? '').trim();
            updatePayload.googleFormUrl = nextGoogle;
            updatePayload.onlineExamUrl = nextOnline;
        }
        const exam = await Exam_1.Exam.findByIdAndUpdate(req.params.id, updatePayload, { new: true, runValidators: true })
            .populate('subject', 'title code')
            .populate('class', 'className name classCode')
            .populate('teacherId', 'name email')
            .lean();
        res.json((0, response_1.createResponse)(serializeExam(exam), 'Exam updated'));
    }
    catch (error) {
        next(error);
    }
});
router.get('/', (0, auth_1.authorize)(readRoles), (0, validate_1.validate)(pagination_1.paginationSchema), async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        const search = String(req.query.search || '').trim();
        const filter = { ...(0, recordVisibility_1.listRecordFilter)(req.user) };
        if (search) {
            filter.title = { $regex: search, $options: 'i' };
        }
        const role = req.user?.canonicalRole ?? req.user?.role;
        if (role === 'teacher') {
            filter.teacherId = req.user?.userId;
        }
        if (role === 'student') {
            const { classId, subjectId } = await resolveScopedStudentAssignment(String(req.user?.userId ?? ''));
            if (!classId || !subjectId) {
                filter._id = { $in: [] };
            }
            else {
                filter.class = classId;
                filter.subject = subjectId;
            }
        }
        if (role === 'parent' || role === 'family_student') {
            const currentUser = await User_1.User.findById(req.user?.userId).select('familyId parentProfileId').lean();
            const students = await Student_1.Student.find({
                isDeleted: false,
                ...(currentUser?.familyId ? { familyId: currentUser.familyId } : {}),
                ...(!currentUser?.familyId && currentUser?.parentProfileId ? { parentProfileId: currentUser.parentProfileId } : {})
            }).select('classId subjectId').lean();
            const classIds = students.map((student) => student.classId).filter(Boolean);
            const subjectIds = students.map((student) => student.subjectId).filter(Boolean);
            filter.class = classIds.length ? { $in: classIds } : { $in: [] };
            filter.subject = subjectIds.length ? { $in: subjectIds } : { $in: [] };
        }
        const [exams, total] = await Promise.all([
            Exam_1.Exam.find(filter)
                .populate('subject', 'title code')
                .populate('class', 'className name classCode')
                .populate('teacherId', 'name email')
                .lean()
                .skip((page - 1) * limit)
                .limit(limit),
            Exam_1.Exam.countDocuments(filter)
        ]);
        res.json((0, response_1.createResponse)(exams.map(serializeExam), '', { page, limit, total }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/:id', (0, auth_1.authorize)(readRoles), async (req, res, next) => {
    try {
        const exam = await Exam_1.Exam.findOne({ _id: req.params.id, isDeleted: false })
            .populate('subject', 'title code')
            .populate('class', 'className name classCode')
            .populate('teacherId', 'name email')
            .lean();
        if (!exam)
            return res.status(404).json((0, response_1.createError)('Exam not found'));
        const role = req.user?.canonicalRole ?? req.user?.role;
        if (role === 'teacher' && !idsEqual(exam.teacherId?._id ?? exam.teacherId, req.user?.userId)) {
            return res.status(403).json((0, response_1.createError)('Access denied'));
        }
        if (role === 'student') {
            const { classId, subjectId } = await resolveScopedStudentAssignment(String(req.user?.userId ?? ''));
            if (!idsEqual(exam.class?._id ?? exam.class, classId) || !idsEqual(exam.subject?._id ?? exam.subject, subjectId)) {
                return res.status(403).json((0, response_1.createError)('Access denied'));
            }
        }
        if (role === 'parent' || role === 'family_student') {
            const currentUser = await User_1.User.findById(req.user?.userId).select('familyId parentProfileId').lean();
            const students = await Student_1.Student.find({
                isDeleted: false,
                ...(currentUser?.familyId ? { familyId: currentUser.familyId } : {}),
                ...(!currentUser?.familyId && currentUser?.parentProfileId ? { parentProfileId: currentUser.parentProfileId } : {})
            }).select('classId subjectId').lean();
            const allow = students.some((student) => idsEqual(student.classId, exam.class?._id ?? exam.class) && idsEqual(student.subjectId, exam.subject?._id ?? exam.subject));
            if (!allow) {
                return res.status(403).json((0, response_1.createError)('Access denied'));
            }
        }
        res.json((0, response_1.createResponse)(serializeExam(exam)));
    }
    catch (error) {
        next(error);
    }
});
router.delete('/:id', (0, auth_1.authorize)(deleteRoles), async (req, res, next) => {
    try {
        const exam = await Exam_1.Exam.findOneAndUpdate({ _id: req.params.id, isDeleted: false }, {
            $set: {
                isDeleted: true,
                deletedAt: new Date(),
                deletedBy: req.user?.userId ?? null
            }
        }, { new: true }).lean();
        if (!exam) {
            return res.status(404).json((0, response_1.createError)('Exam not found'));
        }
        res.json((0, response_1.createResponse)({}, 'Exam deleted successfully'));
    }
    catch (error) {
        next(error);
    }
});
exports.examRouter = router;
