import { Router } from 'express';
import mongoose from 'mongoose';
import Joi from 'joi';
import { ClassModel } from '../../models/Class';
import { Student } from '../../models/Student';
import { User } from '../../models/User';
import { authenticate, authorize } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { createResponse, createError } from '../../helpers/response';
import { paginationSchema } from '../../validators/pagination';
import { listRecordFilter } from '../../utils/recordVisibility';
import { ClassService } from '../../services/classService';
import { findCurrentAttendanceWindow, findOpenAttendanceWindow, getNextScheduleWindow, getScheduleWindowForDate } from '../../utils/classSchedule';
import { getPublicClassById, listPublicClasses } from '../../services/publicCatalogService';
import { sanitizePlainText } from '../../utils/inputSecurity';

const router = Router();
const classService = new ClassService();

const classBodySchema = Joi.object({
  branchId: Joi.string().hex().length(24).allow('', null).optional(),
  title: Joi.string().trim().allow('', null).optional(),
  description: Joi.string().trim().allow('', null).optional(),
  subjectId: Joi.string().hex().length(24).allow('', null).optional(),
  teacherId: Joi.string().hex().length(24).allow('', null).optional(),
  className: Joi.string().trim().required(),
  classCode: Joi.string().trim().optional(),
  genderRestriction: Joi.string().valid('male', 'female', 'coed').optional(),
  feeAmount: Joi.number().min(0).default(0),
  subjects: Joi.array().items(Joi.string().trim().required()).min(1).required(),
  assignedTeachers: Joi.array().items(Joi.string().hex().length(24)).optional(),
  room: Joi.string().trim().allow('', null).optional(),
  capacity: Joi.number().min(10).max(120).default(30),
  startDate: Joi.date().iso().allow(null).optional(),
  endDate: Joi.date().iso().allow(null).optional(),
  weeklySchedule: Joi.array().items(Joi.object({
    dayOfWeek: Joi.number().integer().min(0).max(6).required(),
    startTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
    endTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
    durationMinutes: Joi.number().integer().min(1).optional(),
    attendanceOpensBeforeMinutes: Joi.number().integer().min(0).default(0),
    attendanceClosesAfterMinutes: Joi.number().integer().min(0).default(0)
  })).optional(),
  examSchedule: Joi.array().items(Joi.date().iso()).optional(),
  active: Joi.boolean().optional(),
  category: Joi.string().trim().max(120).allow('', null).optional(),
  department: Joi.string().trim().max(120).allow('', null).optional(),
  level: Joi.string().trim().max(80).allow('', null).optional(),
  language: Joi.string().valid('en', 'fa', 'ps', 'multilingual').optional(),
  currency: Joi.string().trim().max(8).optional(),
  imageUrl: Joi.string().trim().max(500).allow('', null).optional(),
  thumbnailUrl: Joi.string().trim().max(500).allow('', null).optional(),
  galleryImages: Joi.array().items(Joi.string().trim().max(500)).optional(),
  totalDurationWeeks: Joi.number().min(0).optional(),
  registrationOpen: Joi.boolean().optional(),
  featured: Joi.boolean().optional()
});

const createSchema = Joi.object({
  body: classBodySchema
});

