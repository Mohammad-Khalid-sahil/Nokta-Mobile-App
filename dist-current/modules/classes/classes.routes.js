"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.classRouter = void 0;
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const joi_1 = __importDefault(require("joi"));
const Class_1 = require("../../models/Class");
const Student_1 = require("../../models/Student");
const User_1 = require("../../models/User");
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const pagination_1 = require("../../validators/pagination");
const recordVisibility_1 = require("../../utils/recordVisibility");
const classService_1 = require("../../services/classService");
const classSchedule_1 = require("../../utils/classSchedule");
const publicCatalogService_1 = require("../../services/publicCatalogService");
const router = (0, express_1.Router)();
const classService = new classService_1.ClassService();
const classBodySchema = joi_1.default.object({
    branchId: joi_1.default.string().hex().length(24).allow('', null).optional(),
    title: joi_1.default.string().trim().allow('', null).optional(),
    description: joi_1.default.string().trim().allow('', null).optional(),
    subjectId: joi_1.default.string().hex().length(24).allow('', null).optional(),
    teacherId: joi_1.default.string().hex().length(24).allow('', null).optional(),
    className: joi_1.default.string().trim().required(),
    classCode: joi_1.default.string().trim().optional(),
    genderRestriction: joi_1.default.string().valid('male', 'female', 'coed').optional(),
    feeAmount: joi_1.default.number().min(0).default(0),
    subjects: joi_1.default.array().items(joi_1.default.string().trim().required()).min(1).required(),
    assignedTeachers: joi_1.default.array().items(joi_1.default.string().hex().length(24)).optional(),
    room: joi_1.default.string().trim().allow('', null).optional(),
    capacity: joi_1.default.number().min(10).max(120).default(30),
    startDate: joi_1.default.date().iso().allow(null).optional(),
    endDate: joi_1.default.date().iso().allow(null).optional(),
    weeklySchedule: joi_1.default.array().items(joi_1.default.object({
        dayOfWeek: joi_1.default.number().integer().min(0).max(6).required(),
        startTime: joi_1.default.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
        endTime: joi_1.default.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
        durationMinutes: joi_1.default.number().integer().min(1).optional(),
        attendanceOpensBeforeMinutes: joi_1.default.number().integer().min(0).default(0),
        attendanceClosesAfterMinutes: joi_1.default.number().integer().min(0).default(0)
    })).optional(),
    examSchedule: joi_1.default.array().items(joi_1.default.date().iso()).optional(),
    active: joi_1.default.boolean().optional(),
    category: joi_1.default.string().trim().max(120).allow('', null).optional(),
    department: joi_1.default.string().trim().max(120).allow('', null).optional(),
    level: joi_1.default.string().trim().max(80).allow('', null).optional(),
    language: joi_1.default.string().valid('en', 'fa', 'ps', 'multilingual').optional(),
    currency: joi_1.default.string().trim().max(8).optional(),
    imageUrl: joi_1.default.string().trim().max(500).allow('', null).optional(),
    thumbnailUrl: joi_1.default.string().trim().max(500).allow('', null).optional(),
    galleryImages: joi_1.default.array().items(joi_1.default.string().trim().max(500)).optional(),
    totalDurationWeeks: joi_1.default.number().min(0).optional(),
    registrationOpen: joi_1.default.boolean().optional(),
    featured: joi_1.default.boolean().optional()
});
const createSchema = joi_1.default.object({
    body: classBodySchema
});
const updateSchema = joi_1.default.object({
    params: joi_1.default.object({
        id: joi_1.default.string().hex().length(24).required()
    }),
    body: joi_1.default.object({
        branchId: joi_1.default.string().hex().length(24).allow('', null).optional(),
        title: joi_1.default.string().trim().allow('', null).optional(),
        description: joi_1.default.string().trim().allow('', null).optional(),
        subjectId: joi_1.default.string().hex().length(24).allow('', null).optional(),
        teacherId: joi_1.default.string().hex().length(24).allow('', null).optional(),
        className: joi_1.default.string().trim().optional(),
        classCode: joi_1.default.string().trim().optional(),
        genderRestriction: joi_1.default.string().valid('male', 'female', 'coed').optional(),
        feeAmount: joi_1.default.number().min(0).optional(),
        subjects: joi_1.default.array().items(joi_1.default.string().trim().required()).min(1).optional(),
        assignedTeachers: joi_1.default.array().items(joi_1.default.string().hex().length(24)).optional(),
        room: joi_1.default.string().trim().allow('', null).optional(),
        capacity: joi_1.default.number().min(10).max(120).optional(),
        startDate: joi_1.default.date().iso().allow(null).optional(),
        endDate: joi_1.default.date().iso().allow(null).optional(),
        weeklySchedule: joi_1.default.array().items(joi_1.default.object({
            dayOfWeek: joi_1.default.number().integer().min(0).max(6).required(),
            startTime: joi_1.default.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
            endTime: joi_1.default.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
            durationMinutes: joi_1.default.number().integer().min(1).optional(),
            attendanceOpensBeforeMinutes: joi_1.default.number().integer().min(0).default(0),
            attendanceClosesAfterMinutes: joi_1.default.number().integer().min(0).default(0)
        })).optional(),
        examSchedule: joi_1.default.array().items(joi_1.default.date().iso()).optional(),
        active: joi_1.default.boolean().optional(),
        imageUrl: joi_1.default.string().trim().max(500).allow('', null).optional(),
        thumbnailUrl: joi_1.default.string().trim().max(500).allow('', null).optional(),
        galleryImages: joi_1.default.array().items(joi_1.default.string().trim().max(500)).optional()
    }).min(1)
});
const idParamsSchema = joi_1.default.object({
    params: joi_1.default.object({
        id: joi_1.default.string().hex().length(24).required()
    })
});
router.get('/public/home', async (req, res, next) => {
    try {
        const items = await (0, publicCatalogService_1.listPublicClasses)({ ...req.query, homeOnly: true });
        res.json((0, response_1.createResponse)(items));
    }
    catch (error) {
        next(error);
    }
});
router.get('/public', async (req, res, next) => {
    try {
        const items = await (0, publicCatalogService_1.listPublicClasses)(req.query);
        res.json((0, response_1.createResponse)(items));
    }
    catch (error) {
        next(error);
    }
});
router.get('/public/:id', async (req, res, next) => {
    try {
        const item = await (0, publicCatalogService_1.getPublicClassById)(req.params.id, String(req.query.lang || 'en'));
        if (!item)
            return res.status(404).json((0, response_1.createError)('Class not found'));
        res.json((0, response_1.createResponse)(item));
    }
    catch (error) {
        next(error);
    }
});
router.use(auth_1.authenticate);
function serializeClass(klass, studentCountMap = new Map()) {
    const assignedTeachers = Array.isArray(klass?.assignedTeachers) ? klass.assignedTeachers : [];
    const assignedSubjects = Array.isArray(klass?.assignedSubjects) ? klass.assignedSubjects : [];
    return {
        ...klass,
        title: klass?.title ?? klass?.className ?? klass?.name ?? '',
        name: klass?.className ?? klass?.name ?? '',
        subjectId: klass?.subjectId?._id ?? klass?.subjectId ?? assignedSubjects[0]?._id ?? assignedSubjects[0] ?? null,
        teacherId: klass?.teacherId?._id ?? klass?.teacherId ?? assignedTeachers[0]?._id ?? assignedTeachers[0] ?? null,
        subjectName: klass?.subjectId?.title ?? assignedSubjects[0]?.title ?? '',
        teacherName: klass?.teacherId?.name ?? assignedTeachers[0]?.name ?? '',
        assignedTeachers: assignedTeachers.map((teacher) => teacher?._id ?? teacher).filter(Boolean),
        assignedTeacherNames: assignedTeachers.map((teacher) => teacher?.name ?? teacher).filter(Boolean),
        assignedTeacherCount: assignedTeachers.length,
        assignedSubjects: assignedSubjects.map((subject) => subject?._id ?? subject).filter(Boolean),
        subjects: assignedSubjects.map((subject) => subject?.title ?? subject).filter(Boolean),
        assignedSubjectCount: assignedSubjects.length,
        studentCount: studentCountMap.get(String(klass?._id ?? '')) ?? Number(klass?.studentCount ?? 0),
        feeAmount: Number(klass?.feeAmount ?? 0)
    };
}
function formatJalali(value) {
    if (!value)
        return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime()))
        return '';
    return new Intl.DateTimeFormat('fa-AF-u-ca-persian', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
    }).format(date);
}
function formatWindow(window) {
    if (!window)
        return null;
    return {
        ...window,
        opensAt: window.opensAt.toISOString(),
        startsAt: window.startsAt.toISOString(),
        endsAt: window.endsAt.toISOString(),
        closesAt: window.closesAt.toISOString(),
        jalaliDate: formatJalali(window.startsAt)
    };
}
function serializeScheduleStatus(klass, now = new Date()) {
    const schedules = Array.isArray(klass?.weeklySchedule) ? klass.weeklySchedule : [];
    const currentWindow = (0, classSchedule_1.findCurrentAttendanceWindow)(schedules, now);
    const openWindow = (0, classSchedule_1.findOpenAttendanceWindow)(schedules, now);
    const nextWindow = (0, classSchedule_1.getNextScheduleWindow)(schedules, now);
    return {
        attendanceStatus: openWindow ? 'active' : currentWindow?.status ?? 'closed',
        currentSessionStatus: formatWindow(openWindow ?? currentWindow),
        nextSession: formatWindow(nextWindow)
    };
}
function buildClassScope(req) {
    const filter = { isDeleted: false, active: true };
    if (req.user?.canonicalRole === 'teacher') {
        filter.assignedTeachers = req.user.userId;
    }
    if (['admin', 'branch_manager'].includes(req.user?.canonicalRole ?? '') && req.user?.branchId) {
        filter.branchId = req.user.branchId;
    }
    return filter;
}
router.post('/', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager']), (0, validate_1.validate)(createSchema), async (req, res, next) => {
    try {
        const klass = await classService.createClass(req.body, req.user?.userId ?? '');
        const savedClass = await Class_1.ClassModel.findById(klass._id)
            .populate('assignedTeachers', 'name email')
            .populate('assignedSubjects', 'title code')
            .lean();
        res.status(201).json((0, response_1.createResponse)(serializeClass(savedClass), 'Class created successfully'));
    }
    catch (error) {
        if (error instanceof mongoose_1.default.Error.ValidationError) {
            return res.status(400).json((0, response_1.createError)(error.message));
        }
        const message = String(error?.message || 'Unable to create class');
        if (/already exists/i.test(message)) {
            return res.status(400).json((0, response_1.createError)(message));
        }
        next(error);
    }
});
router.get('/', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']), (0, validate_1.validate)(pagination_1.paginationSchema), async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        const search = String(req.query.search || '').trim();
        const filter = { ...(0, recordVisibility_1.listRecordFilter)(req.user) };
        if (search)
            filter.className = { $regex: search, $options: 'i' };
        if (req.user?.canonicalRole === 'teacher') {
            filter.assignedTeachers = req.user.userId;
        }
        if (req.user?.canonicalRole === 'student') {
            const currentUser = await User_1.User.findById(req.user.userId).select('studentId classId').lean();
            const studentRecord = currentUser?.studentId
                ? await Student_1.Student.findOne({ studentId: currentUser.studentId, isDeleted: false }).select('classId').lean()
                : null;
            filter._id = studentRecord?.classId ?? currentUser?.classId ?? { $in: [] };
        }
        if (req.user?.canonicalRole === 'parent' || req.user?.role === 'family_student') {
            const currentUser = await User_1.User.findById(req.user.userId).select('familyId parentProfileId').lean();
            if (!currentUser?.familyId && !currentUser?.parentProfileId) {
                filter._id = { $in: [] };
            }
            else {
                const familyFilter = { isDeleted: false };
                if (currentUser?.familyId)
                    familyFilter.familyId = currentUser.familyId;
                if (currentUser?.parentProfileId)
                    familyFilter.parentProfileId = currentUser.parentProfileId;
                const linkedStudents = await Student_1.Student.find(familyFilter).select('classId').lean();
                const classIds = linkedStudents.map((student) => student.classId).filter(Boolean);
                filter._id = classIds.length ? { $in: classIds } : { $in: [] };
            }
        }
        const [classes, total] = await Promise.all([
            Class_1.ClassModel.find(filter)
                .populate('assignedTeachers', 'name email')
                .populate('assignedSubjects', 'title code')
                .populate('teacherId', 'name email')
                .populate('subjectId', 'title code')
                .lean()
                .skip((page - 1) * limit)
                .limit(limit),
            Class_1.ClassModel.countDocuments(filter)
        ]);
        const classIds = classes.map((klass) => klass._id).filter(Boolean);
        const studentCounts = await Student_1.Student.aggregate([
            { $match: { classId: { $in: classIds }, isDeleted: false } },
            { $group: { _id: '$classId', count: { $sum: 1 } } }
        ]);
        const studentCountMap = new Map(studentCounts.map((item) => [String(item._id), Number(item.count)]));
        res.json((0, response_1.createResponse)(classes.map((klass) => serializeClass(klass, studentCountMap)), '', { page, limit, total }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/active-now', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']), async (req, res, next) => {
    try {
        const now = new Date();
        const classes = await Class_1.ClassModel.find({
            ...buildClassScope(req),
            'weeklySchedule.dayOfWeek': now.getDay()
        })
            .populate('assignedTeachers', 'name email')
            .populate('assignedSubjects', 'title code')
            .populate('teacherId', 'name email')
            .populate('subjectId', 'title code')
            .lean();
        const activeClasses = classes
            .map((klass) => ({ klass, window: (0, classSchedule_1.findOpenAttendanceWindow)(klass.weeklySchedule ?? [], now) }))
            .filter((item) => item.window)
            .map((item) => ({
            ...serializeClass(item.klass),
            ...serializeScheduleStatus(item.klass, now)
        }));
        res.json((0, response_1.createResponse)(activeClasses));
    }
    catch (error) {
        next(error);
    }
});
router.get('/upcoming', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']), async (req, res, next) => {
    try {
        const now = new Date();
        const limit = Math.min(Number(req.query.limit ?? 10), 50);
        const classes = await Class_1.ClassModel.find({
            ...buildClassScope(req),
            weeklySchedule: { $exists: true, $ne: [] }
        })
            .populate('assignedTeachers', 'name email')
            .populate('assignedSubjects', 'title code')
            .populate('teacherId', 'name email')
            .populate('subjectId', 'title code')
            .lean();
        const upcoming = classes
            .map((klass) => ({ klass, nextWindow: (0, classSchedule_1.getNextScheduleWindow)(klass.weeklySchedule ?? [], now) }))
            .filter((item) => item.nextWindow && item.nextWindow.status !== 'closed')
            .sort((left, right) => (left.nextWindow?.opensAt.getTime() ?? 0) - (right.nextWindow?.opensAt.getTime() ?? 0))
            .slice(0, limit)
            .map((item) => ({
            ...serializeClass(item.klass),
            ...serializeScheduleStatus(item.klass, now)
        }));
        res.json((0, response_1.createResponse)(upcoming));
    }
    catch (error) {
        next(error);
    }
});
router.get('/:id/details', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']), (0, validate_1.validate)(idParamsSchema), async (req, res, next) => {
    try {
        const klass = (await Class_1.ClassModel.findOne({ _id: req.params.id, isDeleted: false })
            .populate('assignedTeachers', 'name email')
            .populate('assignedSubjects', 'title code')
            .populate('teacherId', 'name email')
            .populate('subjectId', 'title code')
            .lean());
        if (!klass)
            return res.status(404).json((0, response_1.createError)('Class not found'));
        if (req.user?.canonicalRole === 'teacher') {
            const teacherIds = Array.isArray(klass.assignedTeachers) ? klass.assignedTeachers.map((item) => item._id?.toString?.() ?? String(item)) : [];
            if (!teacherIds.includes(req.user.userId))
                return res.status(403).json((0, response_1.createError)('Access denied'));
        }
        if (req.user?.canonicalRole === 'student') {
            const currentUser = await User_1.User.findById(req.user.userId).select('classId').lean();
            if (String(currentUser?.classId ?? '') !== String(klass._id))
                return res.status(403).json((0, response_1.createError)('Access denied'));
        }
        if (req.user?.canonicalRole === 'parent' || req.user?.role === 'family_student') {
            const currentUser = await User_1.User.findById(req.user.userId).lean();
            const children = currentUser?.familyId
                ? await User_1.User.find({ role: 'student', familyId: currentUser.familyId, isDeleted: false }).select('classId').lean()
                : [];
            const classIds = children.map((child) => child.classId?.toString?.()).filter(Boolean);
            if (!classIds.includes(String(klass._id)))
                return res.status(403).json((0, response_1.createError)('Access denied'));
        }
        const studentCount = await Student_1.Student.countDocuments({ classId: klass._id, isDeleted: false });
        const now = new Date();
        const schedule = (klass.weeklySchedule ?? []).map((item) => {
            const nextDate = new Date(now);
            const dayDistance = (Number(item.dayOfWeek) - now.getDay() + 7) % 7;
            nextDate.setDate(now.getDate() + dayDistance);
            const window = (0, classSchedule_1.getScheduleWindowForDate)(item, nextDate);
            return {
                ...item,
                opensAt: window.opensAt.toISOString(),
                closesAt: window.closesAt.toISOString(),
                jalaliDate: formatJalali(window.startsAt)
            };
        });
        res.json((0, response_1.createResponse)({
            ...serializeClass(klass, new Map([[String(klass._id), studentCount]])),
            schedule,
            enrolledStudentsCount: studentCount,
            startDateJalali: formatJalali(klass.startDate),
            endDateJalali: formatJalali(klass.endDate),
            ...serializeScheduleStatus(klass, now)
        }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/:id', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']), (0, validate_1.validate)(idParamsSchema), async (req, res, next) => {
    try {
        const klass = (await Class_1.ClassModel.findOne({ _id: req.params.id, isDeleted: false })
            .populate('assignedTeachers', 'name email')
            .populate('assignedSubjects', 'title code')
            .populate('teacherId', 'name email')
            .populate('subjectId', 'title code')
            .lean());
        if (!klass)
            return res.status(404).json((0, response_1.createError)('Class not found'));
        if (req.user?.canonicalRole === 'teacher') {
            const teacherIds = Array.isArray(klass.assignedTeachers) ? klass.assignedTeachers.map((item) => item._id?.toString?.() ?? String(item)) : [];
            if (!teacherIds.includes(req.user.userId)) {
                return res.status(403).json((0, response_1.createError)('Access denied'));
            }
        }
        if (req.user?.canonicalRole === 'student') {
            const currentUser = await User_1.User.findById(req.user.userId).select('classId').lean();
            if (!currentUser?.classId?.toString?.() || String(klass._id) !== String(currentUser.classId)) {
                return res.status(403).json((0, response_1.createError)('Access denied'));
            }
        }
        if (req.user?.canonicalRole === 'parent' || req.user?.role === 'family_student') {
            const currentUser = await User_1.User.findById(req.user.userId).lean();
            const children = currentUser?.familyId
                ? await User_1.User.find({ role: 'student', familyId: currentUser.familyId, isDeleted: false }).select('classId').lean()
                : [];
            const classIds = children.map((child) => child.classId?.toString?.()).filter(Boolean);
            if (!classIds.includes(String(klass._id))) {
                return res.status(403).json((0, response_1.createError)('Access denied'));
            }
        }
        const studentCount = await Student_1.Student.countDocuments({ classId: klass._id, isDeleted: false });
        res.json((0, response_1.createResponse)(serializeClass(klass, new Map([[String(klass._id), studentCount]]))));
    }
    catch (error) {
        next(error);
    }
});
const updateClassHandler = async (req, res, next) => {
    try {
        const klass = await classService.updateClass(req.params.id, req.body, req.user?.userId ?? '');
        const savedClass = await Class_1.ClassModel.findById(klass._id)
            .populate('assignedTeachers', 'name email')
            .populate('assignedSubjects', 'title code')
            .lean();
        const studentCount = await Student_1.Student.countDocuments({ classId: klass._id, isDeleted: false });
        res.json((0, response_1.createResponse)(serializeClass(savedClass, new Map([[String(klass._id), studentCount]])), 'Class updated successfully'));
    }
    catch (error) {
        if (error instanceof mongoose_1.default.Error.ValidationError) {
            return res.status(400).json((0, response_1.createError)(error.message));
        }
        const message = String(error?.message || 'Unable to update class');
        if (/not found/i.test(message)) {
            return res.status(404).json((0, response_1.createError)(message));
        }
        if (/already exists/i.test(message) || /at least one subject/i.test(message) || /invalid/i.test(message)) {
            return res.status(400).json((0, response_1.createError)(message));
        }
        next(error);
    }
};
router.put('/:id', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager']), (0, validate_1.validate)(updateSchema), updateClassHandler);
router.patch('/:id', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager']), (0, validate_1.validate)(updateSchema), updateClassHandler);
router.delete('/:id', (0, auth_1.authorize)(['super_admin', 'admin']), (0, validate_1.validate)(idParamsSchema), async (req, res, next) => {
    try {
        await classService.deleteClass(req.params.id, req.user?.userId ?? '');
        res.json((0, response_1.createResponse)({}, 'Class deleted successfully'));
    }
    catch (error) {
        const message = String(error?.message || 'Unable to delete class');
        if (/not found/i.test(message)) {
            return res.status(404).json((0, response_1.createError)(message));
        }
        if (/active students/i.test(message)) {
            return res.status(400).json((0, response_1.createError)(message));
        }
        next(error);
    }
});
exports.classRouter = router;
