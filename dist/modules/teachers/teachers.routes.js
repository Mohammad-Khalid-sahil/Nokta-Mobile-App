"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.teacherRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const mongoose_1 = __importDefault(require("mongoose"));
const userService_1 = require("../../services/userService");
const Teacher_1 = require("../../models/Teacher");
const User_1 = require("../../models/User");
const Student_1 = require("../../models/Student");
const Subject_1 = require("../../models/Subject");
const Class_1 = require("../../models/Class");
const auth_1 = require("../../middlewares/auth");
const rbac_1 = require("../../middlewares/rbac");
const validate_1 = require("../../middlewares/validate");
const rateLimiter_1 = require("../../middlewares/rateLimiter");
const response_1 = require("../../helpers/response");
const recordVisibility_1 = require("../../utils/recordVisibility");
const fieldSchemas_1 = require("../../validators/fieldSchemas");
const router = (0, express_1.Router)();
const userService = new userService_1.UserService();
const createTeacherSchema = joi_1.default.object({
    body: joi_1.default.object({
        name: (0, fieldSchemas_1.personNameField)(false),
        firstName: (0, fieldSchemas_1.personNameField)(false),
        lastName: (0, fieldSchemas_1.personNameField)(false),
        email: joi_1.default.string().email().required(),
        password: joi_1.default.string().min(8).max(64).required(),
        phone: (0, fieldSchemas_1.afghanPhoneField)(false),
        profileImage: joi_1.default.string().allow('', null).optional(),
        whatsapp: (0, fieldSchemas_1.afghanPhoneField)(false),
        address: joi_1.default.string().optional(),
        gender: joi_1.default.string().valid('male', 'female', 'other').optional(),
        branchId: joi_1.default.string().hex().length(24).optional(),
        salaryType: joi_1.default.string().valid('fixed', 'percentage', 'fixed_plus_percentage').required(),
        salaryValue: joi_1.default.number().min(0).optional(),
        fixedSalary: joi_1.default.number().min(0).optional(),
        percentageRate: joi_1.default.number().min(0).max(100).optional(),
        customPercentage: joi_1.default.number().min(0).max(100).optional(),
        assignedSubjects: joi_1.default.array().items(joi_1.default.string().hex().length(24)).optional(),
        assignedClasses: joi_1.default.array().items(joi_1.default.string().hex().length(24)).optional()
    }).or('name', 'firstName')
});
const idParamsSchema = joi_1.default.object({
    params: joi_1.default.object({
        id: joi_1.default.string().hex().length(24).required()
    })
});
const updateTeacherSchema = joi_1.default.object({
    params: joi_1.default.object({
        id: joi_1.default.string().hex().length(24).required()
    }),
    body: joi_1.default.object({
        name: (0, fieldSchemas_1.personNameField)(false),
        firstName: (0, fieldSchemas_1.personNameField)(false),
        lastName: (0, fieldSchemas_1.personNameField)(false),
        email: joi_1.default.string().email().optional(),
        password: joi_1.default.string().min(8).max(64).allow('', null).optional(),
        phone: (0, fieldSchemas_1.afghanPhoneField)(false),
        profileImage: joi_1.default.string().allow('', null).optional(),
        whatsapp: (0, fieldSchemas_1.afghanPhoneField)(false),
        address: joi_1.default.string().allow('', null).optional(),
        gender: joi_1.default.string().valid('male', 'female', 'other').optional(),
        branchId: joi_1.default.string().hex().length(24).allow('', null).optional(),
        salaryType: joi_1.default.string().valid('fixed', 'percentage', 'fixed_plus_percentage').optional(),
        salaryValue: joi_1.default.number().min(0).optional(),
        fixedSalary: joi_1.default.number().min(0).optional(),
        percentageRate: joi_1.default.number().min(0).max(100).optional(),
        customPercentage: joi_1.default.number().min(0).max(100).optional(),
        assignedSubjects: joi_1.default.array().items(joi_1.default.string().hex().length(24)).optional(),
        assignedClasses: joi_1.default.array().items(joi_1.default.string().hex().length(24)).optional(),
        active: joi_1.default.boolean().optional(),
        status: joi_1.default.string().valid('active', 'inactive', 'locked', 'suspended', 'pending_verification').optional()
    }).min(1)
});
const teacherQuerySchema = joi_1.default.object({
    query: joi_1.default.object({
        classId: joi_1.default.string().hex().length(24).optional(),
        subjectId: joi_1.default.string().hex().length(24).optional()
    })
});
router.get('/public/best', async (req, res, next) => {
    try {
        const limit = Math.min(Math.max(Number(req.query.limit ?? 8), 1), 24);
        const teachers = await User_1.User.find({
            role: 'teacher',
            isDeleted: false,
            active: { $ne: false },
            status: { $nin: ['inactive', 'locked', 'suspended'] }
        })
            .select('name firstName lastName email profileImage assignedSubjects assignedClasses branchId createdAt')
            .populate('assignedSubjects', 'title')
            .populate('assignedClasses', 'className name studentCount')
            .populate('branchId', 'name city')
            .lean();
        const classIds = teachers.flatMap((teacher) => (Array.isArray(teacher.assignedClasses) ? teacher.assignedClasses : [])
            .map((klass) => klass?._id)
            .filter(Boolean));
        const studentCounts = classIds.length
            ? await Student_1.Student.aggregate([
                { $match: { classId: { $in: classIds }, isDeleted: false } },
                { $group: { _id: '$classId', count: { $sum: 1 } } }
            ])
            : [];
        const countMap = new Map(studentCounts.map((item) => [String(item._id), Number(item.count)]));
        const ranked = teachers
            .map((teacher) => {
            const classes = Array.isArray(teacher.assignedClasses) ? teacher.assignedClasses : [];
            const subjects = Array.isArray(teacher.assignedSubjects) ? teacher.assignedSubjects : [];
            const totalStudents = classes.reduce((sum, klass) => {
                return sum + (countMap.get(String(klass?._id ?? '')) ?? Number(klass?.studentCount ?? 0));
            }, 0);
            const score = (classes.length * 12) + (subjects.length * 8) + Math.min(totalStudents, 80);
            const rating = Math.min(5, 4.2 + Math.min(score, 80) / 100);
            return {
                _id: String(teacher._id),
                name: teacher.name || `${teacher.firstName ?? ''} ${teacher.lastName ?? ''}`.trim() || 'Teacher',
                profileImage: teacher.profileImage ?? '',
                branchName: teacher.branchId?.name ?? teacher.branchId?.city ?? '',
                subjectNames: subjects.map((subject) => subject?.title).filter(Boolean),
                classNames: classes.map((klass) => klass?.className ?? klass?.name).filter(Boolean),
                totalClasses: classes.length,
                totalSubjects: subjects.length,
                totalStudents,
                rating: Number(rating.toFixed(1)),
                score
            };
        })
            .sort((left, right) => right.score - left.score || right.rating - left.rating)
            .slice(0, limit);
        res.json((0, response_1.createResponse)(ranked));
    }
    catch (error) {
        next(error);
    }
});
router.use(auth_1.authenticate);
function buildTeacherPayload(body, isCreate = false) {
    let firstName = body.firstName;
    let lastName = body.lastName;
    if (body.name && !firstName && !lastName) {
        const nameParts = String(body.name).trim().split(/\s+/);
        firstName = nameParts[0] || '';
        lastName = nameParts.slice(1).join(' ') || '';
    }
    const teacherData = {
        ...body,
        firstName,
        lastName,
        name: body.name || `${firstName ?? ''} ${lastName ?? ''}`.trim(),
        role: 'teacher'
    };
    if (body.salaryValue !== undefined && body.salaryValue !== null && body.salaryValue !== '') {
        if ((body.salaryType ?? teacherData.salaryType) === 'fixed') {
            teacherData.fixedSalary = Number(body.salaryValue);
            teacherData.percentageRate = 0;
        }
        else if ((body.salaryType ?? teacherData.salaryType) === 'percentage') {
            teacherData.percentageRate = Number(body.salaryValue);
            teacherData.fixedSalary = 0;
        }
        delete teacherData.salaryValue;
    }
    if (!teacherData.password) {
        delete teacherData.password;
    }
    if (!isCreate && !teacherData.name && (firstName || lastName)) {
        teacherData.name = `${firstName ?? ''} ${lastName ?? ''}`.trim();
    }
    return teacherData;
}
function serializeTeacher(teacher) {
    const assignedSubjects = Array.isArray(teacher?.assignedSubjects) ? teacher.assignedSubjects : [];
    const assignedClasses = Array.isArray(teacher?.assignedClasses) ? teacher.assignedClasses : [];
    const branchRef = teacher?.branchId;
    return {
        ...teacher,
        branchId: branchRef?._id ?? branchRef ?? null,
        branchName: branchRef?.name ?? branchRef?.code ?? '',
        assignedSubjects: assignedSubjects.map((subject) => subject?._id ?? subject).filter(Boolean),
        assignedSubjectNames: assignedSubjects.map((subject) => subject?.title ?? subject).filter(Boolean).join(', '),
        assignedClasses: assignedClasses.map((klass) => klass?._id ?? klass).filter(Boolean),
        assignedClassNames: assignedClasses.map((klass) => klass?.className ?? klass?.name ?? klass).filter(Boolean).join(', '),
        displaySubject: assignedSubjects.length ? (assignedSubjects[0]?.title ?? assignedSubjects[0]) : '',
        phone: teacher?.phone ?? teacher?.whatsapp ?? '',
        salaryValue: teacher?.salaryType === 'percentage'
            ? Number(teacher?.percentageRate ?? teacher?.customPercentage ?? 0)
            : Number(teacher?.fixedSalary ?? 0)
    };
}
function sanitizeTeacherForRole(teacher, role) {
    const allowedFinanceRoles = new Set(['super_admin', 'admin', 'owner', 'branch_manager']);
    if (allowedFinanceRoles.has(String(role ?? '')))
        return teacher;
    const { salaryType, salaryValue, fixedSalary, percentageRate, customPercentage, ...safeTeacher } = teacher ?? {};
    return safeTeacher;
}
async function syncTeacherProfile(teacher, payload) {
    await Teacher_1.TeacherProfile.findOneAndUpdate({ userId: teacher._id }, {
        userId: teacher._id,
        branchId: teacher.branchId ?? payload.branchId ?? null,
        teacherCode: teacher.teacherId,
        gender: teacher.gender ?? payload.gender ?? 'other',
        salaryType: teacher.salaryType,
        fixedSalary: teacher.fixedSalary,
        percentageRate: teacher.percentageRate,
        assignedSubjectIds: teacher.assignedSubjects ?? [],
        assignedClassIds: teacher.assignedClasses ?? [],
        active: teacher.active !== false
    }, { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true });
}
// Get teachers with optional class/subject filtering.
router.get('/', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'parent', 'owner']), (0, validate_1.validate)(teacherQuerySchema), async (req, res) => {
    try {
        const filter = { role: 'teacher', ...(0, recordVisibility_1.listRecordFilter)(req.user) };
        const classId = req.query.classId ? String(req.query.classId) : '';
        const subjectId = req.query.subjectId ? String(req.query.subjectId) : '';
        if (classId || subjectId) {
            const [klass, subject] = await Promise.all([
                classId ? Class_1.ClassModel.findOne({ _id: classId, isDeleted: false }).select('assignedTeachers').lean() : null,
                subjectId ? Subject_1.Subject.findOne({ _id: subjectId, isDeleted: false }).select('teacher classId classIds').lean() : null
            ]);
            const teacherIds = new Set();
            const relationFilters = [];
            if (classId) {
                relationFilters.push({ assignedClasses: classId });
                (klass?.assignedTeachers ?? []).forEach((id) => teacherIds.add(String(id?._id ?? id)));
            }
            if (subjectId) {
                relationFilters.push({ assignedSubjects: subjectId });
                if (subject?.teacher)
                    teacherIds.add(String(subject.teacher));
            }
            if (classId && !subjectId) {
                const classSubjects = await Subject_1.Subject.find({
                    isDeleted: false,
                    activeStatus: true,
                    $or: [{ classId }, { classIds: classId }]
                }).select('teacher').lean();
                classSubjects.forEach((item) => {
                    if (item.teacher)
                        teacherIds.add(String(item.teacher));
                });
            }
            if (teacherIds.size) {
                relationFilters.push({ _id: { $in: Array.from(teacherIds) } });
            }
            if (classId && subjectId) {
                const subjectClassIds = [
                    subject?.classId ? String(subject.classId) : '',
                    ...(Array.isArray(subject?.classIds) ? subject.classIds.map((id) => String(id)) : [])
                ].filter(Boolean);
                const subjectBelongsToClass = !subject || subjectClassIds.includes(classId);
                filter.$and = subjectBelongsToClass
                    ? relationFilters
                    : [{ _id: { $in: [] } }];
            }
            else {
                filter.$or = relationFilters.length ? relationFilters : [{ _id: { $in: [] } }];
            }
        }
        if (['admin', 'branch_manager'].includes(req.user?.canonicalRole ?? '') && req.user?.branchId) {
            filter.branchId = req.user.branchId;
        }
        if (req.user?.canonicalRole === 'teacher') {
            filter._id = req.user.userId;
        }
        if (req.user?.canonicalRole === 'student') {
            const currentUser = await User_1.User.findById(req.user.userId).select('assignedTeacherId').lean();
            filter._id = currentUser?.assignedTeacherId ?? { $in: [] };
        }
        if (req.user?.canonicalRole === 'parent' || req.user?.role === 'family_student') {
            const currentUser = await User_1.User.findById(req.user.userId).select('familyId parentProfileId').lean();
            const familyStudents = await Student_1.Student.find({
                isDeleted: false,
                ...(currentUser?.familyId ? { familyId: currentUser.familyId } : {}),
                ...(!currentUser?.familyId && currentUser?.parentProfileId ? { parentProfileId: currentUser.parentProfileId } : {})
            }).select('teacherId').lean();
            filter._id = { $in: familyStudents.map((student) => student.teacherId).filter(Boolean) };
        }
        const teachers = await User_1.User.find(filter)
            .populate('assignedSubjects', 'title')
            .populate('assignedClasses', 'className name')
            .populate('branchId', 'name code city')
            .lean();
        const role = req.user?.canonicalRole ?? req.user?.role;
        res.json((0, response_1.createResponse)(teachers.map((teacher) => sanitizeTeacherForRole(serializeTeacher(teacher), role))));
    }
    catch (error) {
        console.error('Get teachers error:', error);
        res.status(500).json((0, response_1.createResponse)(null, 'Failed to fetch teachers'));
    }
});
// Create teacher - admin only
router.post('/', rateLimiter_1.teacherCreateLimiter, rbac_1.requireAdmin, (0, validate_1.validate)(createTeacherSchema), async (req, res) => {
    try {
        const existingEmail = await User_1.User.findOne({ email: req.body.email.toLowerCase(), isDeleted: false }).lean();
        if (existingEmail) {
            return res.status(409).json((0, response_1.createError)('Email already exists'));
        }
        const teacherData = buildTeacherPayload(req.body, true);
        const teacher = await userService.createUser(teacherData);
        await syncTeacherProfile(teacher, teacherData);
        const savedTeacher = await User_1.User.findById(teacher._id)
            .populate('assignedSubjects', 'title')
            .populate('assignedClasses', 'className name')
            .populate('branchId', 'name code city')
            .lean();
        res.status(201).json((0, response_1.createResponse)(serializeTeacher(savedTeacher), 'Teacher created successfully'));
    }
    catch (error) {
        console.error('Teacher creation error:', error);
        if (error instanceof mongoose_1.default.Error.ValidationError) {
            return res.status(400).json((0, response_1.createError)(error.message));
        }
        if (typeof error?.message === 'string') {
            if (/duplicate key/i.test(error.message) || /already exists/i.test(error.message)) {
                return res.status(409).json((0, response_1.createError)('Teacher already exists'));
            }
            return res.status(400).json((0, response_1.createError)(error.message));
        }
        res.status(500).json((0, response_1.createError)('Failed to create teacher'));
    }
});
// Get teacher by ID
router.get('/:id', rbac_1.requireAdmin, (0, validate_1.validate)(idParamsSchema), async (req, res) => {
    try {
        const teacher = await User_1.User.findOne({ _id: req.params.id, role: 'teacher', isDeleted: false })
            .populate('assignedSubjects', 'title')
            .populate('assignedClasses', 'className name')
            .populate('branchId', 'name code city')
            .lean();
        if (!teacher) {
            return res.status(404).json((0, response_1.createResponse)(null, 'Teacher not found'));
        }
        res.json((0, response_1.createResponse)(serializeTeacher(teacher)));
    }
    catch (error) {
        res.status(500).json((0, response_1.createResponse)(null, 'Failed to fetch teacher'));
    }
});
// Update teacher
router.put('/:id', rbac_1.requireAdmin, (0, validate_1.validate)(updateTeacherSchema), async (req, res) => {
    try {
        const existingTeacher = await User_1.User.findOne({ _id: req.params.id, role: 'teacher', isDeleted: false }).lean();
        if (!existingTeacher) {
            return res.status(404).json((0, response_1.createError)('Teacher not found'));
        }
        if (req.body.email) {
            const duplicateEmail = await User_1.User.findOne({
                email: req.body.email.toLowerCase(),
                _id: { $ne: req.params.id },
                isDeleted: false
            }).lean();
            if (duplicateEmail) {
                return res.status(409).json((0, response_1.createError)('Email already exists'));
            }
        }
        const teacherPayload = buildTeacherPayload(req.body);
        const teacher = await userService.updateUser(req.params.id, teacherPayload);
        await syncTeacherProfile(teacher, teacherPayload);
        const savedTeacher = await User_1.User.findById(req.params.id)
            .populate('assignedSubjects', 'title')
            .populate('assignedClasses', 'className name')
            .populate('branchId', 'name code city')
            .lean();
        res.json((0, response_1.createResponse)(serializeTeacher(savedTeacher), 'Teacher updated successfully'));
    }
    catch (error) {
        if (error instanceof mongoose_1.default.Error.ValidationError) {
            return res.status(400).json((0, response_1.createError)(error.message));
        }
        res.status(400).json((0, response_1.createError)(String(error?.message || 'Failed to update teacher')));
    }
});
// Delete teacher
router.delete('/:id', rbac_1.requireAdmin, (0, validate_1.validate)(idParamsSchema), async (req, res) => {
    try {
        const deletedAt = new Date();
        const teacher = await User_1.User.findOneAndUpdate({ _id: req.params.id, role: 'teacher', isDeleted: false }, {
            $set: {
                isDeleted: true,
                deletedAt,
                deletedBy: req.user?.userId ?? null,
                active: false,
                status: 'inactive'
            }
        }, { new: true }).lean();
        if (!teacher)
            return res.status(404).json((0, response_1.createError)('Teacher not found'));
        await Teacher_1.TeacherProfile.findOneAndUpdate({ userId: req.params.id }, {
            $set: {
                isDeleted: true,
                deletedAt,
                deletedBy: req.user?.userId ?? null,
                active: false
            }
        });
        res.json((0, response_1.createResponse)({}, 'Teacher deleted successfully'));
    }
    catch (error) {
        res.status(500).json((0, response_1.createError)('Failed to delete teacher'));
    }
});
exports.teacherRouter = router;