const updateSchema = Joi.object({
  params: Joi.object({
    id: Joi.string().hex().length(24).required()
  }),
  body: Joi.object({
    branchId: Joi.string().hex().length(24).allow('', null).optional(),
    title: Joi.string().trim().allow('', null).optional(),
    description: Joi.string().trim().allow('', null).optional(),
    subjectId: Joi.string().hex().length(24).allow('', null).optional(),
    teacherId: Joi.string().hex().length(24).allow('', null).optional(),
    className: Joi.string().trim().optional(),
    classCode: Joi.string().trim().optional(),
    genderRestriction: Joi.string().valid('male', 'female', 'coed').optional(),
    feeAmount: Joi.number().min(0).optional(),
    subjects: Joi.array().items(Joi.string().trim().required()).min(1).optional(),
    assignedTeachers: Joi.array().items(Joi.string().hex().length(24)).optional(),
    room: Joi.string().trim().allow('', null).optional(),
    capacity: Joi.number().min(10).max(120).optional(),
    startDate: Joi.date().iso().allow(null).optional(),
    endDate: Joi.date().iso().allow(null).optional(),
    weeklySchedule: Joi.array().items(Joi.object({
      dayOfWeek: Joi.number().integer().min(0).max(6).required(),
      startTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
      endTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
      durationMinutes: Joi.number().integer().min(1).optional(),
      attendanceOpensBeforeMinutes: Joi.number().integer().min(0).default(0),
      attendanceClosesAfterMinutes: Joi.number().integer().min(0).default(0)
    })).optional(),
    examSchedule: Joi.array().items(Joi.date().iso()).optional(),
    active: Joi.boolean().optional(),
    imageUrl: Joi.string().trim().max(500).allow('', null).optional(),
    thumbnailUrl: Joi.string().trim().max(500).allow('', null).optional(),
    galleryImages: Joi.array().items(Joi.string().trim().max(500)).optional()
  }).min(1)
});

const idParamsSchema = Joi.object({
  params: Joi.object({
    id: Joi.string().hex().length(24).required()
  })
});

router.get('/public/home', async (req, res, next) => {
  try {
    const items = await listPublicClasses({ ...req.query, homeOnly: true });
    res.json(createResponse(items));
  } catch (error) {
    next(error);
  }
});

router.get('/public', async (req, res, next) => {
  try {
    const items = await listPublicClasses(req.query);
    res.json(createResponse(items));
  } catch (error) {
    next(error);
  }
});

router.get('/public/:id', async (req, res, next) => {
  try {
    const item = await getPublicClassById(req.params.id, String(req.query.lang || 'en'));
    if (!item) return res.status(404).json(createError('Class not found'));
    res.json(createResponse(item));
  } catch (error) {
    next(error);
  }
});

router.use(authenticate);

function serializeClass(klass: any, studentCountMap = new Map<string, number>()) {
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
    assignedTeachers: assignedTeachers.map((teacher: any) => teacher?._id ?? teacher).filter(Boolean),
    assignedTeacherNames: assignedTeachers.map((teacher: any) => teacher?.name ?? teacher).filter(Boolean),
    assignedTeacherCount: assignedTeachers.length,
    assignedSubjects: assignedSubjects.map((subject: any) => subject?._id ?? subject).filter(Boolean),
    subjects: assignedSubjects.map((subject: any) => subject?.title ?? subject).filter(Boolean),
    assignedSubjectCount: assignedSubjects.length,
    studentCount: studentCountMap.get(String(klass?._id ?? '')) ?? Number(klass?.studentCount ?? 0),
    feeAmount: Number(klass?.feeAmount ?? 0)
  };
}

function formatJalali(value: Date | string | null | undefined) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fa-AF-u-ca-persian', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  }).format(date);
}

function formatWindow(window: any) {
  if (!window) return null;
  return {
    ...window,
    opensAt: window.opensAt.toISOString(),
    startsAt: window.startsAt.toISOString(),
    endsAt: window.endsAt.toISOString(),
    closesAt: window.closesAt.toISOString(),
    jalaliDate: formatJalali(window.startsAt)
  };
}

function serializeScheduleStatus(klass: any, now = new Date()) {
  const schedules = Array.isArray(klass?.weeklySchedule) ? klass.weeklySchedule : [];
  const currentWindow = findCurrentAttendanceWindow(schedules, now);
  const openWindow = findOpenAttendanceWindow(schedules, now);
  const nextWindow = getNextScheduleWindow(schedules, now);
  return {
    attendanceStatus: openWindow ? 'active' : currentWindow?.status ?? 'closed',
    currentSessionStatus: formatWindow(openWindow ?? currentWindow),
    nextSession: formatWindow(nextWindow)
  };
}

