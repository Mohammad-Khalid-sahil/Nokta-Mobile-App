"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const mongoose_1 = __importDefault(require("mongoose"));
const studentService_1 = require("../../services/studentService");
const httpErrors_1 = require("../../utils/httpErrors");
const Student_1 = require("../../models/Student");
const User_1 = require("../../models/User");
const auth_1 = require("../../middlewares/auth");
const rbac_1 = require("../../middlewares/rbac");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const studentScope_1 = require("../../utils/studentScope");
const Timetable_1 = require("../../models/Timetable");
const Payment_1 = require("../../models/Payment");
const Result_1 = require("../../models/Result");
const Attendance_1 = require("../../models/Attendance");
const Subject_1 = require("../../models/Subject");
const Class_1 = require("../../models/Class");
const Enrollment_1 = require("../../models/Enrollment");
const softDeleteRestore_1 = require("../../utils/softDeleteRestore");
const studentDisplay_1 = require("../../utils/studentDisplay");
const fieldSchemas_1 = require("../../validators/fieldSchemas");
const router = (0, express_1.Router)();
const studentService = new studentService_1.StudentService();
async function teacherCanAccessStudentRecord(teacherId, studentDocId) {
    const student = await Student_1.Student.findOne({
        _id: studentDocId,
        isDeleted: false,
        status: { $ne: 'inactive' }
    })
        .select('_id teacherId classId status')
        .lean();
    if (!student)
        return false;
    if (String(student.teacherId) === String(teacherId))
        return true;
    const [enrollment, classDoc, timetableEntry] = await Promise.all([
        Enrollment_1.Enrollment.findOne({
            studentId: studentDocId,
            teacherId,
            status: 'active',
            isDeleted: { $ne: true }
        }).select('_id').lean(),
        Class_1.ClassModel.findOne({
            _id: student.classId,
            isDeleted: false,
            $or: [{ teacherId }, { assignedTeachers: teacherId }]
        }).select('_id').lean(),
        Timetable_1.Timetable.findOne({
            classId: student.classId,
            teacherId,
            isDeleted: { $ne: true }
        }).select('_id').lean()
    ]);
    return Boolean(enrollment || classDoc || timetableEntry);
}
function serializeStudent(student) {
    const classRef = student?.classId;
    const subjectRef = student?.subjectId;
    const teacherRef = student?.teacherId;
    return {
        ...student,
        classId: classRef?._id ?? classRef ?? null,
        subjectId: subjectRef?._id ?? subjectRef ?? null,
        teacherId: teacherRef?._id ?? teacherRef ?? null,
        className: classRef?.name ?? classRef?.className ?? '',
        subjectName: subjectRef?.title ?? '',
        teacherName: teacherRef?.name ?? '',
        classCode: classRef?.classCode ?? '',
        studentDisplay: student?.studentDisplay ?? {
            studentNumber: student?.studentNumber ?? student?.rollNo ?? student?.studentId ?? '',
            fullName: student?.fullName ?? [student?.firstName, student?.lastName].filter(Boolean).join(' '),
            className: classRef?.name ?? classRef?.className ?? student?.className ?? '',
            subjectName: subjectRef?.title ?? student?.subjectName ?? '',
            teacherName: teacherRef?.name ?? student?.teacherName ?? '',
            guardianPhone: student?.guardianPhone ?? student?.familyPhone ?? '',
            studentPhone: student?.studentPhone ?? student?.phone ?? student?.whatsapp ?? '',
            branchName: student?.branchName ?? '',
            enrollmentStatus: student?.enrollmentStatus ?? student?.status ?? student?.accountStatus ?? ''
        }
    };
}
const registerStudentSchema = joi_1.default.object({
    body: joi_1.default.object({
        firstName: (0, fieldSchemas_1.personNameField)(true),
        lastName: (0, fieldSchemas_1.personNameField)(true),
        fatherName: (0, fieldSchemas_1.personNameField)(true),
        nationalId: joi_1.default.string().trim().max(80).allow('', null).optional(),
        familyPhone: (0, fieldSchemas_1.afghanPhoneField)(false),
        phone: (0, fieldSchemas_1.afghanPhoneField)(false),
        whatsapp: (0, fieldSchemas_1.afghanPhoneField)(false),
        loginEmail: joi_1.default.string().email().allow('', null).optional(),
        loginPassword: joi_1.default.string().min(8).max(64).allow('', null).optional(),
        profileImage: joi_1.default.string().allow('', null).optional(),
        gender: joi_1.default.string().valid('male', 'female', 'other').required(),
        branchId: joi_1.default.string().hex().length(24).optional(),
        classId: joi_1.default.string().hex().length(24).required(),
        subjectId: joi_1.default.string().hex().length(24).required(),
        teacherId: joi_1.default.string().hex().length(24).required(),
        feeAmount: joi_1.default.number().min(0).optional(),
        paidAmount: joi_1.default.number().min(0).optional(),
        registrationStartDate: joi_1.default.date().optional(),
        registrationEndDate: joi_1.default.date().optional(),
        registrationExpiryDate: joi_1.default.date().optional()
    })
});
const updateStudentSchema = joi_1.default.object({
    body: joi_1.default.object({
        firstName: (0, fieldSchemas_1.personNameField)(false),
        lastName: (0, fieldSchemas_1.personNameField)(false),
        fatherName: (0, fieldSchemas_1.personNameField)(false),
        nationalId: joi_1.default.string().trim().max(80).allow('', null).optional(),
        familyPhone: (0, fieldSchemas_1.afghanPhoneField)(false),
        phone: (0, fieldSchemas_1.afghanPhoneField)(false),
        whatsapp: (0, fieldSchemas_1.afghanPhoneField)(false),
        loginEmail: joi_1.default.string().email().allow('', null).optional(),
        loginPassword: joi_1.default.string().min(8).max(64).allow('', null).optional(),
        profileImage: joi_1.default.string().allow('', null).optional(),
        gender: joi_1.default.string().valid('male', 'female', 'other').optional(),
        branchId: joi_1.default.string().hex().length(24).optional(),
        classId: joi_1.default.string().hex().length(24).optional(),
        subjectId: joi_1.default.string().hex().length(24).optional(),
        teacherId: joi_1.default.string().hex().length(24).optional(),
        feeAmount: joi_1.default.number().min(0).optional(),
        paidAmount: joi_1.default.number().min(0).optional(),
        registrationStartDate: joi_1.default.date().optional(),
        registrationEndDate: joi_1.default.date().optional(),
        registrationExpiryDate: joi_1.default.date().allow(null).optional(),
        accountStatus: joi_1.default.string().valid('active', 'warning', 'expired', 'blocked').optional(),
        status: joi_1.default.string().valid('active', 'inactive', 'suspended', 'graduated').optional()
    }).min(1)
});
const updateStudentWithIdSchema = joi_1.default.object({
    params: joi_1.default.object({
        id: joi_1.default.string().hex().length(24).required()
    }),
    body: joi_1.default.object({
        firstName: (0, fieldSchemas_1.personNameField)(false),
        lastName: (0, fieldSchemas_1.personNameField)(false),
        fatherName: (0, fieldSchemas_1.personNameField)(false),
        nationalId: joi_1.default.string().trim().max(80).allow('', null).optional(),
        familyPhone: (0, fieldSchemas_1.afghanPhoneField)(false),
        phone: (0, fieldSchemas_1.afghanPhoneField)(false),
        whatsapp: (0, fieldSchemas_1.afghanPhoneField)(false),
        loginEmail: joi_1.default.string().email().allow('', null).optional(),
        loginPassword: joi_1.default.string().min(8).max(64).allow('', null).optional(),
        profileImage: joi_1.default.string().allow('', null).optional(),
        gender: joi_1.default.string().valid('male', 'female', 'other').optional(),
        branchId: joi_1.default.string().hex().length(24).optional(),
        classId: joi_1.default.string().hex().length(24).optional(),
        subjectId: joi_1.default.string().hex().length(24).optional(),
        teacherId: joi_1.default.string().hex().length(24).optional(),
        feeAmount: joi_1.default.number().min(0).optional(),
        paidAmount: joi_1.default.number().min(0).optional(),
        registrationStartDate: joi_1.default.date().optional(),
        registrationEndDate: joi_1.default.date().optional(),
        registrationExpiryDate: joi_1.default.date().allow(null).optional(),
        accountStatus: joi_1.default.string().valid('active', 'warning', 'expired', 'blocked').optional(),
        status: joi_1.default.string().valid('active', 'inactive', 'suspended', 'graduated').optional()
    }).min(1)
});
const studentListQuerySchema = joi_1.default.object({
    query: joi_1.default.object({
        page: joi_1.default.number().integer().min(1).default(1),
        limit: joi_1.default.number().integer().min(1).max(200).default(20),
        search: joi_1.default.string().allow('', null).optional(),
        classId: joi_1.default.string().hex().length(24).allow('', null).optional(),
        branchId: joi_1.default.string().hex().length(24).allow('', null).optional(),
        status: joi_1.default.string().allow('', null).optional(),
        includeDeleted: joi_1.default.boolean().truthy('true').falsy('false').optional()
    })
});
const renewRegistrationSchema = joi_1.default.object({
    params: joi_1.default.object({ id: joi_1.default.string().hex().length(24).required() }),
    body: joi_1.default.object({
        registrationStartDate: joi_1.default.date().required(),
        registrationEndDate: joi_1.default.date().required(),
        feeAmount: joi_1.default.number().min(0).optional(),
        paidAmount: joi_1.default.number().min(0).optional()
    })
});
const idParamsSchema = joi_1.default.object({
    params: joi_1.default.object({
        id: joi_1.default.string().hex().length(24).required()
    })
});
router.use(auth_1.authenticate);
function respondWithRouteError(res, error, fallbackMessage) {
    const status = (0, httpErrors_1.resolveHttpStatus)(error);
    const message = error instanceof Error ? error.message : fallbackMessage;
    if (status >= 500) {
        console.error(fallbackMessage, error);
    }
    return res.status(status).json((0, response_1.createError)(message || fallbackMessage));
}
// Register student - admin only
router.post('/', rbac_1.requireAdmin, (0, validate_1.validate)(registerStudentSchema), async (req, res) => {
    try {
        const classId = req.body.classId || req.body.class;
        const subjectId = req.body.subjectId || req.body.subject;
        const teacherId = req.body.teacherId || req.body.teacher;
        if (!classId || !subjectId || !teacherId) {
            return res.status(400).json((0, response_1.createError)('Missing required fields: classId, subjectId, or teacherId'));
        }
        const count = await Student_1.Student.countDocuments();
        req.body.rollNo = `STD-${count + 1}`;
        const student = await studentService.registerStudent({
            ...req.body,
            classId,
            subjectId,
            teacherId,
            createdBy: req.user?.userId ?? null
        });
        res.status(201).json((0, response_1.createResponse)(await (0, studentDisplay_1.enrichStudentWithDisplay)(student.toObject ? student.toObject() : student), 'Student registered successfully'));
    }
    catch (error) {
        if (error instanceof mongoose_1.default.Error.ValidationError) {
            return res.status(400).json((0, response_1.createError)(error.message));
        }
        return respondWithRouteError(res, error, 'Failed to register student');
    }
});
router.put('/:id', rbac_1.requireAdmin, (0, validate_1.validate)(updateStudentWithIdSchema), async (req, res) => {
    try {
        const updatedStudent = await studentService.updateStudent(req.params.id, { ...req.body, updatedBy: req.user?.userId ?? null });
        if (!updatedStudent) {
            return res.status(404).json((0, response_1.createError)('Student not found'));
        }
        res.json((0, response_1.createResponse)(await (0, studentDisplay_1.enrichStudentWithDisplay)(updatedStudent.toObject ? updatedStudent.toObject() : updatedStudent), 'Student updated successfully'));
    }
    catch (error) {
        if (error instanceof mongoose_1.default.Error.ValidationError) {
            return res.status(400).json((0, response_1.createError)(error.message));
        }
        return respondWithRouteError(res, error, 'Failed to update student');
    }
});
router.post('/:id/renew-registration', rbac_1.requireAdmin, (0, validate_1.validate)(renewRegistrationSchema), async (req, res) => {
    try {
        const student = await studentService.renewRegistration(req.params.id, { ...req.body, actorId: req.user?.userId ?? null });
        if (!student)
            return res.status(404).json((0, response_1.createError)('Student not found'));
        res.json((0, response_1.createResponse)(student, 'Student registration renewed successfully'));
    }
    catch (error) {
        res.status(400).json((0, response_1.createError)(String(error?.message || 'Failed to renew registration')));
    }
});
router.post('/:id/block', rbac_1.requireAdmin, (0, validate_1.validate)(idParamsSchema), async (req, res) => {
    try {
        const student = await studentService.setBlockStatus(req.params.id, true, req.user?.userId ?? null);
        if (!student)
            return res.status(404).json((0, response_1.createError)('Student not found'));
        res.json((0, response_1.createResponse)(student, 'Student account blocked successfully'));
    }
    catch (error) {
        res.status(400).json((0, response_1.createError)(String(error?.message || 'Failed to block student')));
    }
});
router.post('/:id/unblock', rbac_1.requireAdmin, (0, validate_1.validate)(idParamsSchema), async (req, res) => {
    try {
        const student = await studentService.setBlockStatus(req.params.id, false, req.user?.userId ?? null);
        if (!student)
            return res.status(404).json((0, response_1.createError)('Student not found'));
        res.json((0, response_1.createResponse)(student, 'Student account unblocked successfully'));
    }
    catch (error) {
        res.status(400).json((0, response_1.createError)(String(error?.message || 'Failed to unblock student')));
    }
});
router.get('/', rbac_1.requireTeacher, (0, validate_1.validate)(studentListQuerySchema), async (req, res) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        const search = String(req.query.search || '').trim();
        const includeDeletedQuery = req.query.includeDeleted;
        const includeDeleted = req.user?.canonicalRole === 'super_admin' &&
            (includeDeletedQuery === true || includeDeletedQuery === 'true');
        const filter = includeDeleted ? {} : { isDeleted: false };
        const andClauses = [];
        if (search) {
            andClauses.push({
                $or: [
                    { firstName: { $regex: search, $options: 'i' } },
                    { lastName: { $regex: search, $options: 'i' } },
                    { fatherName: { $regex: search, $options: 'i' } },
                    { studentId: { $regex: search, $options: 'i' } },
                    { familyPhone: { $regex: search, $options: 'i' } },
                    { whatsapp: { $regex: search, $options: 'i' } },
                    { loginEmail: { $regex: search, $options: 'i' } },
                    { familyEmail: { $regex: search, $options: 'i' } }
                ]
            });
        }
        if (req.user?.canonicalRole === 'teacher') {
            const teacherId = req.user.userId;
            const [enrollmentStudentIds, teacherClassIds] = await Promise.all([
                Enrollment_1.Enrollment.distinct('studentId', {
                    teacherId,
                    status: 'active',
                    isDeleted: { $ne: true }
                }),
                Class_1.ClassModel.distinct('_id', {
                    isDeleted: false,
                    $or: [{ teacherId }, { assignedTeachers: teacherId }]
                })
            ]);
            const classStudentIds = teacherClassIds.length
                ? await Student_1.Student.distinct('_id', {
                    classId: { $in: teacherClassIds },
                    status: 'active',
                    isDeleted: false
                })
                : [];
            const relatedStudentIds = [
                ...new Set([
                    ...enrollmentStudentIds.map(String),
                    ...classStudentIds.map(String)
                ])
            ];
            andClauses.push({
                $or: [
                    { teacherId },
                    ...(relatedStudentIds.length ? [{ _id: { $in: relatedStudentIds } }] : [])
                ]
            });
        }
        if (andClauses.length) {
            filter.$and = andClauses;
        }
        if (req.query.branchId && ['super_admin', 'admin', 'branch_manager', 'owner'].includes(String(req.user?.canonicalRole))) {
            filter.branchId = req.query.branchId;
        }
        if (req.query.classId) {
            filter.classId = req.query.classId;
        }
        if (req.query.status) {
            filter.status = req.query.status;
        }
        if (req.user?.canonicalRole === 'student') {
            const context = await (0, studentScope_1.resolveStudentContext)(req);
            filter._id = context?.studentDocId ?? { $in: [] };
        }
        if (req.user?.canonicalRole === 'parent' || req.user?.role === 'family_student') {
            const currentUser = await User_1.User.findById(req.user?.userId).select('familyId parentProfileId').lean();
            const familyStudents = await Student_1.Student.find({
                isDeleted: false,
                ...(currentUser?.familyId ? { familyId: currentUser.familyId } : {}),
                ...(!currentUser?.familyId && currentUser?.parentProfileId ? { parentProfileId: currentUser.parentProfileId } : {})
            }).select('_id').lean();
            filter._id = { $in: familyStudents.map((student) => student._id) };
        }
        const [students, total] = await Promise.all([
            studentDisplay_1.studentPopulatePaths.reduce((query, populate) => query.populate(populate), Student_1.Student.find(filter))
                .lean()
                .skip((page - 1) * limit)
                .limit(limit),
            Student_1.Student.countDocuments(filter)
        ]);
        const normalizedStudents = await (0, studentDisplay_1.enrichStudentsWithDisplay)(students);
        res.json((0, response_1.createResponse)(normalizedStudents.map(serializeStudent), '', { page, limit, total }));
    }
    catch (error) {
        res.status(500).json((0, response_1.createError)(String(error?.message || 'Failed to fetch students')));
    }
});
router.patch('/:id/restore', (0, auth_1.authorize)(['super_admin']), (0, validate_1.validate)(idParamsSchema), async (req, res) => {
    try {
        const restored = await (0, softDeleteRestore_1.restoreSoftDeletedRecord)(Student_1.Student, req.params.id);
        if (!restored) {
            return res.status(404).json((0, response_1.createError)('Student not found'));
        }
        res.json((0, response_1.createResponse)(restored, 'Student restored successfully'));
    }
    catch (error) {
        res.status(500).json((0, response_1.createError)(String(error?.message || 'Failed to restore student')));
    }
});
router.delete('/:id', rbac_1.requireAdmin, (0, validate_1.validate)(idParamsSchema), async (req, res) => {
    try {
        const deletedStudent = await studentService.deleteStudent(req.params.id, req.user?.userId ?? null);
        if (!deletedStudent) {
            return res.status(404).json((0, response_1.createError)('Student not found'));
        }
        res.json((0, response_1.createResponse)({}, 'Student deleted successfully'));
    }
    catch (error) {
        res.status(500).json((0, response_1.createError)(String(error?.message || 'Failed to delete student')));
    }
});
// Get students by family - family only
router.get('/family', rbac_1.requireFamily, async (req, res) => {
    try {
        const currentUser = await User_1.User.findById(req.user?.userId).lean();
        const familyId = currentUser?.familyId;
        if (!familyId) {
            return res.json((0, response_1.createResponse)([]));
        }
        const students = await studentService.getStudentsByFamily(familyId);
        const normalizedStudents = await (0, studentDisplay_1.enrichStudentsWithDisplay)(students.map((student) => student.toObject()));
        res.json((0, response_1.createResponse)(normalizedStudents));
    }
    catch (error) {
        res.status(500).json((0, response_1.createError)('Failed to fetch students'));
    }
});
// Get students by teacher - teacher only
router.get('/me/dashboard', async (req, res) => {
    try {
        if (req.user?.canonicalRole !== 'student') {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        const context = await (0, studentScope_1.resolveStudentContext)(req);
        if (!context?.student && !context?.user) {
            return res.status(404).json((0, response_1.createError)('Student profile not found'));
        }
        const studentDocId = context.studentDocId;
        const userId = req.user?.userId;
        const [payments, results, attendanceCount] = await Promise.all([
            studentDocId
                ? Payment_1.Payment.find({ studentId: studentDocId, isDeleted: false }).sort({ createdAt: -1 }).limit(5).lean()
                : [],
            Result_1.Result.find({ student: userId, isDeleted: false }).sort({ createdAt: -1 }).limit(5).lean(),
            Attendance_1.Attendance.countDocuments({ userId, isDeleted: false })
        ]);
        res.json((0, response_1.createResponse)({
            profile: {
                name: context.user.name,
                email: context.user.email,
                phone: context.user.phone,
                studentId: context.student?.studentId ?? context.user.studentId,
                class: context.student?.classId ?? null,
                subject: context.student?.subjectId ?? null,
                teacher: context.student?.teacherId ?? null,
                feeAmount: context.student?.feeAmount ?? context.user.feeAmount,
                remainingBalance: context.student?.remainingBalance ?? context.user.remainingBalance
            },
            payments,
            results,
            attendanceCount
        }));
    }
    catch (error) {
        res.status(500).json((0, response_1.createError)(String(error?.message || 'Failed to load student dashboard')));
    }
});
router.get('/me/profile', async (req, res) => {
    try {
        if (req.user?.canonicalRole !== 'student') {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        const context = await (0, studentScope_1.resolveStudentContext)(req);
        if (!context)
            return res.status(404).json((0, response_1.createError)('Student profile not found'));
        res.json((0, response_1.createResponse)({
            user: context.user,
            student: context.student ? await (0, studentDisplay_1.enrichStudentWithDisplay)(serializeStudent(context.student)) : null
        }));
    }
    catch (error) {
        res.status(500).json((0, response_1.createError)(String(error?.message || 'Failed to load profile')));
    }
});
router.get('/me/classes', async (req, res) => {
    try {
        if (req.user?.canonicalRole !== 'student') {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        const context = await (0, studentScope_1.resolveStudentContext)(req);
        if (!context?.classId)
            return res.json((0, response_1.createResponse)([]));
        const klass = await Class_1.ClassModel.findOne({ _id: context.classId, isDeleted: false })
            .populate('assignedTeachers', 'name email')
            .populate('assignedSubjects', 'title code')
            .lean();
        res.json((0, response_1.createResponse)(klass ? [klass] : []));
    }
    catch (error) {
        res.status(500).json((0, response_1.createError)(String(error?.message || 'Failed to load classes')));
    }
});
router.get('/me/subjects', async (req, res) => {
    try {
        if (req.user?.canonicalRole !== 'student') {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        const context = await (0, studentScope_1.resolveStudentContext)(req);
        if (!context?.subjectId)
            return res.json((0, response_1.createResponse)([]));
        const subject = await Subject_1.Subject.findOne({ _id: context.subjectId, isDeleted: false }).lean();
        res.json((0, response_1.createResponse)(subject ? [subject] : []));
    }
    catch (error) {
        res.status(500).json((0, response_1.createError)(String(error?.message || 'Failed to load subjects')));
    }
});
router.get('/me/teachers', async (req, res) => {
    try {
        if (req.user?.canonicalRole !== 'student') {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        const context = await (0, studentScope_1.resolveStudentContext)(req);
        if (!context?.teacherId)
            return res.json((0, response_1.createResponse)([]));
        const teacher = await User_1.User.findOne({ _id: context.teacherId, role: 'teacher', isDeleted: false })
            .select('name email phone whatsapp')
            .lean();
        res.json((0, response_1.createResponse)(teacher ? [teacher] : []));
    }
    catch (error) {
        res.status(500).json((0, response_1.createError)(String(error?.message || 'Failed to load teachers')));
    }
});
router.get('/me/timetable', async (req, res) => {
    try {
        if (req.user?.canonicalRole !== 'student') {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        const context = await (0, studentScope_1.resolveStudentContext)(req);
        if (!context?.classId)
            return res.json((0, response_1.createResponse)([]));
        const items = await Timetable_1.Timetable.find({ classId: context.classId, isDeleted: false })
            .populate('subjectId', 'title code')
            .populate('teacherId', 'name email')
            .sort({ dayOfWeek: 1, startTime: 1 })
            .lean();
        res.json((0, response_1.createResponse)(items));
    }
    catch (error) {
        res.status(500).json((0, response_1.createError)(String(error?.message || 'Failed to load timetable')));
    }
});
router.get('/me/payments', async (req, res) => {
    try {
        if (req.user?.canonicalRole !== 'student') {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        const context = await (0, studentScope_1.resolveStudentContext)(req);
        if (!context?.studentDocId)
            return res.json((0, response_1.createResponse)([]));
        const payments = await Payment_1.Payment.find({ studentId: context.studentDocId, isDeleted: false })
            .sort({ createdAt: -1 })
            .lean();
        res.json((0, response_1.createResponse)(payments));
    }
    catch (error) {
        res.status(500).json((0, response_1.createError)(String(error?.message || 'Failed to load payments')));
    }
});
router.get('/teacher', rbac_1.requireTeacher, async (req, res) => {
    try {
        const teacherId = req.user?.userId;
        if (!teacherId) {
            return res.status(401).json((0, response_1.createError)('Authentication required'));
        }
        const students = await studentService.getStudentsByTeacher(teacherId);
        const normalizedStudents = await (0, studentDisplay_1.enrichStudentsWithDisplay)(students.map((student) => student.toObject()));
        res.json((0, response_1.createResponse)(normalizedStudents));
    }
    catch (error) {
        res.status(500).json((0, response_1.createError)('Failed to fetch students'));
    }
});
router.get('/:id', rbac_1.requireTeacher, (0, validate_1.validate)(idParamsSchema), async (req, res) => {
    try {
        const filter = {
            _id: req.params.id,
            isDeleted: false
        };
        if (req.user?.canonicalRole === 'teacher') {
            const allowed = await teacherCanAccessStudentRecord(String(req.user.userId), String(req.params.id));
            if (!allowed) {
                return res.status(404).json((0, response_1.createError)('Student not found'));
            }
        }
        else if (req.user?.canonicalRole === 'student') {
            const context = await (0, studentScope_1.resolveStudentContext)(req);
            if (String(context?.studentDocId ?? '') !== String(req.params.id)) {
                return res.status(404).json((0, response_1.createError)('Student not found'));
            }
        }
        const student = await studentDisplay_1.studentPopulatePaths.reduce((query, populate) => query.populate(populate), Student_1.Student.findOne(filter))
            .lean();
        if (!student) {
            return res.status(404).json((0, response_1.createError)('Student not found'));
        }
        res.json((0, response_1.createResponse)(serializeStudent(await (0, studentDisplay_1.enrichStudentWithDisplay)(student))));
    }
    catch (error) {
        res.status(500).json((0, response_1.createError)(String(error?.message || 'Failed to fetch student')));
    }
});
exports.studentRouter = router;
