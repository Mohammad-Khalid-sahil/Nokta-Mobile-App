import { Router, type Request } from 'express';
import Joi from 'joi';
import { Attendance } from '../../models/Attendance';
import { AttendancePolicy } from '../../models/AttendancePolicy';
import { ClassModel } from '../../models/Class';
import { Enrollment } from '../../models/Enrollment';
import { Notification } from '../../models/Notification';
import { Student } from '../../models/Student';
import { Timetable } from '../../models/Timetable';
import { User } from '../../models/User';
import { authenticate, authorize } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { createError, createResponse } from '../../helpers/response';
import { BusinessRuleService } from '../../services/businessRuleService';
import {
  finalizeOpenAttendanceForSession,
  joinClassSession,
  leaveClassSession,
  resolveStudentUserId
} from '../../services/attendanceSessionService';
import { findOpenAttendanceWindow } from '../../utils/classSchedule';

const router = Router();
const businessRuleService = new BusinessRuleService();

const attendanceSchema = Joi.object({
  body: Joi.object({
    studentId: Joi.string().hex().length(24).required(),
    classId: Joi.string().hex().length(24).required(),
    teacherId: Joi.string().hex().length(24).optional(),
    subjectId: Joi.string().hex().length(24).optional(),
    timetableId: Joi.string().hex().length(24).optional(),
    branchId: Joi.string().hex().length(24).optional(),
    attendanceDate: Joi.date().required(),
    session: Joi.string().valid('morning', 'afternoon', 'evening', 'online').required(),
    status: Joi.string().valid('present', 'absent', 'late', 'excused').required(),
    source: Joi.string().valid('teacher_marked', 'admin_marked', 'system_auto_closed', 'manual', 'automation', 'mobile', 'web').optional(),
    notes: Joi.string().allow('', null).optional()
  })
});

const checkInSchema = Joi.object({
  body: Joi.object({
    studentId: Joi.string().hex().length(24).optional(),
    classId: Joi.string().hex().length(24).required(),
    status: Joi.string().valid('present', 'late').default('present'),
    source: Joi.string().valid('mobile', 'web', 'student_self_checkin').optional(),
    notes: Joi.string().allow('', null).optional()
  })
});

const markAttendanceSchema = Joi.object({
  body: Joi.object({
    timetableId: Joi.string().hex().length(24).required(),
    studentId: Joi.string().hex().length(24).optional(),
    attendeeType: Joi.string().valid('student', 'teacher').default('student'),
    status: Joi.string().valid('present', 'late', 'excused').default('present'),
    notes: Joi.string().allow('', null).optional()
  })
});

const joinLeaveSchema = Joi.object({
  body: Joi.object({
    timetableId: Joi.string().hex().length(24).required(),
    studentId: Joi.string().hex().length(24).optional(),
    source: Joi.string().valid('mobile', 'web', 'student_self_checkin').optional()
  })
});

const attendanceWindowSchema = Joi.object({
  query: Joi.object({
    timetableId: Joi.string().hex().length(24).required()
  })
});

const attendanceQuerySchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().allow('', null).optional(),
    classId: Joi.string().hex().length(24).optional(),
    studentId: Joi.string().hex().length(24).optional(),
    teacherId: Joi.string().hex().length(24).optional(),
    subjectId: Joi.string().hex().length(24).optional(),
    branchId: Joi.string().hex().length(24).optional(),
    status: Joi.string().valid('present', 'absent', 'late', 'excused', 'online_auto_marked').optional(),
    session: Joi.string().valid('morning', 'afternoon', 'evening', 'online').optional(),
    date: Joi.date().optional(),
    from: Joi.date().optional(),
    to: Joi.date().optional()
  })
});

const dailyReportSchema = Joi.object({
  query: Joi.object({
    date: Joi.date().optional(),
    classId: Joi.string().hex().length(24).optional(),
    teacherId: Joi.string().hex().length(24).optional(),
    subjectId: Joi.string().hex().length(24).optional()
  })
});

const policySchema = Joi.object({
  body: Joi.object({
    branchId: Joi.string().hex().length(24).allow(null).optional(),
    name: Joi.string().required(),
    duplicateWindowMinutes: Joi.number().min(1).optional(),
    absenceSuspensionThreshold: Joi.number().min(1).optional(),
    onlineAutoMarkEnabled: Joi.boolean().optional(),
    minimumSessionDurationMinutes: Joi.number().min(1).optional(),
    minimumSessionDurationPercent: Joi.number().min(1).max(100).optional(),
    salaryDeductionPerAbsence: Joi.number().min(0).optional(),
    reminderLeadDays: Joi.number().min(1).optional(),
    active: Joi.boolean().optional()
  })
});

router.use(authenticate);

function serializeAttendance(record: any) {
  return {
    ...record,
    studentName: [record?.studentId?.firstName, record?.studentId?.lastName].filter(Boolean).join(' ').trim(),
    className: record?.classId?.className ?? record?.classId?.name ?? '',
    subjectName: record?.subjectId?.title ?? '',
    teacherName: record?.teacherId?.name ?? '',
    source: record?.source ?? 'web',
    joinedAt: record?.checkInAt ?? null,
    leftAt: record?.checkOutAt ?? null,
    inSession: Boolean(record?.checkInAt && !record?.checkOutAt)
  };
}

function parseAttendanceQueryBound(value: string, bound: 'start' | 'end') {
  const raw = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return bound === 'start'
      ? new Date(`${raw}T00:00:00.000+04:30`)
      : new Date(`${raw}T23:59:59.999+04:30`);
  }
  return new Date(raw);
}

function buildDayRange(value: string | Date) {
  const raw = value instanceof Date ? value.toISOString() : String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    return {
      $gte: parseAttendanceQueryBound(raw.trim(), 'start'),
      $lte: parseAttendanceQueryBound(raw.trim(), 'end')
    };
  }
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { $gte: start, $lte: end };
}