function buildClassScope(req: any) {
  const filter: Record<string, any> = { isDeleted: false, active: true };
  if (req.user?.canonicalRole === 'teacher') {
    filter.assignedTeachers = req.user.userId;
  }
  if (['admin', 'branch_manager'].includes(req.user?.canonicalRole ?? '') && req.user?.branchId) {
    filter.branchId = req.user.branchId;
  }
  return filter;
}

router.post('/', authorize(['super_admin', 'admin', 'branch_manager']), validate(createSchema), async (req, res, next) => {
  try {
    const klass = await classService.createClass(req.body, req.user?.userId ?? '');
    const savedClass = await ClassModel.findById(klass._id)
      .populate('assignedTeachers', 'name email')
      .populate('assignedSubjects', 'title code')
      .lean();

    res.status(201).json(createResponse(serializeClass(savedClass), 'Class created successfully'));
  } catch (error: any) {
    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json(createError(error.message));
    }

    const message = String(error?.message || 'Unable to create class');
    if (/already exists/i.test(message)) {
      return res.status(400).json(createError(message));
    }

    next(error);
  }
});

router.get('/', authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']), validate(paginationSchema), async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const search = String(req.query.search || '').trim();
    const filter: any = { ...listRecordFilter(req.user) };
    if (search) filter.className = { $regex: search, $options: 'i' };

    if (req.user?.canonicalRole === 'teacher') {
      filter.assignedTeachers = req.user.userId;
    }

    if (req.user?.canonicalRole === 'student') {
      const currentUser = await User.findById(req.user.userId).select('studentId classId').lean<Record<string, any>>();
      const studentRecord = currentUser?.studentId
        ? await Student.findOne({ studentId: currentUser.studentId, isDeleted: false }).select('classId').lean<Record<string, any>>()
        : null;
      filter._id = studentRecord?.classId ?? currentUser?.classId ?? { $in: [] };
    }

    if (req.user?.canonicalRole === 'parent' || req.user?.role === 'family_student') {
      const currentUser = await User.findById(req.user.userId).select('familyId parentProfileId').lean<Record<string, any>>();
      if (!currentUser?.familyId && !currentUser?.parentProfileId) {
        filter._id = { $in: [] };
      } else {
        const familyFilter: Record<string, unknown> = { isDeleted: false };
        if (currentUser?.familyId) familyFilter.familyId = currentUser.familyId;
        if (currentUser?.parentProfileId) familyFilter.parentProfileId = currentUser.parentProfileId;
        const linkedStudents = await Student.find(familyFilter).select('classId').lean<Record<string, any>[]>();
        const classIds = linkedStudents.map((student) => student.classId).filter(Boolean);
        filter._id = classIds.length ? { $in: classIds } : { $in: [] };
      }
    }

    const [classes, total] = await Promise.all([
      ClassModel.find(filter)
        .populate('assignedTeachers', 'name email')
        .populate('assignedSubjects', 'title code')
        .populate('teacherId', 'name email')
        .populate('subjectId', 'title code')
        .lean()
        .skip((page - 1) * limit)
        .limit(limit),
      ClassModel.countDocuments(filter)
    ]);

    const classIds = classes.map((klass: any) => klass._id).filter(Boolean);
    const studentCounts = await Student.aggregate([
      { $match: { classId: { $in: classIds }, isDeleted: false } },
      { $group: { _id: '$classId', count: { $sum: 1 } } }
    ]);
    const studentCountMap = new Map(studentCounts.map((item: any) => [String(item._id), Number(item.count)]));

    res.json(createResponse(classes.map((klass: any) => serializeClass(klass, studentCountMap)), '', { page, limit, total }));
  } catch (error) {
    next(error);
  }
});

