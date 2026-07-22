import { Router } from 'express';
import Joi from 'joi';
import { Timetable } from '../../models/Timetable';
import { AuditLog } from '../../models/AuditLog';
import { ClassModel } from '../../models/Class';
import { Subject } from '../../models/Subject';
import { User } from '../../models/User';
import { Student } from '../../models/Student';
import { Branch } from '../../models/Branch';
import { authenticate, authorize } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { createError, createResponse } from '../../helpers/response';
import { TimetableValidationService } from '../../services/timetableValidationService';

const router = Router();
const timetableValidation = new TimetableValidationService();

const viewTimetable = authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']);
const manageTimetable = authorize(['super_admin', 'admin', 'branch_manager']);

const dayValues = [0, 1, 2, 3, 4, 5, 6];
const dayNameMap: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

const daySchema = Joi.alternatives().try(
  Joi.number().integer().valid(...dayValues),
  Joi.string().valid(...Object.keys(dayNameMap))
);

const payloadSchema = {
  classId: Joi.string().hex().length(24).required(),
  subjectId: Joi.string().hex().length(24).required(),
  teacherId: Joi.string().hex().length(24).required(),
  dayOfWeek: daySchema.required(),
  startTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
  endTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
  room: Joi.string().trim().allow('', null).optional(),
  academicYear: Joi.string().trim().allow('', null).optional(),
  semester: Joi.string().trim().allow('', null).optional(),
  deliveryMode: Joi.string().valid('in_person', 'online', 'hybrid').optional(),
  onlineLink: Joi.string().trim().allow('', null).optional(),
  notes: Joi.string().trim().allow('', null).optional(),
  isActive: Joi.boolean().optional(),
  active: Joi.boolean().optional(),
  branchId: Joi.string().hex().length(24).allow('', null).optional()
};

const createTimetableSchema = Joi.object({ body: Joi.object(payloadSchema) });
const checkConflictSchema = Joi.object({ body: Joi.object(payloadSchema) });
const generateAutoSchema = Joi.object({
  body: Joi.object({
    classIds: Joi.array().items(Joi.string().hex().length(24)).optional(),
    dayOfWeek: Joi.array().items(daySchema).optional(),
    startTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).default('07:00'),
    endTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).default('19:00'),
    lessonDurationMinutes: Joi.number().integer().min(15).max(240).default(60),
    breakMinutes: Joi.number().integer().min(0).max(120).default(0),
    teacherIds: Joi.array().items(Joi.string().hex().length(24)).optional()
  })
});
const updateTimetableSchema = Joi.object({
  params: Joi.object({ id: Joi.string().hex().length(24).required() }),
  body: Joi.object({
    ...payloadSchema,
    classId: payloadSchema.classId.optional(),
    subjectId: payloadSchema.subjectId.optional(),
    teacherId: payloadSchema.teacherId.optional(),
    dayOfWeek: payloadSchema.dayOfWeek.optional(),
    startTime: payloadSchema.startTime.optional(),
    endTime: payloadSchema.endTime.optional()
  }).min(1)
});
const idParamsSchema = Joi.object({ params: Joi.object({ id: Joi.string().hex().length(24).required() }) });
const timetableQuerySchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(500).default(100),
    search: Joi.string().allow('', null),
    classId: Joi.string().hex().length(24).optional(),
    teacherId: Joi.string().hex().length(24).optional(),
    subjectId: Joi.string().hex().length(24).optional(),
    branchId: Joi.string().hex().length(24).optional(),
    room: Joi.string().trim().allow('', null).optional(),
    dayOfWeek: daySchema.optional(),
    academicYear: Joi.string().trim().allow('', null).optional(),
    semester: Joi.string().trim().allow('', null).optional()
  })
});
const printViewQuerySchema = Joi.object({
  query: Joi.object({
    classId: Joi.string().hex().length(24).optional(),
    branchId: Joi.string().hex().length(24).optional(),
    academicYear: Joi.string().trim().allow('', null).optional(),
    semester: Joi.string().trim().allow('', null).optional()
  })
});

function normalizeNullableId(value: unknown) {
  return value === '' || value === undefined ? null : value;
}

function normalizeDay(value: unknown) {
  if (typeof value === 'string' && value in dayNameMap) return dayNameMap[value];
  return Number(value);
}

function toMinutes(time: string) {
  const [hours, minutes] = String(time).split(':').map(Number);
  return hours * 60 + minutes;
}