function idsEqual(left: unknown, right: unknown) {
  return String(left ?? '') === String(right ?? '');
}

function getSessionForTime(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function timetableWindowForToday(entry: any, now = new Date()) {
  const startsAt = new Date(now);
  const [startHour, startMinute] = String(entry.startTime).split(':').map(Number);
  startsAt.setHours(startHour, startMinute, 0, 0);
  const endsAt = new Date(now);
  const [endHour, endMinute] = String(entry.endTime).split(':').map(Number);
  endsAt.setHours(endHour, endMinute, 0, 0);
  const status = now < startsAt ? 'upcoming' : now >= endsAt ? 'closed' : 'active';
  return { isOpen: status === 'active', status, opensAt: startsAt, closesAt: endsAt, startsAt, endsAt };
}

function attendanceMessageCode(status?: string) {
  if (status === 'upcoming') return 'not_started';
  if (status === 'closed') return 'expired';
  return 'not_active';
}

function attendanceClosedMessage(status?: string) {
  if (status === 'upcoming') return 'Attendance session has not started yet.';
  if (status === 'closed') return 'Attendance time has expired.';
  return 'Attendance session is not active right now.';
}

async function getTimetableAttendanceWindow(timetableId: string) {
  const entry = await Timetable.findOne({ _id: timetableId, isDeleted: false, isActive: true }).lean<any>();
  if (!entry) return { error: { status: 404, message: 'Timetable item not found' } };
  const now = new Date();
  if (Number(entry.dayOfWeek) !== now.getDay()) {
    return {
      entry,
      window: timetableWindowForToday(entry, now),
      error: { status: 403, message: attendanceClosedMessage(), messageCode: 'not_active' }
    };
  }
  const window = timetableWindowForToday(entry, now);
  if (window.status === 'upcoming') {
    return {
      entry,
      window,
      error: { status: 403, message: attendanceClosedMessage('upcoming'), messageCode: 'not_started' }
    };
  }
  if (window.status === 'closed') {
    return {
      entry,
      window,
      error: { status: 403, message: attendanceClosedMessage('closed'), messageCode: 'expired' }
    };
  }
  return { entry, window };
}

async function resolveCurrentStudent(req: Request, explicitStudentId?: string) {
  if (req.user?.canonicalRole === 'student') {
    const currentUser = await User.findById(req.user.userId).select('studentId').lean<Record<string, any>>();
    return currentUser?.studentId
      ? Student.findOne({ studentId: currentUser.studentId, isDeleted: false }).lean<any>()
      : null;
  }

  if (explicitStudentId) {
    return Student.findOne({ _id: explicitStudentId, isDeleted: false }).lean<any>();
  }

  return null;
}

function serializeAttendanceSession(entry: any, window: any, statusOverride?: string, attendance?: any) {
  return {
    timetableId: String(entry._id),
    _id: String(entry._id),
    classId: entry.classId?._id ?? entry.classId,
    subjectId: entry.subjectId?._id ?? entry.subjectId,
    teacherId: entry.teacherId?._id ?? entry.teacherId,
    className: entry.classId?.className ?? entry.classId?.name ?? '',
    subjectName: entry.subjectId?.title ?? '',
    teacherName: entry.teacherId?.name ?? '',
    room: entry.room ?? '',
    onlineLink: entry.onlineLink ?? '',
    dayOfWeek: entry.dayOfWeek,
    startTime: entry.startTime,
    endTime: entry.endTime,
    durationMinutes: entry.durationMinutes ?? null,
    isOpen: window.isOpen,
    status: statusOverride ?? window.status,
    opensAt: window.opensAt.toISOString(),
    startsAt: window.startsAt.toISOString(),
    endsAt: window.endsAt.toISOString(),
    closesAt: window.closesAt.toISOString(),
    message: window.isOpen ? '' : attendanceClosedMessage(window.status),
    messageCode: window.isOpen ? '' : attendanceMessageCode(window.status),
    joinedAt: attendance?.checkInAt ? new Date(attendance.checkInAt).toISOString() : null,
    leftAt: attendance?.checkOutAt ? new Date(attendance.checkOutAt).toISOString() : null,
    inSession: Boolean(attendance?.checkInAt && !attendance?.checkOutAt),
    attendanceRecordStatus: attendance?.status ?? null,
    sessionDurationMinutes: attendance?.durationMinutes ?? null,
    minimumRequiredMinutes: attendance?.minimumRequiredMinutes ?? null
  };
}

function sourceForRole(role?: string) {
  if (role === 'student') return 'student_self_checkin';
  if (role === 'teacher') return 'teacher_marked';
  if (role === 'admin' || role === 'branch_manager' || role === 'super_admin') return 'admin_marked';
  return 'web';
}

async function autoCloseAbsentForSession(entry: any, attendanceDate: Date) {
  const result = await finalizeOpenAttendanceForSession(entry, attendanceDate);
  return result.finalized + result.createdAbsent;
}

async function assertStudentForSession(req: Request, entry: any, explicitStudentId?: string) {
  const student = await resolveCurrentStudent(req, explicitStudentId);
  if (!student) {
    return { error: { status: 404, message: 'Student not found' } };
  }
  if (!idsEqual(student.classId, entry.classId)) {
    return { error: { status: 400, message: 'Student is not enrolled in this class.' } };
  }
  if (student.subjectId && entry.subjectId && !idsEqual(student.subjectId, entry.subjectId)) {
    return { error: { status: 400, message: 'Student is not enrolled in this subject.' } };
  }
  await businessRuleService.assertStudentGenderMatchesClass(student.gender, entry.classId?._id ?? entry.classId);
  return { student };
}

async function teacherCanRecordAttendanceForStudent(req: Request, student: any, classId: string) {
  if (req.user?.canonicalRole !== 'teacher' || !req.user?.userId) {
    return true;
  }

  const userId = String(req.user.userId);
  if (String(student.teacherId) === userId) {
    return true;
  }

  const klass = await ClassModel.findOne({
    _id: classId,
    isDeleted: false,
    $or: [{ teacherId: userId }, { assignedTeachers: userId }]
  }).select('_id').lean();

  return Boolean(klass);
}

async function assertAttendanceWindowAvailable(classId: string) {
  const klass = await ClassModel.findOne({ _id: classId, isDeleted: false, active: true }).select('weeklySchedule className').lean<any>();
  if (!klass) {
    return { error: { status: 404, message: 'Class not found' } };
  }

  const window = findOpenAttendanceWindow(klass.weeklySchedule ?? [], new Date());
  if (!window) {
    return { error: { status: 403, message: 'Attendance is not available for this class at the current time.' } };
  }

  return { klass, window };
}

async function getScopedStudentIds(req: Request) {
  const role = req.user?.canonicalRole;
  if (!role || !req.user?.userId) {
    return null;
  }

  if (role === 'teacher') {
    const teacherId = req.user.userId;
    const classIds = await getTeacherAssignedClassIds(teacherId);
    const [directAssigned, classStudents, enrollmentStudents] = await Promise.all([
      Student.find({ teacherId, isDeleted: false }).select('_id').lean<any[]>(),
      classIds.length
        ? Student.find({
          classId: { $in: classIds },
          isDeleted: false,
          status: 'active'
        }).select('_id').lean<any[]>()
        : Promise.resolve([] as any[]),
      classIds.length
        ? Enrollment.distinct('studentId', {
          classId: { $in: classIds },
          status: 'active',
          isDeleted: { $ne: true }
        })
        : Promise.resolve([] as any[])
    ]);
    const unique = new Map<string, any>();
    [...directAssigned, ...classStudents].forEach((student) => {
      unique.set(String(student._id), student._id);
    });
    enrollmentStudents.forEach((studentId) => {
      unique.set(String(studentId), studentId);
    });
    return [...unique.values()];
  }

  if (role === 'student') {
    const currentUser = await User.findById(req.user.userId).select('studentId').lean<Record<string, any>>();
    if (!currentUser?.studentId) {
      return [];
    }
    const student = await Student.findOne({ studentId: currentUser.studentId, isDeleted: false }).select('_id').lean<Record<string, any>>();
    return student ? [student._id] : [];
  }

  if (role === 'parent') {
    const currentUser = await User.findById(req.user.userId).select('familyId parentProfileId').lean<Record<string, any>>();
    const filter: Record<string, unknown> = { isDeleted: false };
    if (currentUser?.familyId) {
      filter.familyId = currentUser.familyId;
    } else if (currentUser?.parentProfileId) {
      filter.parentProfileId = currentUser.parentProfileId;
    } else {
      return [];
    }

    const students = await Student.find(filter).select('_id').lean();
    return students.map((student: any) => student._id);
  }

  return null;
}

async function getTeacherAssignedClassIds(userId: string) {
  const classes = await ClassModel.find({
    isDeleted: false,
    $or: [{ teacherId: userId }, { assignedTeachers: userId }]
  })
    .select('_id')
    .lean<any[]>();
  return classes.map((item) => item._id);
}

async function buildAttendanceFilter(req: Request) {
  const filter: Record<string, unknown> = { isDeleted: false };
  const role = req.user?.canonicalRole;

  if (req.query.classId) {
    filter.classId = req.query.classId;
  }

  if (req.query.status) {
    filter.status = req.query.status;
  }

  if (req.query.session) {
    filter.session = req.query.session;
  }

  if (req.query.teacherId) {
    filter.teacherId = req.query.teacherId;
  }

  if (req.query.subjectId) {
    filter.subjectId = req.query.subjectId;
  }

  if (req.query.branchId) {
    filter.branchId = req.query.branchId;
  } else if (['admin', 'branch_manager'].includes(role ?? '') && req.user?.branchId) {
    filter.branchId = req.user.branchId;
  }

  if (req.query.date) {
    filter.attendanceDate = buildDayRange(String(req.query.date));
  } else if (req.query.from || req.query.to) {
    const range: Record<string, Date> = {};
    if (req.query.from) {
      range.$gte = parseAttendanceQueryBound(String(req.query.from), 'start');
    }
    if (req.query.to) {
      range.$lte = parseAttendanceQueryBound(String(req.query.to), 'end');
    }
    filter.attendanceDate = range;
  }

  // Teachers are scoped by assigned classes / teacherId below.
  // Student and parent roles still use explicit student-id scoping.
  const scopedStudentIds = await getScopedStudentIds(req);
  if (role !== 'teacher' && Array.isArray(scopedStudentIds)) {
    if (req.query.studentId) {
      const requestedStudentId = String(req.query.studentId);
      const matchesScope = scopedStudentIds.some((studentId: any) => String(studentId) === requestedStudentId);
      filter.studentId = matchesScope ? requestedStudentId : { $in: [] };
    } else {
      filter.studentId = { $in: scopedStudentIds };
    }
  } else if (req.query.studentId) {
    filter.studentId = req.query.studentId;
  }

  if (role === 'teacher' && req.user?.userId) {
    const classIds = await getTeacherAssignedClassIds(req.user.userId);
    if (req.query.classId) {
      const requestedClassId = String(req.query.classId);
      const allowed = classIds.some((classId) => String(classId) === requestedClassId);
      if (!allowed) {
        filter.classId = { $in: [] };
      }
    } else {
      filter.$or = [
        { teacherId: req.user.userId },
        ...(classIds.length ? [{ classId: { $in: classIds } }] : [])
      ];
    }
  }

  return filter;
}

router.get('/options', authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'parent', 'owner']), async (req, res, next) => {
  try {
    const role = req.user?.canonicalRole;
    const scopedStudentIds = await getScopedStudentIds(req);
    const studentFilter: Record<string, unknown> = { isDeleted: false };
    const classFilter: Record<string, unknown> = { isDeleted: false };

    if (Array.isArray(scopedStudentIds)) {
      studentFilter._id = { $in: scopedStudentIds };
    } else if (role === 'teacher' && req.user?.userId) {
      studentFilter.teacherId = req.user.userId;
    } else if (['admin', 'branch_manager'].includes(role ?? '') && req.user?.branchId) {
      studentFilter.branchId = req.user.branchId;
      classFilter.branchId = req.user.branchId;
    }

    const students = await Student.find(studentFilter)
      .select('firstName lastName classId')
      .populate('classId', 'className')
      .sort({ firstName: 1, lastName: 1 })
      .lean();

    const classIds = Array.from(new Set(students.map((student: any) => student.classId?._id?.toString?.() ?? student.classId?.toString?.()).filter(Boolean)));
    if (classIds.length) {
      classFilter._id = { $in: classIds };
    } else if (Array.isArray(scopedStudentIds)) {
      classFilter._id = { $in: [] };
    }

    const classes = await ClassModel.find(classFilter).select('className').sort({ className: 1 }).lean();

    res.json(createResponse({
      students: students.map((student: any) => ({
        _id: student._id,
        name: [student.firstName, student.lastName].filter(Boolean).join(' ').trim(),
        classId: student.classId?._id ?? student.classId ?? null,
        className: student.classId?.className ?? ''
      })),
      classes: classes.map((klass: any) => ({
        _id: klass._id,
        className: klass.className
      }))
    }));
  } catch (error) {
    next(error);
  }
});