router.get('/active-now', authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']), async (req, res, next) => {
  try {
    const now = new Date();
    const classes = await ClassModel.find({
      ...buildClassScope(req),
      'weeklySchedule.dayOfWeek': now.getDay()
    })
      .populate('assignedTeachers', 'name email')
      .populate('assignedSubjects', 'title code')
      .populate('teacherId', 'name email')
      .populate('subjectId', 'title code')
      .lean();

    const activeClasses = classes
      .map((klass: any) => ({ klass, window: findOpenAttendanceWindow(klass.weeklySchedule ?? [], now) }))
      .filter((item) => item.window)
      .map((item) => ({
        ...serializeClass(item.klass),
        ...serializeScheduleStatus(item.klass, now)
      }));

    res.json(createResponse(activeClasses));
  } catch (error) {
    next(error);
  }
});

router.get('/upcoming', authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']), async (req, res, next) => {
  try {
    const now = new Date();
    const limit = Math.min(Number(req.query.limit ?? 10), 50);
    const classes = await ClassModel.find({
      ...buildClassScope(req),
      weeklySchedule: { $exists: true, $ne: [] }
    })
      .populate('assignedTeachers', 'name email')
      .populate('assignedSubjects', 'title code')
      .populate('teacherId', 'name email')
      .populate('subjectId', 'title code')
      .lean();

    const upcoming = classes
      .map((klass: any) => ({ klass, nextWindow: getNextScheduleWindow(klass.weeklySchedule ?? [], now) }))
      .filter((item) => item.nextWindow && item.nextWindow.status !== 'closed')
      .sort((left, right) => (left.nextWindow?.opensAt.getTime() ?? 0) - (right.nextWindow?.opensAt.getTime() ?? 0))
      .slice(0, limit)
      .map((item) => ({
        ...serializeClass(item.klass),
        ...serializeScheduleStatus(item.klass, now)
      }));

    res.json(createResponse(upcoming));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/details', authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']), validate(idParamsSchema), async (req, res, next) => {
  try {
    const klass = (await ClassModel.findOne({ _id: req.params.id, isDeleted: false })
      .populate('assignedTeachers', 'name email')
      .populate('assignedSubjects', 'title code')
      .populate('teacherId', 'name email')
      .populate('subjectId', 'title code')
      .lean()) as any;

    if (!klass) return res.status(404).json(createError('Class not found'));

    if (req.user?.canonicalRole === 'teacher') {
      const teacherIds = Array.isArray(klass.assignedTeachers) ? klass.assignedTeachers.map((item: any) => item._id?.toString?.() ?? String(item)) : [];
      if (!teacherIds.includes(req.user.userId)) return res.status(403).json(createError('Access denied'));
    }

    if (req.user?.canonicalRole === 'student') {
      const currentUser = await User.findById(req.user.userId).select('classId').lean();
      if (String((currentUser as any)?.classId ?? '') !== String(klass._id)) return res.status(403).json(createError('Access denied'));
    }

    if (req.user?.canonicalRole === 'parent' || req.user?.role === 'family_student') {
      const currentUser = await User.findById(req.user.userId).lean();
      const children = (currentUser as any)?.familyId
        ? await User.find({ role: 'student', familyId: (currentUser as any).familyId, isDeleted: false }).select('classId').lean()
        : [];
      const classIds = children.map((child: any) => child.classId?.toString?.()).filter(Boolean);
      if (!classIds.includes(String(klass._id))) return res.status(403).json(createError('Access denied'));
    }

    const studentCount = await Student.countDocuments({ classId: klass._id, isDeleted: false });
    const now = new Date();
    const schedule = (klass.weeklySchedule ?? []).map((item: any) => {
      const nextDate = new Date(now);
      const dayDistance = (Number(item.dayOfWeek) - now.getDay() + 7) % 7;
      nextDate.setDate(now.getDate() + dayDistance);
      const window = getScheduleWindowForDate(item, nextDate);
      return {
        ...item,
        opensAt: window.opensAt.toISOString(),
        closesAt: window.closesAt.toISOString(),
        jalaliDate: formatJalali(window.startsAt)
      };
    });

    res.json(createResponse({
      ...serializeClass(klass, new Map([[String(klass._id), studentCount]])),
      schedule,
      enrolledStudentsCount: studentCount,
      startDateJalali: formatJalali(klass.startDate),
      endDateJalali: formatJalali(klass.endDate),
      ...serializeScheduleStatus(klass, now)
    }));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']), validate(idParamsSchema), async (req, res, next) => {
  try {
    const klass = (await ClassModel.findOne({ _id: req.params.id, isDeleted: false })
      .populate('assignedTeachers', 'name email')
      .populate('assignedSubjects', 'title code')
      .populate('teacherId', 'name email')
      .populate('subjectId', 'title code')
      .lean()) as any;

    if (!klass) return res.status(404).json(createError('Class not found'));

    if (req.user?.canonicalRole === 'teacher') {
      const teacherIds = Array.isArray(klass.assignedTeachers) ? klass.assignedTeachers.map((item: any) => item._id?.toString?.() ?? String(item)) : [];
      if (!teacherIds.includes(req.user.userId)) {
        return res.status(403).json(createError('Access denied'));
      }
    }

    if (req.user?.canonicalRole === 'student') {
      const currentUser = await User.findById(req.user.userId).select('classId').lean();
      if (!(currentUser as any)?.classId?.toString?.() || String((klass as any)._id) !== String((currentUser as any).classId)) {
        return res.status(403).json(createError('Access denied'));
      }
    }

    if (req.user?.canonicalRole === 'parent' || req.user?.role === 'family_student') {
      const currentUser = await User.findById(req.user.userId).lean();
      const children = (currentUser as any)?.familyId
        ? await User.find({ role: 'student', familyId: (currentUser as any).familyId, isDeleted: false }).select('classId').lean()
        : [];
      const classIds = children.map((child: any) => child.classId?.toString?.()).filter(Boolean);
      if (!classIds.includes(String((klass as any)._id))) {
        return res.status(403).json(createError('Access denied'));
      }
    }

    const studentCount = await Student.countDocuments({ classId: klass._id, isDeleted: false });
    res.json(createResponse(serializeClass(klass, new Map([[String(klass._id), studentCount]]))));
  } catch (error) {
    next(error);
  }
});