function fromMinutes(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function serializeTimetable(item: any) {
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

function serializePrintEntry(item: any) {
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

function serializeClassInfo(klass: any) {
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

function serializeBranchInfo(branch: any) {
  return branch ? {
    _id: String(branch?._id ?? ''),
    name: branch?.name ?? '',
    code: branch?.code ?? '',
    city: branch?.city ?? '',
    address: branch?.address ?? '',
    phone: branch?.phone ?? ''
  } : null;
}

function buildPrintSheet(klass: any, entries: any[], branch: any) {
  const normalizedEntries = entries.map(serializePrintEntry);
  const timeSlots = Array.from(new Set(normalizedEntries.map((entry) => `${entry.startTime}-${entry.endTime}`)))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const cells = normalizedEntries.reduce<Record<string, Record<string, ReturnType<typeof serializePrintEntry>[]>>>((acc, entry) => {
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

async function auditTimetable(req: any, action: string, item: any, metadata: Record<string, unknown> = {}) {
  if (!req.user?.userId || !item?._id) return;
  await AuditLog.create({
    actor: req.user.userId,
    branchId: item.branchId ?? req.user?.branchId ?? null,
    action,
    target: String(item._id),
    targetType: 'timetable',
    severity: action.endsWith('DELETE') ? 'warning' : 'info',
    metadata
  });
}

function normalizePayload(req: any, body: Record<string, any>, existing: Record<string, any> = {}): any {
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

async function buildRoleFilter(req: any) {
  const filter: any = { isDeleted: { $ne: true } };
  const role = req.user?.canonicalRole ?? req.user?.role;

  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.teacherId) filter.teacherId = req.query.teacherId;
  if (req.query.subjectId) filter.subjectId = req.query.subjectId;
  if (req.query.branchId) filter.branchId = req.query.branchId;
  if (req.query.room) filter.room = req.query.room;
  if (req.query.dayOfWeek !== undefined) filter.dayOfWeek = normalizeDay(req.query.dayOfWeek);
  if (req.query.academicYear) filter.academicYear = req.query.academicYear;
  if (req.query.semester) filter.semester = req.query.semester;

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
    const currentUser = await User.findById(req.user.userId).select('studentId classId').lean<any>();
    const linkedStudent = currentUser?.studentId
      ? await Student.findOne({ studentId: currentUser.studentId, isDeleted: false }).select('classId').lean<any>()
      : null;
    const scopedClassId = linkedStudent?.classId ?? currentUser?.classId ?? null;
    filter.classId = scopedClassId;
    if (!scopedClassId) {
      filter._id = { $in: [] };
    }
  }

  if (role === 'parent') {
    const currentUser = await User.findById(req.user.userId).select('familyId parentProfileId').lean<any>();
    const children = await Student.find({
      isDeleted: false,
      ...(currentUser?.familyId ? { familyId: currentUser.familyId } : {}),
      ...(!currentUser?.familyId && currentUser?.parentProfileId ? { parentProfileId: currentUser.parentProfileId } : {})
    }).select('classId').lean<any[]>();
    const classIds = children.map((child: any) => child.classId).filter(Boolean);
    filter.classId = classIds.length ? { $in: classIds } : { $in: [] };
  }

  return filter;
}

async function findTimetable(filter: Record<string, any>, page = 1, limit = 100) {
  const [items, total] = await Promise.all([
    Timetable.find(filter)
      .populate('classId', 'className name classCode')
      .populate('subjectId', 'title code')
      .populate('teacherId', 'name email phone whatsapp')
      .sort({ dayOfWeek: 1, startTime: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Timetable.countDocuments(filter)
  ]);

  return { items: items.map(serializeTimetable), total };
}

router.use(authenticate);

router.get('/week', viewTimetable, validate(timetableQuerySchema), async (req, res, next) => {
  try {
    const filter = await buildRoleFilter(req);
    const { items, total } = await findTimetable(filter, 1, 500);
    const conflicts = await timetableValidation.findConflicts(filter);
    res.json(createResponse({ items, conflicts }, '', { page: 1, limit: 500, total }));
  } catch (error) {
    next(error);
  }
});

router.get('/conflicts', viewTimetable, validate(timetableQuerySchema), async (req, res, next) => {
  try {
    const filter = await buildRoleFilter(req);
    const conflicts = await timetableValidation.findConflicts(filter);
    res.json(createResponse(conflicts));
  } catch (error) {
    next(error);
  }
});

router.get('/analytics', viewTimetable, validate(timetableQuerySchema), async (req, res, next) => {
  try {
    const filter = await buildRoleFilter(req);
    const entries = await Timetable.find(filter).lean<any[]>();
    const teacherLoad: Record<string, number> = {};
    const roomUtilization: Record<string, number> = {};
    for (const entry of entries) {
      teacherLoad[String(entry.teacherId)] = (teacherLoad[String(entry.teacherId)] ?? 0) + Number(entry.durationMinutes ?? 0);
      if (entry.room) roomUtilization[entry.room] = (roomUtilization[entry.room] ?? 0) + Number(entry.durationMinutes ?? 0);
    }
    res.json(createResponse({ totalEntries: entries.length, teacherLoad, roomUtilization, conflicts: await timetableValidation.findConflicts(filter) }));
  } catch (error) {
    next(error);
  }
});

router.post('/check-conflicts', manageTimetable, validate(checkConflictSchema), async (req, res) => {
  try {
    const payload = normalizePayload(req, req.body);
    const result = await timetableValidation.getTimetableConflicts(payload, { actor: req.user });
    res.json(createResponse(result, result.hasConflict ? 'Timetable conflicts found' : 'No timetable conflict found'));
  } catch (error: any) {
    res.status(400).json(createError(error?.message || 'Failed to check timetable conflicts'));
  }
});

router.get('/class/:id', viewTimetable, async (req, res, next) => {
  try {
    const filter = await buildRoleFilter(req);
    filter.classId = req.params.id;
    const { items, total } = await findTimetable(filter, 1, 500);
    res.json(createResponse(items, '', { page: 1, limit: 500, total }));
  } catch (error) {
    next(error);
  }
});

router.get('/teacher/:id', viewTimetable, async (req, res, next) => {
  try {
    const filter = await buildRoleFilter(req);
    filter.teacherId = req.params.id;
    const { items, total } = await findTimetable(filter, 1, 500);
    res.json(createResponse(items, '', { page: 1, limit: 500, total }));
  } catch (error) {
    next(error);
  }
});

router.get('/room/:id', viewTimetable, async (req, res, next) => {
  try {
    const filter = await buildRoleFilter(req);
    filter.room = decodeURIComponent(req.params.id);
    const { items, total } = await findTimetable(filter, 1, 500);
    res.json(createResponse(items, '', { page: 1, limit: 500, total }));
  } catch (error) {
    next(error);
  }
});

router.get('/print-view/all', viewTimetable, validate(printViewQuerySchema), async (req, res, next) => {
  try {
    const filter = await buildRoleFilter(req);
    const role = req.user?.canonicalRole ?? req.user?.role;
    if (!['student', 'family_student', 'parent'].includes(role ?? '')) delete filter.classId;
    if (role !== 'teacher') delete filter.teacherId;
    if (req.query.subjectId) delete filter.subjectId;
    if (req.query.room) delete filter.room;
    if (req.query.dayOfWeek !== undefined) delete filter.dayOfWeek;

    const entries = await Timetable.find(filter)
      .populate('classId', 'className name classCode code level room capacity semester academicYear branchId')
      .populate('subjectId', 'title name code')
      .populate('teacherId', 'name phone whatsapp')
      .sort({ classId: 1, dayOfWeek: 1, startTime: 1 })
      .lean<any[]>();

    const classIds = Array.from(new Set(entries.map((entry) => String(entry.classId?._id ?? entry.classId)).filter(Boolean)));
    const classFilter: any = { isDeleted: { $ne: true } };
    if (!classIds.length) return res.json(createResponse({ sheets: [] }));
    classFilter._id = { $in: classIds };
    if (role === 'teacher') classFilter._id = { $in: classIds };
    if (['student', 'family_student', 'parent'].includes(role ?? '') && filter.classId) classFilter._id = filter.classId;
    if (filter.branchId) classFilter.branchId = filter.branchId;

    const foundClasses = await ClassModel.find(classFilter).select('className name classCode code level room capacity semester academicYear branchId').lean<any[]>();
    const classMap = new Map(foundClasses.map((klass) => [String(klass._id), klass]));
    entries.forEach((entry) => {
      const classRef = entry.classId;
      const classId = String(classRef?._id ?? classRef ?? '');
      if (classId && classRef?._id && !classMap.has(classId)) classMap.set(classId, classRef);
    });
    const classes = Array.from(classMap.values());
    const branchIds = Array.from(new Set([
      ...classes.map((klass) => String(klass.branchId ?? '')).filter(Boolean),
      ...entries.map((entry) => String(entry.branchId ?? '')).filter(Boolean)
    ]));
    const branches = branchIds.length ? await Branch.find({ _id: { $in: branchIds } }).lean<any[]>() : [];
    const branchMap = new Map(branches.map((branch) => [String(branch._id), branch]));
    const entryMap = new Map<string, any[]>();
    entries.forEach((entry) => {
      const key = String(entry.classId?._id ?? entry.classId);
      entryMap.set(key, [...(entryMap.get(key) ?? []), entry]);
    });

    const sheets = classes.map((klass) => buildPrintSheet(klass, entryMap.get(String(klass._id)) ?? [], branchMap.get(String(klass.branchId ?? ''))));
    res.json(createResponse({ sheets }));
  } catch (error) {
    next(error);
  }
});

router.get('/print-view', viewTimetable, validate(printViewQuerySchema), async (req, res, next) => {
  try {
    if (!req.query.classId) return res.status(400).json(createError('classId is required for selected class print view.'));
    const filter = await buildRoleFilter(req);
    const scopedClass = filter.classId;
    const requestedClassId = String(req.query.classId);
    if (scopedClass && typeof scopedClass === 'string' && scopedClass !== requestedClassId) {
      return res.status(403).json(createError('You are not allowed to view this class timetable.'));
    }
    if (scopedClass?.$in && !scopedClass.$in.map(String).includes(requestedClassId)) {
      return res.status(403).json(createError('You are not allowed to view this class timetable.'));
    }
    filter.classId = req.query.classId;

    const entries = await Timetable.find(filter)
      .populate('classId', 'className name classCode code level room capacity semester academicYear branchId')
      .populate('subjectId', 'title name code')
      .populate('teacherId', 'name phone whatsapp')
      .sort({ dayOfWeek: 1, startTime: 1 })
      .lean<any[]>();

    const klass = await ClassModel.findOne({ _id: req.query.classId, isDeleted: { $ne: true } })
      .select('className name classCode code level room capacity semester academicYear branchId')
      .lean<any>();
    if (!klass) return res.status(404).json(createError('Class not found'));
    const branch = klass.branchId ? await Branch.findById(klass.branchId).lean<any>() : null;
    res.json(createResponse(buildPrintSheet(klass, entries, branch)));
  } catch (error) {
    next(error);
  }
});

router.get('/', viewTimetable, validate(timetableQuerySchema), async (req, res, next) => {
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
    res.json(createResponse(items, '', { page, limit, total }));
  } catch (error) {
    next(error);
  }
});

router.post('/', manageTimetable, validate(createTimetableSchema), async (req, res) => {
  try {
    const payload = normalizePayload(req, req.body);
    const validation = await timetableValidation.validateTimetableEntry(payload, { actor: req.user });
    const item = await Timetable.create({ ...payload, durationMinutes: validation.durationMinutes, branchId: validation.branchId });
    await auditTimetable(req, 'TIMETABLE_CREATE', item, { classId: payload.classId, subjectId: payload.subjectId, teacherId: payload.teacherId });
    const saved = await Timetable.findById(item._id).populate('classId', 'className name classCode').populate('subjectId', 'title code').populate('teacherId', 'name email phone whatsapp').lean();
    res.status(201).json(createResponse(serializeTimetable(saved), 'Timetable item created successfully'));
  } catch (error: any) {
    res.status(400).json(createError(error?.message || 'Failed to create timetable item'));
  }
});

router.post('/generate-auto', manageTimetable, validate(generateAutoSchema), async (req, res) => {
  const created: any[] = [];
  const skipped: Array<{ classId?: string; subjectId?: string; reason: string }> = [];

  try {
    const startMinutes = toMinutes(req.body.startTime ?? '07:00');
    const endMinutes = toMinutes(req.body.endTime ?? '19:00');
    const lessonDurationMinutes = Number(req.body.lessonDurationMinutes ?? 60);
    const breakMinutes = Number(req.body.breakMinutes ?? 0);
    const dayList = (req.body.dayOfWeek?.length ? req.body.dayOfWeek : [6, 0, 1, 2, 3, 4]).map(normalizeDay);
    if (endMinutes <= startMinutes) return res.status(400).json(createError('End time must be after start time.'));

    const classFilter: any = { isDeleted: { $ne: true }, active: true };
    if (req.body.classIds?.length) classFilter._id = { $in: req.body.classIds };
    if (['admin', 'branch_manager'].includes(req.user?.canonicalRole ?? '') && req.user?.branchId) classFilter.branchId = req.user.branchId;

    const classes = await ClassModel.find(classFilter).select('className branchId assignedSubjects assignedTeachers room').lean<any[]>();
    const requestedTeacherIds = Array.isArray(req.body.teacherIds) ? req.body.teacherIds.map(String) : [];

    for (const klass of classes) {
      const subjects = await Subject.find({
        isDeleted: { $ne: true },
        activeStatus: true,
        $or: [{ classId: klass._id }, { classIds: klass._id }, { _id: { $in: klass.assignedSubjects ?? [] } }]
      }).lean<any[]>();

      if (!subjects.length) {
        skipped.push({ classId: String(klass._id), reason: 'No subjects are assigned to this class.' });
        continue;
      }

      let slotCursor = startMinutes;
      let dayCursor = 0;
      for (const subject of subjects) {
        const teacherFilter: any = {
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
        const teachers = await User.find(teacherFilter).select('name branchId assignedClasses assignedSubjects role').lean<any[]>();
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
              const item = await Timetable.create({ ...payload, durationMinutes: validation.durationMinutes, branchId: validation.branchId });
              const populated = await Timetable.findById(item._id).populate('classId', 'className name classCode').populate('subjectId', 'title code').populate('teacherId', 'name email phone whatsapp').lean();
              created.push(serializeTimetable(populated));
              saved = true;
              break;
            } catch (error: any) {
              if (attempt === attempts - 1) skipped.push({ classId: String(klass._id), subjectId: String(subject._id), reason: error?.message ?? 'Unable to create safe timetable entry.' });
            }
          }
        }
      }
    }

    res.status(201).json(createResponse({
      createdCount: created.length,
      skippedCount: skipped.length,
      conflicts: skipped,
      entries: created
    }, 'Automatic timetable generation completed'));
  } catch (error: any) {
    res.status(400).json(createError(error?.message || 'Failed to generate automatic timetable'));
  }
});

router.get('/:id', viewTimetable, validate(idParamsSchema), async (req, res, next) => {
  try {
    const item = await Timetable.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
      .populate('classId', 'className name classCode')
      .populate('subjectId', 'title code')
      .populate('teacherId', 'name email phone whatsapp')
      .lean();
    if (!item) return res.status(404).json(createError('Timetable item not found'));
    res.json(createResponse(serializeTimetable(item)));
  } catch (error) {
    next(error);
  }
});

router.put('/:id', manageTimetable, validate(updateTimetableSchema), async (req, res) => {
  try {
    const existing = await Timetable.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).lean<any>();
    if (!existing) return res.status(404).json(createError('Timetable item not found'));
    const payload = normalizePayload(req, req.body, existing);
    const validation = await timetableValidation.validateTimetableEntry(payload, { excludeId: req.params.id, actor: req.user });
    const item = await Timetable.findOneAndUpdate(
      { _id: req.params.id, isDeleted: { $ne: true } },
      { ...payload, durationMinutes: validation.durationMinutes, branchId: validation.branchId },
      { new: true, runValidators: true }
    )
      .populate('classId', 'className name classCode')
      .populate('subjectId', 'title code')
      .populate('teacherId', 'name email phone whatsapp')
      .lean();
    await auditTimetable(req, 'TIMETABLE_UPDATE', item, { fields: Object.keys(req.body) });
    res.json(createResponse(serializeTimetable(item), 'Timetable item updated successfully'));
  } catch (error: any) {
    res.status(400).json(createError(error?.message || 'Failed to update timetable item'));
  }
});

router.delete('/:id', manageTimetable, validate(idParamsSchema), async (req, res) => {
  try {
    const item = await Timetable.findOneAndUpdate(
      { _id: req.params.id, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.userId ?? null, isActive: false, active: false },
      { new: true }
    ).lean();
    if (!item) return res.status(404).json(createError('Timetable item not found'));
    await auditTimetable(req, 'TIMETABLE_DELETE', item);
    res.json(createResponse({}, 'Timetable item deleted successfully'));
  } catch (error: any) {
    res.status(400).json(createError(error?.message || 'Failed to delete timetable item'));
  }
});

export const timetableRouter = router;