router.get('/summary', authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'parent', 'owner']), validate(attendanceQuerySchema), async (req, res, next) => {
  try {
    const filter = await buildAttendanceFilter(req);
    const role = req.user?.canonicalRole;
    const [statusSummary, sessionSummary, studentIds, classIds, recentTrend] = await Promise.all([
      Attendance.aggregate([
        { $match: filter },
        { $group: { _id: '$status', total: { $sum: 1 } } }
      ]),
      Attendance.aggregate([
        { $match: filter },
        { $group: { _id: '$session', total: { $sum: 1 } } }
      ]),
      Attendance.distinct('studentId', filter),
      Attendance.distinct('classId', filter),
      Attendance.aggregate([
        { $match: filter },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$attendanceDate', timezone: 'Asia/Kabul' } },
            present: {
              $sum: {
                $cond: [{ $in: ['$status', ['present', 'online_auto_marked']] }, 1, 0]
              }
            },
            absent: {
              $sum: {
                $cond: [{ $eq: ['$status', 'absent'] }, 1, 0]
              }
            },
            late: {
              $sum: {
                $cond: [{ $eq: ['$status', 'late'] }, 1, 0]
              }
            }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    const statusTotals = statusSummary.reduce<Record<string, number>>((acc, item: any) => {
      acc[item._id] = Number(item.total ?? 0);
      return acc;
    }, {});

    let enrolledStudentCount = studentIds.length;
    if (role === 'teacher' && req.user?.userId) {
      const teacherClassIds = req.query.classId
        ? [String(req.query.classId)]
        : (await getTeacherAssignedClassIds(req.user.userId)).map((id) => String(id));
      if (teacherClassIds.length) {
        const scopedStudents = await getScopedStudentIds(req);
        if (req.query.classId && Array.isArray(scopedStudents)) {
          const classObjectIds = teacherClassIds;
          const [directIds, enrollmentIds] = await Promise.all([
            Student.distinct('_id', {
              classId: { $in: classObjectIds },
              isDeleted: false,
              status: 'active'
            }),
            Enrollment.distinct('studentId', {
              classId: { $in: classObjectIds },
              status: 'active',
              isDeleted: { $ne: true }
            })
          ]);
          enrolledStudentCount = new Set([
            ...directIds.map(String),
            ...enrollmentIds.map(String)
          ]).size;
        } else if (Array.isArray(scopedStudents)) {
          enrolledStudentCount = scopedStudents.length;
        }
      } else {
        enrolledStudentCount = 0;
      }
    }

    res.json(createResponse({
      totalRecords: statusSummary.reduce((sum: number, item: any) => sum + Number(item.total ?? 0), 0),
      present: (statusTotals.present ?? 0) + (statusTotals.online_auto_marked ?? 0),
      absent: statusTotals.absent ?? 0,
      late: statusTotals.late ?? 0,
      excused: statusTotals.excused ?? 0,
      onlineAutoMarked: statusTotals.online_auto_marked ?? 0,
      studentCount: studentIds.length,
      enrolledStudentCount,
      classCount: classIds.length,
      byStatus: statusSummary.map((item: any) => ({ status: item._id, total: item.total })),
      bySession: sessionSummary.map((item: any) => ({ session: item._id, total: item.total })),
      recentTrend: recentTrend.map((item: any) => ({
        date: item._id,
        present: item.present ?? 0,
        absent: item.absent ?? 0,
        late: item.late ?? 0
      }))
    }));
  } catch (error) {
    next(error);
  }
});

router.get('/', authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'parent', 'owner']), validate(attendanceQuerySchema), async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const filter = await buildAttendanceFilter(req);

    const [records, total] = await Promise.all([
      Attendance.find(filter)
        .populate('studentId', 'firstName lastName studentId')
        .populate('classId', 'className classCode')
        .populate('subjectId', 'title code')
        .populate('teacherId', 'name email')
        .lean()
        .sort({ attendanceDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Attendance.countDocuments(filter)
    ]);

    res.json(createResponse(records.map(serializeAttendance), '', { page, limit, total }));
  } catch (error) {
    next(error);
  }
});

router.get('/window', authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'parent', 'owner']), validate(attendanceWindowSchema), async (req, res) => {
  const result = await getTimetableAttendanceWindow(String(req.query.timetableId));
  if (!result.entry) {
    return res.status(result.error?.status ?? 404).json(
      createError(result.error?.message ?? 'Timetable item not found', (result.error as any)?.messageCode)
    );
  }
  res.json(createResponse({
    timetableId: req.query.timetableId,
    classId: result.entry.classId,
    subjectId: result.entry.subjectId,
    teacherId: result.entry.teacherId,
    isOpen: !result.error && result.window?.isOpen,
    status: result.window?.status ?? 'closed',
    opensAt: result.window?.opensAt?.toISOString(),
    closesAt: result.window?.closesAt?.toISOString(),
    message: result.error?.message ?? ''
  }));
});

