"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.timetableRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const Timetable_1 = require("../../models/Timetable");
const AuditLog_1 = require("../../models/AuditLog");
const Class_1 = require("../../models/Class");
const Subject_1 = require("../../models/Subject");
const User_1 = require("../../models/User");
const Student_1 = require("../../models/Student");
const Branch_1 = require("../../models/Branch");
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const timetableValidationService_1 = require("../../services/timetableValidationService");
const router = (0, express_1.Router)();
const timetableValidation = new timetableValidationService_1.TimetableValidationService();
const viewTimetable = (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']);
const manageTimetable = (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager']);
const dayValues = [0, 1, 2, 3, 4, 5, 6];
const dayNameMap = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6
};
const daySchema = joi_1.default.alternatives().try(joi_1.default.number().integer().valid(...dayValues), joi_1.default.string().valid(...Object.keys(dayNameMap)));
const payloadSchema = {
    classId: joi_1.default.string().hex().length(24).required(),
    subjectId: joi_1.default.string().hex().length(24).required(),
    teacherId: joi_1.default.string().hex().length(24).required(),
    dayOfWeek: daySchema.required(),
    startTime: joi_1.default.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
    endTime: joi_1.default.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
    room: joi_1.default.string().trim().allow('', null).optional(),
    academicYear: joi_1.default.string().trim().allow('', null).optional(),
    semester: joi_1.default.string().trim().allow('', null).optional(),
    deliveryMode: joi_1.default.string().valid('in_person', 'online', 'hybrid').optional(),
    onlineLink: joi_1.default.string().trim().allow('', null).optional(),
    notes: joi_1.default.string().trim().allow('', null).optional(),
    isActive: joi_1.default.boolean().optional(),
    active: joi_1.default.boolean().optional(),
    branchId: joi_1.default.string().hex().length(24).allow('', null).optional()
};
const createTimetableSchema = joi_1.default.object({ body: joi_1.default.object(payloadSchema) });
const checkConflictSchema = joi_1.default.object({ body: joi_1.default.object(payloadSchema) });
const generateAutoSchema = joi_1.default.object({
    body: joi_1.default.object({
        classIds: joi_1.default.array().items(joi_1.default.string().hex().length(24)).optional(),
        dayOfWeek: joi_1.default.array().items(daySchema).optional(),
        startTime: joi_1.default.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).default('07:00'),
        endTime: joi_1.default.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).default('19:00'),
        lessonDurationMinutes: joi_1.default.number().integer().min(15).max(240).default(60),
        breakMinutes: joi_1.default.number().integer().min(0).max(120).default(0),
        teacherIds: joi_1.default.array().items(joi_1.default.string().hex().length(24)).optional()
    })
});
const updateTimetableSchema = joi_1.default.object({
    params: joi_1.default.object({ id: joi_1.default.string().hex().length(24).required() }),
    body: joi_1.default.object({
        ...payloadSchema,
        classId: payloadSchema.classId.optional(),
        subjectId: payloadSchema.subjectId.optional(),
        teacherId: payloadSchema.teacherId.optional(),
        dayOfWeek: payloadSchema.dayOfWeek.optional(),
        startTime: payloadSchema.startTime.optional(),
        endTime: payloadSchema.endTime.optional()
    }).min(1)
});
const idParamsSchema = joi_1.default.object({ params: joi_1.default.object({ id: joi_1.default.string().hex().length(24).required() }) });
const timetableQuerySchema = joi_1.default.object({
    query: joi_1.default.object({
        page: joi_1.default.number().integer().min(1).default(1),
        limit: joi_1.default.number().integer().min(1).max(500).default(100),
        search: joi_1.default.string().allow('', null),
        classId: joi_1.default.string().hex().length(24).optional(),
        teacherId: joi_1.default.string().hex().length(24).optional(),
        subjectId: joi_1.default.string().hex().length(24).optional(),
        branchId: joi_1.default.string().hex().length(24).optional(),
        room: joi_1.default.string().trim().allow('', null).optional(),
        dayOfWeek: daySchema.optional(),
        academicYear: joi_1.default.string().trim().allow('', null).optional(),
        semester: joi_1.default.string().trim().allow('', null).optional()
    })
});
const printViewQuerySchema = joi_1.default.object({
    query: joi_1.default.object({
        classId: joi_1.default.string().hex().length(24).optional(),
        branchId: joi_1.default.string().hex().length(24).optional(),
        academicYear: joi_1.default.string().trim().allow('', null).optional(),
        semester: joi_1.default.string().trim().allow('', null).optional()
    })
});
function normalizeNullableId(value) {
    return value === '' || value === undefined ? null : value;
}
function normalizeDay(value) {
    if (typeof value === 'string' && value in dayNameMap)
        return dayNameMap[value];
    return Number(value);
}
function toMinutes(time) {
    const [hours, minutes] = String(time).split(':').map(Number);
    return hours * 60 + minutes;
}
function fromMinutes(value) {
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
function serializeTimetable(item) {
    const classRef = item?.classId;
    const subjectRef = item?.subjectId;
    const teacherRef = item?.teacherId;
    return {
        ...item,
        classId: classRef?._id ?? classRef ?? null,
        subjectId: subjectRef?._id ?? subjectRef ?? null,
        teacherId: teacherRef?._id ?? teacherRef ?? null,
        className: classRef?.className ?? classRef?.name ?? '',
        subjectName: subjectRef?.title ?? '',
        teacherName: teacherRef?.name ?? '',
        isActive: item?.isActive !== false
    };
}
function serializePrintEntry(item) {
    const classRef = item?.classId;
    const subjectRef = item?.subjectId;
    const teacherRef = item?.teacherId;
    return {
        _id: String(item?._id ?? ''),
        dayOfWeek: Number(item?.dayOfWeek ?? 0),
        startTime: item?.startTime ?? '',
        endTime: item?.endTime ?? '',
        room: item?.room ?? '',
        academicYear: item?.academicYear ?? '',
        semester: item?.semester ?? '',
        classId: String(classRef?._id ?? classRef ?? ''),
        className: classRef?.className ?? classRef?.name ?? '',
        classCode: classRef?.classCode ?? '',
        subjectId: String(subjectRef?._id ?? subjectRef ?? ''),
        subjectName: subjectRef?.title ?? subjectRef?.name ?? '',
        subjectCode: subjectRef?.code ?? '',
        teacherId: String(teacherRef?._id ?? teacherRef ?? ''),
        teacherName: teacherRef?.name ?? '',
        teacherPhone: teacherRef?.phone ?? teacherRef?.whatsapp ?? ''
    };
}
function serializeClassInfo(klass) {
    return {
        _id: String(klass?._id ?? ''),
        name: klass?.className ?? klass?.name ?? '',
        code: klass?.classCode ?? klass?.code ?? '',
        level: klass?.level ?? '',
        room: klass?.room ?? '',
        capacity: klass?.capacity ?? null,
        semester: klass?.semester ?? '',
        academicYear: klass?.academicYear ?? '',
        branchId: klass?.branchId ? String(klass.branchId) : null
    };
}
function serializeBranchInfo(branch) {
    return branch ? {
        _id: String(branch?._id ?? ''),
        name: branch?.name ?? '',
        code: branch?.code ?? '',
        city: branch?.city ?? '',
        address: branch?.address ?? '',
        phone: branch?.phone ?? ''
    } : null;
}
function buildPrintSheet(klass, entries, branch) {
    const normalizedEntries = entries.map(serializePrintEntry);
    const timeSlots = Array.from(new Set(normalizedEntries.map((entry) => `${entry.startTime}-${entry.endTime}`)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
    const cells = normalizedEntries.reduce((acc, entry) => {
        const dayKey = String(entry.dayOfWeek);
        const slotKey = `${entry.startTime}-${entry.endTime}`;
        acc[dayKey] = acc[dayKey] ?? {};
        acc[dayKey][slotKey] = [...(acc[dayKey][slotKey] ?? []), entry];
        return acc;
    }, {});
    return {
        classInfo: serializeClassInfo(klass),
        branchInfo: serializeBranchInfo(branch),
        academicYear: normalizedEntries[0]?.academicYear ?? klass?.academicYear ?? '',
        semester: normalizedEntries[0]?.semester ?? klass?.semester ?? '',
        timeSlots,
        days: [6, 0, 1, 2, 3, 4, 5],
        entries: normalizedEntries,
        cells
    };
}
async function auditTimetable(req, action, item, metadata = {}) {
    if (!req.user?.userId || !item?._id)
        return;
    await AuditLog_1.AuditLog.create({
        actor: req.user.userId,
        branchId: item.branchId ?? req.user?.branchId ?? null,
        action,
        target: String(item._id),
        targetType: 'timetable',
        severity: action.endsWith('DELETE') ? 'warning' : 'info',
        metadata
    });
}
function normalizePayload(req, body, existing = {}) {
    const isActive = body.isActive ?? body.active ?? existing.isActive ?? true;
    return {
        ...existing,
        ...body,
        branchId: normalizeNullableId(body.branchId) ?? existing.branchId ?? req.user?.branchId ?? null,
        subjectId: normalizeNullableId(body.subjectId ?? existing.subjectId) ? String(normalizeNullableId(body.subjectId ?? existing.subjectId)) : null,
        classId: body.classId ?? existing.classId,
        teacherId: body.teacherId ?? existing.teacherId,
        dayOfWeek: normalizeDay(body.dayOfWeek ?? existing.dayOfWeek),
        startTime: body.startTime ?? existing.startTime,
        endTime: body.endTime ?? existing.endTime,
        room: body.room ?? existing.room ?? '',
        academicYear: body.academicYear ?? existing.academicYear ?? '',
        semester: body.semester ?? existing.semester ?? '',
        isActive,
        active: isActive
    };
}
async function buildRoleFilter(req) {
    const filter = { isDeleted: { $ne: true } };
    const role = req.user?.canonicalRole ?? req.user?.role;
    if (req.query.classId)
        filter.classId = req.query.classId;
    if (req.query.teacherId)
        filter.teacherId = req.query.teacherId;
    if (req.query.subjectId)
        filter.subjectId = req.query.subjectId;
    if (req.query.branchId)
        filter.branchId = req.query.branchId;
    if (req.query.room)
        filter.room = req.query.room;
    if (req.query.dayOfWeek !== undefined)
        filter.dayOfWeek = normalizeDay(req.query.dayOfWeek);
    if (req.query.academicYear)
        filter.academicYear = req.query.academicYear;
    if (req.query.semester)
        filter.semester = req.query.semester;
    if (['admin', 'branch_manager'].includes(role ?? '') && req.user?.branchId) {
        filter.$or = [
            ...(filter.$or ?? []),
            { branchId: req.user.branchId },
            { branchId: null },
            { branchId: { $exists: false } }
        ];
    }
    if (role === 'teacher') {
        filter.teacherId = req.user.userId;
    }
    if (role === 'student' || role === 'family_student') {
        const currentUser = await User_1.User.findById(req.user.userId).select('studentId classId').lean();
        const linkedStudent = currentUser?.studentId
            ? await Student_1.Student.findOne({ studentId: currentUser.studentId, isDeleted: false }).select('classId').lean()
            : null;
        const scopedClassId = linkedStudent?.classId ?? currentUser?.classId ?? null;
        filter.classId = scopedClassId;
        if (!scopedClassId) {
            filter._id = { $in: [] };
        }
    }
    if (role === 'parent') {
        const currentUser = await User_1.User.findById(req.user.userId).select('familyId parentProfileId').lean();
        const children = await Student_1.Student.find({
            isDeleted: false,
            ...(currentUser?.familyId ? { familyId: currentUser.familyId } : {}),
            ...(!currentUser?.familyId && currentUser?.parentProfileId ? { parentProfileId: currentUser.parentProfileId } : {})
        }).select('classId').lean();
        const classIds = children.map((child) => child.classId).filter(Boolean);
        filter.classId = classIds.length ? { $in: classIds } : { $in: [] };
    }
    return filter;
}
async function findTimetable(filter, page = 1, limit = 100) {
    const [items, total] = await Promise.all([
        Timetable_1.Timetable.find(filter)
            .populate('classId', 'className name classCode')
            .populate('subjectId', 'title code')
            .populate('teacherId', 'name email phone whatsapp')
            .sort({ dayOfWeek: 1, startTime: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        Timetable_1.Timetable.countDocuments(filter)
    ]);
    return { items: items.map(serializeTimetable), total };
}
router.use(auth_1.authenticate);
router.get('/week', viewTimetable, (0, validate_1.validate)(timetableQuerySchema), async (req, res, next) => {
    try {
        const filter = await buildRoleFilter(req);
        const { items, total } = await findTimetable(filter, 1, 500);
        const conflicts = await timetableValidation.findConflicts(filter);
        res.json((0, response_1.createResponse)({ items, conflicts }, '', { page: 1, limit: 500, total }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/conflicts', viewTimetable, (0, validate_1.validate)(timetableQuerySchema), async (req, res, next) => {
    try {
        const filter = await buildRoleFilter(req);
        const conflicts = await timetableValidation.findConflicts(filter);
        res.json((0, response_1.createResponse)(conflicts));
    }
    catch (error) {
        next(error);
    }
});
router.get('/analytics', viewTimetable, (0, validate_1.validate)(timetableQuerySchema), async (req, res, next) => {
    try {
        const filter = await buildRoleFilter(req);
        const entries = await Timetable_1.Timetable.find(filter).lean();
        const teacherLoad = {};
        const roomUtilization = {};
        for (const entry of entries) {
            teacherLoad[String(entry.teacherId)] = (teacherLoad[String(entry.teacherId)] ?? 0) + Number(entry.durationMinutes ?? 0);
            if (entry.room)
                roomUtilization[entry.room] = (roomUtilization[entry.room] ?? 0) + Number(entry.durationMinutes ?? 0);
        }
        res.json((0, response_1.createResponse)({ totalEntries: entries.length, teacherLoad, roomUtilization, conflicts: await timetableValidation.findConflicts(filter) }));
    }
    catch (error) {
        next(error);
    }
});
router.post('/check-conflicts', manageTimetable, (0, validate_1.validate)(checkConflictSchema), async (req, res) => {
    try {
        const payload = normalizePayload(req, req.body);
        const result = await timetableValidation.getTimetableConflicts(payload, { actor: req.user });
        res.json((0, response_1.createResponse)(result, result.hasConflict ? 'Timetable conflicts found' : 'No timetable conflict found'));
    }
    catch (error) {
        res.status(400).json((0, response_1.createError)(error?.message || 'Failed to check timetable conflicts'));
    }
});
router.get('/class/:id', viewTimetable, async (req, res, next) => {
    try {
        const filter = await buildRoleFilter(req);
        filter.classId = req.params.id;
        const { items, total } = await findTimetable(filter, 1, 500);
        res.json((0, response_1.createResponse)(items, '', { page: 1, limit: 500, total }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/teacher/:id', viewTimetable, async (req, res, next) => {
    try {
        const filter = await buildRoleFilter(req);
        filter.teacherId = req.params.id;
        const { items, total } = await findTimetable(filter, 1, 500);
        res.json((0, response_1.createResponse)(items, '', { page: 1, limit: 500, total }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/room/:id', viewTimetable, async (req, res, next) => {
    try {
        const filter = await buildRoleFilter(req);
        filter.room = decodeURIComponent(req.params.id);
        const { items, total } = await findTimetable(filter, 1, 500);
        res.json((0, response_1.createResponse)(items, '', { page: 1, limit: 500, total }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/print-view/all', viewTimetable, (0, validate_1.validate)(printViewQuerySchema), async (req, res, next) => {
    try {
        const filter = await buildRoleFilter(req);
        const role = req.user?.canonicalRole ?? req.user?.role;
        if (!['student', 'family_student', 'parent'].includes(role ?? ''))
            delete filter.classId;
        if (role !== 'teacher')
            delete filter.teacherId;
        if (req.query.subjectId)
            delete filter.subjectId;
        if (req.query.room)
            delete filter.room;
        if (req.query.dayOfWeek !== undefined)
            delete filter.dayOfWeek;
        const entries = await Timetable_1.Timetable.find(filter)
            .populate('classId', 'className name classCode code level room capacity semester academicYear branchId')
            .populate('subjectId', 'title name code')
            .populate('teacherId', 'name phone whatsapp')
            .sort({ classId: 1, dayOfWeek: 1, startTime: 1 })
            .lean();
        const classIds = Array.from(new Set(entries.map((entry) => String(entry.classId?._id ?? entry.classId)).filter(Boolean)));
        const classFilter = { isDeleted: { $ne: true } };
        if (!classIds.length)
            return res.json((0, response_1.createResponse)({ sheets: [] }));
        classFilter._id = { $in: classIds };
        if (role === 'teacher')
            classFilter._id = { $in: classIds };
        if (['student', 'family_student', 'parent'].includes(role ?? '') && filter.classId)
            classFilter._id = filter.classId;
        if (filter.branchId)
            classFilter.branchId = filter.branchId;
        const foundClasses = await Class_1.ClassModel.find(classFilter).select('className name classCode code level room capacity semester academicYear branchId').lean();
        const classMap = new Map(foundClasses.map((klass) => [String(klass._id), klass]));
        entries.forEach((entry) => {
            const classRef = entry.classId;
            const classId = String(classRef?._id ?? classRef ?? '');
            if (classId && classRef?._id && !classMap.has(classId))
                classMap.set(classId, classRef);
        });
        const classes = Array.from(classMap.values());
        const branchIds = Array.from(new Set([
            ...classes.map((klass) => String(klass.branchId ?? '')).filter(Boolean),
            ...entries.map((entry) => String(entry.branchId ?? '')).filter(Boolean)
        ]));
        const branches = branchIds.length ? await Branch_1.Branch.find({ _id: { $in: branchIds } }).lean() : [];
        const branchMap = new Map(branches.map((branch) => [String(branch._id), branch]));
        const entryMap = new Map();
        entries.forEach((entry) => {
            const key = String(entry.classId?._id ?? entry.classId);
            entryMap.set(key, [...(entryMap.get(key) ?? []), entry]);
        });
        const sheets = classes.map((klass) => buildPrintSheet(klass, entryMap.get(String(klass._id)) ?? [], branchMap.get(String(klass.branchId ?? ''))));
        res.json((0, response_1.createResponse)({ sheets }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/print-view', viewTimetable, (0, validate_1.validate)(printViewQuerySchema), async (req, res, next) => {
    try {
        if (!req.query.classId)
            return res.status(400).json((0, response_1.createError)('classId is required for selected class print view.'));
        const filter = await buildRoleFilter(req);
        const scopedClass = filter.classId;
        const requestedClassId = String(req.query.classId);
        if (scopedClass && typeof scopedClass === 'string' && scopedClass !== requestedClassId) {
            return res.status(403).json((0, response_1.createError)('You are not allowed to view this class timetable.'));
        }
        if (scopedClass?.$in && !scopedClass.$in.map(String).includes(requestedClassId)) {
            return res.status(403).json((0, response_1.createError)('You are not allowed to view this class timetable.'));
        }
        filter.classId = req.query.classId;
        const entries = await Timetable_1.Timetable.find(filter)
            .populate('classId', 'className name classCode code level room capacity semester academicYear branchId')
            .populate('subjectId', 'title name code')
            .populate('teacherId', 'name phone whatsapp')
            .sort({ dayOfWeek: 1, startTime: 1 })
            .lean();
        const klass = await Class_1.ClassModel.findOne({ _id: req.query.classId, isDeleted: { $ne: true } })
            .select('className name classCode code level room capacity semester academicYear branchId')
            .lean();
        if (!klass)
            return res.status(404).json((0, response_1.createError)('Class not found'));
        const branch = klass.branchId ? await Branch_1.Branch.findById(klass.branchId).lean() : null;
        res.json((0, response_1.createResponse)(buildPrintSheet(klass, entries, branch)));
    }
    catch (error) {
        next(error);
    }
});
router.get('/', viewTimetable, (0, validate_1.validate)(timetableQuerySchema), async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 100);
        const search = String(req.query.search || '').trim();
        const filter = await buildRoleFilter(req);
        if (search) {
            filter.$or = [
                { room: { $regex: search, $options: 'i' } },
                { notes: { $regex: search, $options: 'i' } },
                { academicYear: { $regex: search, $options: 'i' } },
                { semester: { $regex: search, $options: 'i' } }
            ];
        }
        const { items, total } = await findTimetable(filter, page, limit);
        res.json((0, response_1.createResponse)(items, '', { page, limit, total }));
    }
    catch (error) {
        next(error);
    }
});
router.post('/', manageTimetable, (0, validate_1.validate)(createTimetableSchema), async (req, res) => {
    try {
        const payload = normalizePayload(req, req.body);
        const validation = await timetableValidation.validateTimetableEntry(payload, { actor: req.user });
        const item = await Timetable_1.Timetable.create({ ...payload, durationMinutes: validation.durationMinutes, branchId: validation.branchId });
        await auditTimetable(req, 'TIMETABLE_CREATE', item, { classId: payload.classId, subjectId: payload.subjectId, teacherId: payload.teacherId });
        const saved = await Timetable_1.Timetable.findById(item._id).populate('classId', 'className name classCode').populate('subjectId', 'title code').populate('teacherId', 'name email phone whatsapp').lean();
        res.status(201).json((0, response_1.createResponse)(serializeTimetable(saved), 'Timetable item created successfully'));
    }
    catch (error) {
        res.status(400).json((0, response_1.createError)(error?.message || 'Failed to create timetable item'));
    }
});
router.post('/generate-auto', manageTimetable, (0, validate_1.validate)(generateAutoSchema), async (req, res) => {
    const created = [];
    const skipped = [];
    try {
        const startMinutes = toMinutes(req.body.startTime ?? '07:00');
        const endMinutes = toMinutes(req.body.endTime ?? '19:00');
        const lessonDurationMinutes = Number(req.body.lessonDurationMinutes ?? 60);
        const breakMinutes = Number(req.body.breakMinutes ?? 0);
        const dayList = (req.body.dayOfWeek?.length ? req.body.dayOfWeek : [6, 0, 1, 2, 3, 4]).map(normalizeDay);
        if (endMinutes <= startMinutes)
            return res.status(400).json((0, response_1.createError)('End time must be after start time.'));
        const classFilter = { isDeleted: { $ne: true }, active: true };
        if (req.body.classIds?.length)
            classFilter._id = { $in: req.body.classIds };
        if (['admin', 'branch_manager'].includes(req.user?.canonicalRole ?? '') && req.user?.branchId)
            classFilter.branchId = req.user.branchId;
        const classes = await Class_1.ClassModel.find(classFilter).select('className branchId assignedSubjects assignedTeachers room').lean();
        const requestedTeacherIds = Array.isArray(req.body.teacherIds) ? req.body.teacherIds.map(String) : [];
        for (const klass of classes) {
            const subjects = await Subject_1.Subject.find({
                isDeleted: { $ne: true },
                activeStatus: true,
                $or: [{ classId: klass._id }, { classIds: klass._id }, { _id: { $in: klass.assignedSubjects ?? [] } }]
            }).lean();
            if (!subjects.length) {
                skipped.push({ classId: String(klass._id), reason: 'No subjects are assigned to this class.' });
                continue;
            }
            let slotCursor = startMinutes;
            let dayCursor = 0;
            for (const subject of subjects) {
                const teacherFilter = {
                    role: 'teacher',
                    isDeleted: { $ne: true },
                    ...(requestedTeacherIds.length ? { _id: { $in: requestedTeacherIds } } : {}),
                    $or: [
                        { assignedClasses: klass._id, assignedSubjects: subject._id },
                        { assignedSubjects: subject._id },
                        { _id: subject.teacher },
                        { _id: { $in: klass.assignedTeachers ?? [] } }
                    ]
                };
                const teachers = await User_1.User.find(teacherFilter).select('name branchId assignedClasses assignedSubjects role').lean();
                if (!teachers.length) {
                    skipped.push({ classId: String(klass._id), subjectId: String(subject._id), reason: 'No eligible teacher found for this class and subject.' });
                    continue;
                }
                let saved = false;
                const attempts = dayList.length * Math.max(1, Math.floor((endMinutes - startMinutes) / Math.max(lessonDurationMinutes + breakMinutes, 1)));
                for (let attempt = 0; attempt < attempts && !saved; attempt += 1) {
                    if (slotCursor + lessonDurationMinutes > endMinutes) {
                        dayCursor = (dayCursor + 1) % dayList.length;
                        slotCursor = startMinutes;
                    }
                    const dayOfWeek = dayList[dayCursor];
                    const startTime = fromMinutes(slotCursor);
                    const endTime = fromMinutes(slotCursor + lessonDurationMinutes);
                    slotCursor += lessonDurationMinutes + breakMinutes;
                    for (const teacher of teachers) {
                        const payload = {
                            classId: String(klass._id),
                            subjectId: String(subject._id),
                            teacherId: String(teacher._id),
                            branchId: String(klass.branchId ?? teacher.branchId ?? req.user?.branchId ?? '') || null,
                            room: klass.room ?? '',
                            dayOfWeek,
                            startTime,
                            endTime,
                            academicYear: req.body.academicYear ?? '',
                            semester: req.body.semester ?? '',
                            isActive: true
                        };
                        try {
                            const validation = await timetableValidation.validateTimetableEntry(payload, { actor: req.user });
                            const item = await Timetable_1.Timetable.create({ ...payload, durationMinutes: validation.durationMinutes, branchId: validation.branchId });
                            const populated = await Timetable_1.Timetable.findById(item._id).populate('classId', 'className name classCode').populate('subjectId', 'title code').populate('teacherId', 'name email phone whatsapp').lean();
                            created.push(serializeTimetable(populated));
                            saved = true;
                            break;
                        }
                        catch (error) {
                            if (attempt === attempts - 1)
                                skipped.push({ classId: String(klass._id), subjectId: String(subject._id), reason: error?.message ?? 'Unable to create safe timetable entry.' });
                        }
                    }
                }
            }
        }
        res.status(201).json((0, response_1.createResponse)({
            createdCount: created.length,
            skippedCount: skipped.length,
            conflicts: skipped,
            entries: created
        }, 'Automatic timetable generation completed'));
    }
    catch (error) {
        res.status(400).json((0, response_1.createError)(error?.message || 'Failed to generate automatic timetable'));
    }
});
router.get('/:id', viewTimetable, (0, validate_1.validate)(idParamsSchema), async (req, res, next) => {
    try {
        const item = await Timetable_1.Timetable.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
            .populate('classId', 'className name classCode')
            .populate('subjectId', 'title code')
            .populate('teacherId', 'name email phone whatsapp')
            .lean();
        if (!item)
            return res.status(404).json((0, response_1.createError)('Timetable item not found'));
        res.json((0, response_1.createResponse)(serializeTimetable(item)));
    }
    catch (error) {
        next(error);
    }
});
router.put('/:id', manageTimetable, (0, validate_1.validate)(updateTimetableSchema), async (req, res) => {
    try {
        const existing = await Timetable_1.Timetable.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).lean();
        if (!existing)
            return res.status(404).json((0, response_1.createError)('Timetable item not found'));
        const payload = normalizePayload(req, req.body, existing);
        const validation = await timetableValidation.validateTimetableEntry(payload, { excludeId: req.params.id, actor: req.user });
        const item = await Timetable_1.Timetable.findOneAndUpdate({ _id: req.params.id, isDeleted: { $ne: true } }, { ...payload, durationMinutes: validation.durationMinutes, branchId: validation.branchId }, { new: true, runValidators: true })
            .populate('classId', 'className name classCode')
            .populate('subjectId', 'title code')
            .populate('teacherId', 'name email phone whatsapp')
            .lean();
        await auditTimetable(req, 'TIMETABLE_UPDATE', item, { fields: Object.keys(req.body) });
        res.json((0, response_1.createResponse)(serializeTimetable(item), 'Timetable item updated successfully'));
    }
    catch (error) {
        res.status(400).json((0, response_1.createError)(error?.message || 'Failed to update timetable item'));
    }
});
router.delete('/:id', manageTimetable, (0, validate_1.validate)(idParamsSchema), async (req, res) => {
    try {
        const item = await Timetable_1.Timetable.findOneAndUpdate({ _id: req.params.id, isDeleted: { $ne: true } }, { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.userId ?? null, isActive: false, active: false }, { new: true }).lean();
        if (!item)
            return res.status(404).json((0, response_1.createError)('Timetable item not found'));
        await auditTimetable(req, 'TIMETABLE_DELETE', item);
        res.json((0, response_1.createResponse)({}, 'Timetable item deleted successfully'));
    }
    catch (error) {
        res.status(400).json((0, response_1.createError)(error?.message || 'Failed to delete timetable item'));
    }
});
exports.timetableRouter = router;