const updateClassHandler = async (req: any, res: any, next: any) => {
  try {
    const klass = await classService.updateClass(req.params.id, req.body, req.user?.userId ?? '');
    const savedClass = await ClassModel.findById(klass._id)
      .populate('assignedTeachers', 'name email')
      .populate('assignedSubjects', 'title code')
      .lean();
    const studentCount = await Student.countDocuments({ classId: klass._id, isDeleted: false });

    res.json(createResponse(serializeClass(savedClass, new Map([[String(klass._id), studentCount]])), 'Class updated successfully'));
  } catch (error: any) {
    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json(createError(error.message));
    }

    const message = String(error?.message || 'Unable to update class');
    if (/not found/i.test(message)) {
      return res.status(404).json(createError(message));
    }
    if (/already exists/i.test(message) || /at least one subject/i.test(message) || /invalid/i.test(message)) {
      return res.status(400).json(createError(message));
    }

    next(error);
  }
};

router.put('/:id', authorize(['super_admin', 'admin', 'branch_manager']), validate(updateSchema), updateClassHandler);
router.patch('/:id', authorize(['super_admin', 'admin', 'branch_manager']), validate(updateSchema), updateClassHandler);

router.delete('/:id', authorize(['super_admin', 'admin']), validate(idParamsSchema), async (req, res, next) => {
  try {
    await classService.deleteClass(req.params.id, req.user?.userId ?? '');
    res.json(createResponse({}, 'Class deleted successfully'));
  } catch (error: any) {
    const message = String(error?.message || 'Unable to delete class');
    if (/not found/i.test(message)) {
      return res.status(404).json(createError(message));
    }
    if (/active students/i.test(message)) {
      return res.status(400).json(createError(message));
    }

    next(error);
  }
});

export const classRouter = router;