router.get('/active-sessions', authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'parent', 'owner']), async (req, res, next) => {
  try {
    const now = new Date();
    const role = req.user?.canonicalRole;
    const filter: any = { isDeleted: false, isActive: true, dayOfWeek: now.getDay() };

    if (['admin', 'branch_manager'].includes(role ?? '') && req.user?.branchId) {
      filter.branchId = req.user.branchId;
    }
    if (role === 'teacher') {
      filter.teacherId = req.user?.userId;
    }
    if (role === 'student') {
      const student = await resolveCurrentStudent(req);
      filter.classId = student?.classId ?? null;
      if (student?.subjectId) filter.subjectId = student.subjectId;
    }
    if (role === 'parent') {
      const scopedStudentIds = await getScopedStudentIds(req);
      const students = scopedStudentIds?.length ? await Student.find({ _id: { $in: scopedStudentIds }, isDeleted: false }).select('classId subjectId').lean<any[]>() : [];
      filter.$or = students.map((student) => ({ classId: student.classId, ...(student.subjectId ? { subjectId: student.subjectId } : {}) }));
      if (!filter.$or.length) filter._id = { $in: [] };
    }

    const entries = await Timetable.find(filter)
      .populate('classId', 'className name classCode')
      .populate('subjectId', 'title code')
      .populate('teacherId', 'name email')
      .sort({ startTime: 1 })
      .lean<any[]>();

    let attendanceByTimetable = new Map<string, any>();
    if (role === 'student') {
      const student = await resolveCurrentStudent(req);
      if (student && entries.length) {
        const { start, end } = todayRange();
        const records = await Attendance.find({
          studentId: student._id,
          timetableId: { $in: entries.map((entry) => entry._id) },
          attendanceDate: { $gte: start, $lte: end },
          isDeleted: false
        }).lean<any[]>();
        attendanceByTimetable = new Map(records.map((record) => [String(record.timetableId), record]));
      }
    }

    const sessions = entries.map((entry) => serializeAttendanceSession(
      entry,
      timetableWindowForToday(entry, now),
      undefined,
      attendanceByTimetable.get(String(entry._id))
    ));
    res.json(createResponse({
      active: sessions.filter((session) => session.status === 'active'),
      upcoming: sessions.filter((session) => session.status === 'upcoming'),
      closed: sessions.filter((session) => session.status === 'closed'),
      items: sessions
    }));
  } catch (error) {
    next(error);
  }

});

router.get('/daily-report', authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'parent', 'owner']), validate(dailyReportSchema), async (req, res, next) => {
  try {
    const reportDate = req.query.date ? new Date(String(req.query.date)) : new Date();
    reportDate.setHours(0, 0, 0, 0);
    const end = new Date(reportDate);
    end.setHours(23, 59, 59, 999);
    const role = req.user?.canonicalRole;
    const timetableFilter: any = { isDeleted: false, isActive: true, dayOfWeek: reportDate.getDay() };

    if (req.query.classId) timetableFilter.classId = req.query.classId;
    if (req.query.teacherId) timetableFilter.teacherId = req.query.teacherId;
    if (req.query.subjectId) timetableFilter.subjectId = req.query.subjectId;
    if (role === 'teacher') timetableFilter.teacherId = req.user?.userId;
    if (['admin', 'branch_manager'].includes(role ?? '') && req.user?.branchId) timetableFilter.branchId = req.user.branchId;
    if (role === 'parent') {
      const scopedStudentIds = await getScopedStudentIds(req);
      const linkedStudents = scopedStudentIds?.length
        ? await Student.find({ _id: { $in: scopedStudentIds }, isDeleted: false }).select('classId subjectId').lean<any[]>()
        : [];
      if (linkedStudents.length) {
        timetableFilter.$or = linkedStudents.map((student) => ({
          classId: student.classId,
          ...(student.subjectId ? { subjectId: student.subjectId } : {})
        }));
      } else {
        timetableFilter._id = { $in: [] };
      }
    }

    const sessions = await Timetable.find(timetableFilter)
      .populate('classId', 'className name classCode')
      .populate('subjectId', 'title code')
      .populate('teacherId', 'name email phone')
      .sort({ startTime: 1 })
      .lean<any[]>();

    const rows = [];
    let autoClosedCount = 0;
    for (const session of sessions) {
      autoClosedCount += await autoCloseAbsentForSession(session, reportDate);
      const students = await Student.find({
        classId: session.classId?._id ?? session.classId,
        ...(session.subjectId ? { subjectId: session.subjectId?._id ?? session.subjectId } : {}),
        isDeleted: false
      }).select('firstName lastName studentId').sort({ firstName: 1 }).lean<any[]>();
      const records = await Attendance.find({
        timetableId: session._id,
        attendanceDate: { $gte: reportDate, $lte: end },
        isDeleted: false
      }).populate('studentId', 'firstName lastName studentId').lean<any[]>();
      const recordsByStudent = new Map(records.filter((record) => record.studentId).map((record: any) => [String(record.studentId?._id ?? record.studentId), record]));
      const presentStudents = records.filter((record) => ['present', 'online_auto_marked'].includes(record.status)).map(serializeAttendance);
      const lateStudents = records.filter((record) => record.status === 'late').map(serializeAttendance);
      const absentStudents = students
        .filter((student) => recordsByStudent.get(String(student._id))?.status === 'absent')
        .map((student) => ({
          _id: student._id,
          studentId: student.studentId,
          studentName: [student.firstName, student.lastName].filter(Boolean).join(' ').trim()
        }));
      const totalEnrolled = students.length;
      const attendancePercentage = totalEnrolled > 0
        ? Math.round((presentStudents.length / totalEnrolled) * 100)
        : 0;

      rows.push({
        timetableId: String(session._id),
        classId: session.classId?._id ?? session.classId,
        className: session.classId?.className ?? session.classId?.name ?? '',
        subjectId: session.subjectId?._id ?? session.subjectId,
        subjectName: session.subjectId?.title ?? '',
        teacherId: session.teacherId?._id ?? session.teacherId,
        teacherName: session.teacherId?.name ?? '',
        startTime: session.startTime,
        endTime: session.endTime,
        date: reportDate.toISOString().slice(0, 10),
        totalEnrolledStudents: totalEnrolled,
        presentStudentsCount: presentStudents.length,
        absentStudentsCount: absentStudents.length,
        lateStudentsCount: lateStudents.length,
        attendancePercentage,
        presentStudents,
        absentStudents,
        lateStudents
      });
    }

    res.json(createResponse({ date: reportDate.toISOString(), autoClosedCount, sessions: rows }));
  } catch (error) {
    next(error);
  }
});

router.post('/join', authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student']), validate(joinLeaveSchema), async (req, res, next) => {
  try {
    const result = await getTimetableAttendanceWindow(req.body.timetableId);
    if (result.error) {
      return res.status(result.error.status).json(createError(result.error.message, result.error.messageCode));
    }

    const studentResult = await assertStudentForSession(req, result.entry, req.body.studentId);
    if (studentResult.error) {
      return res.status(studentResult.error.status).json(createError(studentResult.error.message));
    }

    const userId = await resolveStudentUserId(studentResult.student, req.user?.userId);
    const { attendance, created } = await joinClassSession({
      student: studentResult.student,
      entry: result.entry,
      userId,
      source: req.body.source ?? sourceForRole(req.user?.canonicalRole),
      markedBy: req.user?.userId ?? null
    });

    const savedAttendance = await Attendance.findById(attendance._id)
      .populate('studentId', 'firstName lastName studentId')
      .populate('classId', 'className classCode')
      .populate('teacherId', 'name email')
      .lean();

    res.status(created ? 201 : 200).json(createResponse(
      serializeAttendance(savedAttendance),
      created ? 'Joined class successfully' : 'Already in class session'
    ));
  } catch (error: any) {
    if (error?.status) {
      return res.status(error.status).json(createError(error.message, error.messageCode));
    }
    next(error);
  }
});

router.post('/leave', authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student']), validate(joinLeaveSchema), async (req, res, next) => {
  try {
    const entry = await Timetable.findOne({ _id: req.body.timetableId, isDeleted: false, isActive: true }).lean<any>();
    if (!entry) {
      return res.status(404).json(createError('Timetable item not found'));
    }

    const studentResult = await assertStudentForSession(req, entry, req.body.studentId);
    if (studentResult.error) {
      return res.status(studentResult.error.status).json(createError(studentResult.error.message));
    }

    const leaveResult = await leaveClassSession({
      student: studentResult.student,
      entry
    });

    const savedAttendance = await Attendance.findById(leaveResult.attendance?._id)
      .populate('studentId', 'firstName lastName studentId')
      .populate('classId', 'className classCode')
      .populate('teacherId', 'name email')
      .lean();

    const message = leaveResult.alreadyLeft
      ? 'Class session already ended'
      : leaveResult.status === 'present'
        ? 'Attendance marked present'
        : 'Left class before minimum duration — marked absent';

    res.json(createResponse(serializeAttendance(savedAttendance), message));
  } catch (error: any) {
    if (error?.status) {
      return res.status(error.status).json(createError(error.message, error.messageCode));
    }
    next(error);
  }
});

router.post('/mark', authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student']), validate(markAttendanceSchema), async (req, res, next) => {
  try {
    const result = await getTimetableAttendanceWindow(req.body.timetableId);
    if (result.error) {
      return res.status(result.error.status).json(createError(result.error.message, result.error.messageCode));
    }

    const entry = result.entry;
    const { start } = todayRange();
    let studentId = req.body.studentId;
    let userId = req.user?.userId ?? null;
    const attendeeType = req.body.attendeeType ?? (req.user?.canonicalRole === 'teacher' ? 'teacher' : 'student');

    if (attendeeType === 'student') {
      const student = await resolveCurrentStudent(req, studentId);
      if (!student && !studentId) return res.status(400).json(createError('Student is required for attendance'));
      if (!student) return res.status(404).json(createError('Student not found'));
      studentId = String(student._id);
      if (!idsEqual(student.classId, entry.classId)) {
        return res.status(400).json(createError('Student is not enrolled in this class.'));
      }
      if (student.subjectId && !idsEqual(student.subjectId, entry.subjectId)) {
        return res.status(400).json(createError('Student is not enrolled in this subject.'));
      }
      userId = (await User.findOne({ studentId: student.studentId, role: 'student', isDeleted: false }).select('_id').lean<any>())?._id ?? userId;
    }

    if (attendeeType === 'teacher') {
      if (req.user?.canonicalRole === 'teacher' && String(entry.teacherId) !== String(req.user.userId)) {
        return res.status(403).json(createError('Teachers can only mark attendance for their assigned timetable.'));
      }
      userId = req.user?.canonicalRole === 'teacher' ? req.user.userId : String(entry.teacherId);
    }

    const duplicateFilter: Record<string, any> = {
      timetableId: req.body.timetableId,
      attendanceDate: start,
      attendeeType,
      isDeleted: false
    };
    if (attendeeType === 'student') duplicateFilter.studentId = studentId;
    if (attendeeType === 'teacher') duplicateFilter.userId = userId;
    const duplicate = await Attendance.findOne(duplicateFilter).lean();
    if (duplicate) return res.status(409).json(createError('Attendance already recorded for this timetable today.'));

    const attendance = await Attendance.create({
      timetableId: req.body.timetableId,
      attendeeType,
      userId,
      studentId: attendeeType === 'student' ? studentId : null,
      classId: entry.classId,
      subjectId: entry.subjectId,
      teacherId: entry.teacherId,
      branchId: entry.branchId ?? null,
      attendanceDate: start,
      checkInAt: new Date(),
      session: getSessionForTime(new Date()),
      status: req.body.status,
      source: sourceForRole(req.user?.canonicalRole),
      notes: req.body.notes ?? '',
      markedBy: req.user?.userId ?? null,
      sessionStartTime: entry.startTime,
      sessionEndTime: entry.endTime
    });

    res.status(201).json(createResponse(attendance, 'Attendance recorded successfully'));
  } catch (error) {
    next(error);
  }
});

router.post('/check-in', authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student']), validate(checkInSchema), async (req, res, next) => {
  try {
    let studentId = req.body.studentId;
    if (req.user?.canonicalRole === 'student') {
      const currentUser = await User.findById(req.user.userId).select('studentId').lean<Record<string, any>>();
      const student = currentUser?.studentId
        ? await Student.findOne({ studentId: currentUser.studentId, isDeleted: false }).select('_id').lean<Record<string, any>>()
        : null;
      studentId = student?._id ? String(student._id) : studentId;
    }

    if (!studentId) {
      return res.status(400).json(createError('Student is required for attendance check-in'));
    }

    const now = new Date();
    const activeEntries = await Timetable.find({ classId: req.body.classId, isDeleted: false, isActive: true, dayOfWeek: now.getDay() }).sort({ startTime: 1 }).lean<any[]>();
    const activeEntry = activeEntries.find((entry) => timetableWindowForToday(entry, now).status === 'active');
    if (!activeEntry) {
      const upcoming = activeEntries.find((entry) => timetableWindowForToday(entry, now).status === 'upcoming');
      const closed = activeEntries.find((entry) => timetableWindowForToday(entry, now).status === 'closed');
      const windowStatus = upcoming ? 'upcoming' : closed ? 'closed' : undefined;
      return res.status(403).json(createError(attendanceClosedMessage(windowStatus), attendanceMessageCode(windowStatus)));
    }

    req.body = {
      timetableId: activeEntry._id,
      studentId,
      classId: req.body.classId,
      subjectId: activeEntry.subjectId,
      teacherId: activeEntry.teacherId,
      branchId: activeEntry.branchId ?? null,
      attendanceDate: todayRange().start,
      session: getSessionForTime(now),
      status: req.body.status ?? 'present',
      source: req.body.source ?? 'student_self_checkin',
      notes: req.body.notes ?? ''
    };
    return createAttendanceRecord(req, res, next);
  } catch (error) {
    next(error);
  }
});

async function createAttendanceRecord(req: any, res: any, next: any) {
  try {
    const student = await Student.findById(req.body.studentId);
    if (!student) {
      return res.status(404).json(createError('Student not found'));
    }

    let timetableEntry: any = null;
    if (req.body.timetableId) {
      const result = await getTimetableAttendanceWindow(String(req.body.timetableId));
      if (result.error && req.user?.canonicalRole !== 'system_automation') {
        return res.status(result.error.status).json(createError(result.error.message));
      }
      timetableEntry = result.entry;
      req.body.classId = String(timetableEntry.classId);
      req.body.subjectId = timetableEntry.subjectId ? String(timetableEntry.subjectId) : req.body.subjectId;
      req.body.teacherId = String(timetableEntry.teacherId);
      req.body.branchId = timetableEntry.branchId ?? req.body.branchId ?? null;
    } else {
      const teacherManualSource = ['teacher_marked', 'mobile', 'web'].includes(String(req.body.source ?? ''));
      const skipWindow = req.user?.canonicalRole === 'teacher' && teacherManualSource;
      if (!skipWindow) {
        const windowResult = await assertAttendanceWindowAvailable(req.body.classId);
        if (windowResult.error && req.user?.canonicalRole !== 'system_automation') {
          return res.status(windowResult.error.status).json(createError(windowResult.error.message));
        }
      }
    }

    const assignedClassId = student.classId?.toString?.() ?? '';
    let belongsToClass = idsEqual(assignedClassId, req.body.classId);
    if (!belongsToClass) {
      const enrollment = await Enrollment.findOne({
        studentId: student._id,
        classId: req.body.classId,
        status: 'active',
        isDeleted: { $ne: true }
      }).select('_id').lean();
      belongsToClass = Boolean(enrollment);
    }
    if (!belongsToClass) {
      return res.status(400).json(createError('Selected class does not match the student assignment'));
    }
    if (student.subjectId && req.body.subjectId && !idsEqual(student.subjectId, req.body.subjectId)) {
      return res.status(400).json(createError('Selected subject does not match the student assignment'));
    }
    if (!req.body.subjectId && student.subjectId) {
      req.body.subjectId = String(student.subjectId);
    }

    if (['admin', 'branch_manager'].includes(req.user?.canonicalRole ?? '') && req.user?.branchId && String(student.branchId ?? '') !== String(req.user.branchId)) {
      return res.status(403).json(createError('Attendance can only be recorded for students in your branch'));
    }

    if (req.user?.canonicalRole === 'teacher') {
      const canRecord = await teacherCanRecordAttendanceForStudent(req, student, req.body.classId);
      if (!canRecord) {
        return res.status(403).json(createError('Teachers can only record attendance for their assigned students'));
      }

      if (req.body.teacherId && String(req.body.teacherId) !== String(req.user.userId)) {
        return res.status(403).json(createError('Teachers cannot record attendance on behalf of another teacher'));
      }
    }

    await businessRuleService.assertStudentGenderMatchesClass(student.gender, req.body.classId);
    await businessRuleService.assertTeacherGenderMatchesClass(req.body.teacherId ?? student.teacherId.toString(), req.body.classId);

    const attendanceDate = new Date(req.body.attendanceDate);
    const dayStart = new Date(attendanceDate);
    dayStart.setHours(0, 0, 0, 0);
    const existing = await Attendance.findOne({
      studentId: req.body.studentId,
      ...(req.body.timetableId
        ? { timetableId: req.body.timetableId }
        : {
            attendanceDate: buildDayRange(dayStart),
            session: req.body.session,
          }),
      isDeleted: false
    });

    const policy: any = await businessRuleService.getAttendancePolicy(req.body.branchId ?? student.branchId?.toString?.() ?? null);
    const attendancePayload = {
      ...req.body,
      teacherId: req.body.teacherId ?? student.teacherId,
      subjectId: req.body.subjectId ?? student.subjectId ?? null,
      branchId: req.body.branchId ?? student.branchId ?? null,
      policyId: (policy as any)?._id ?? null,
      attendanceDate: req.body.timetableId ? attendanceDate : dayStart,
      source: req.body.source ?? sourceForRole(req.user?.canonicalRole),
      markedBy: req.user?.userId ?? null,
      userId: req.user?.canonicalRole === 'student' ? req.user.userId : req.body.userId ?? null,
      checkInAt: ['absent', 'excused'].includes(String(req.body.status)) ? null : new Date(),
      sessionStartTime: timetableEntry?.startTime ?? req.body.sessionStartTime ?? '',
      sessionEndTime: timetableEntry?.endTime ?? req.body.sessionEndTime ?? ''
    };

    const attendance = existing
      ? await Attendance.findByIdAndUpdate(
        existing._id,
        {
          $set: {
            status: req.body.status,
            source: attendancePayload.source,
            markedBy: attendancePayload.markedBy,
            notes: req.body.notes ?? existing.notes ?? '',
            teacherId: attendancePayload.teacherId,
            subjectId: attendancePayload.subjectId,
            branchId: attendancePayload.branchId,
            checkInAt: attendancePayload.checkInAt,
            sessionStartTime: attendancePayload.sessionStartTime,
            sessionEndTime: attendancePayload.sessionEndTime
          }
        },
        { new: true, runValidators: true }
      )
      : await Attendance.create(attendancePayload);

    if (req.body.status === 'absent' && policy?.absenceSuspensionThreshold) {
      const absenceCount = await Attendance.countDocuments({
        studentId: req.body.studentId,
        status: 'absent',
        isDeleted: false
      });

      if (absenceCount >= policy.absenceSuspensionThreshold && student.status !== 'suspended') {
        await Student.updateOne(
          { _id: student._id },
          { $set: { status: 'suspended' } }
        );

        await Notification.create({
          branchId: student.branchId ?? null,
          title: 'Student suspended automatically',
          description: `Attendance policy triggered automatic suspension for ${student.firstName} ${student.lastName}.`,
          message: `Attendance policy triggered automatic suspension for ${student.firstName} ${student.lastName}.`,
          recipientRoles: ['super_admin', 'admin', 'owner', 'branch_manager'],
          recipientIds: [],
          publishStatus: 'published',
          publishDate: new Date()
        });
      }
    }

    const savedAttendance = await Attendance.findById(attendance._id)
      .populate('studentId', 'firstName lastName studentId')
      .populate('classId', 'className classCode')
      .populate('teacherId', 'name email')
      .lean();

    res.status(existing ? 200 : 201).json(createResponse(
      serializeAttendance(savedAttendance),
      existing ? 'Attendance updated successfully' : 'Attendance recorded successfully'
    ));
  } catch (error) {
    next(error);
  }
}

router.post('/', authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'system_automation']), validate(attendanceSchema), createAttendanceRecord);

router.get('/policies', authorize(['super_admin', 'admin', 'branch_manager', 'owner']), async (_req, res, next) => {
  try {
    const policies = await AttendancePolicy.find({ isDeleted: false }).lean();
    res.json(createResponse(policies));
  } catch (error) {
    next(error);
  }
});

router.post('/policies', authorize(['super_admin', 'admin', 'owner']), validate(policySchema), async (req, res, next) => {
  try {
    const policy = await AttendancePolicy.create(req.body);
    res.status(201).json(createResponse(policy, 'Attendance policy created successfully'));
  } catch (error) {
    next(error);
  }
});

router.put('/policies/:id', authorize(['super_admin', 'admin', 'owner']), validate(policySchema), async (req, res, next) => {
  try {
    const policy = await AttendancePolicy.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).lean();
    if (!policy) {
      return res.status(404).json(createError('Attendance policy not found'));
    }
    res.json(createResponse(policy, 'Attendance policy updated successfully'));
  } catch (error) {
    next(error);
  }
});

export const attendanceRouter = router;
