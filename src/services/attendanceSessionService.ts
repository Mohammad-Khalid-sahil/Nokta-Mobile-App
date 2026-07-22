import { Attendance } from '../models/Attendance';
import { Student } from '../models/Student';
import { Timetable } from '../models/Timetable';
import { User } from '../models/User';
import { BusinessRuleService } from './businessRuleService';

const businessRuleService = new BusinessRuleService();

export function sessionDurationMinutes(entry: { startTime?: string; endTime?: string; durationMinutes?: number }) {
  if (entry.durationMinutes && entry.durationMinutes > 0) {
    return entry.durationMinutes;
  }
  const [startHour, startMinute] = String(entry.startTime ?? '').split(':').map(Number);
  const [endHour, endMinute] = String(entry.endTime ?? '').split(':').map(Number);
  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;
  if (!Number.isFinite(startTotal) || !Number.isFinite(endTotal) || endTotal <= startTotal) {
    return 0;
  }
  return endTotal - startTotal;
}

export function resolveMinimumRequiredMinutes(
  timetableEntry: { startTime?: string; endTime?: string; durationMinutes?: number },
  policy?: { minimumSessionDurationMinutes?: number; minimumSessionDurationPercent?: number } | null
) {
  const sessionDuration = sessionDurationMinutes(timetableEntry);
  if (sessionDuration <= 0) {
    return policy?.minimumSessionDurationMinutes ?? 15;
  }
  const floorMinutes = policy?.minimumSessionDurationMinutes ?? 15;
  const percent = policy?.minimumSessionDurationPercent ?? 50;
  const percentRequired = Math.ceil(sessionDuration * percent / 100);
  return Math.min(sessionDuration, Math.max(floorMinutes, percentRequired));
}

export function computeDurationMinutes(checkInAt: Date, checkOutAt: Date) {
  return Math.max(0, Math.floor((checkOutAt.getTime() - checkInAt.getTime()) / 60000));
}

export function finalizeAttendanceStatus(durationMinutes: number, minimumRequiredMinutes: number): 'present' | 'absent' {
  return durationMinutes >= minimumRequiredMinutes ? 'present' : 'absent';
}

export function todayStart() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

export function getSessionForTime(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export function timetableWindowForToday(entry: any, now = new Date()) {
  const startsAt = new Date(now);
  const [startHour, startMinute] = String(entry.startTime).split(':').map(Number);
  startsAt.setHours(startHour, startMinute, 0, 0);
  const endsAt = new Date(now);
  const [endHour, endMinute] = String(entry.endTime).split(':').map(Number);
  endsAt.setHours(endHour, endMinute, 0, 0);
  const status = now < startsAt ? 'upcoming' : now >= endsAt ? 'closed' : 'active';
  return { isOpen: status === 'active', status, opensAt: startsAt, closesAt: endsAt, startsAt, endsAt };
}

type JoinLeaveContext = {
  student: any;
  entry: any;
  userId?: string | null;
  source?: string;
  markedBy?: string | null;
};

export async function joinClassSession({ student, entry, userId, source, markedBy }: JoinLeaveContext) {
  const attendanceDate = todayStart();
  const policy = await businessRuleService.getAttendancePolicy(entry.branchId ?? student.branchId ?? null) as {
    minimumSessionDurationMinutes?: number;
    minimumSessionDurationPercent?: number;
    _id?: unknown;
  } | null;
  const minimumRequiredMinutes = resolveMinimumRequiredMinutes(entry, policy);

  const existing = await Attendance.findOne({
    timetableId: entry._id,
    studentId: student._id,
    attendanceDate,
    isDeleted: false
  });

  if (existing) {
    if (existing.checkInAt && !existing.checkOutAt) {
      return { attendance: existing, created: false, reopened: false };
    }
    if (existing.checkOutAt) {
      const error: any = new Error('Attendance session already completed for today.');
      error.status = 409;
      error.messageCode = 'session_completed';
      throw error;
    }
  }

  const now = new Date();
  const payload = {
    timetableId: entry._id,
    attendeeType: 'student' as const,
    userId: userId ?? null,
    studentId: student._id,
    classId: entry.classId?._id ?? entry.classId,
    subjectId: entry.subjectId?._id ?? entry.subjectId ?? student.subjectId ?? null,
    teacherId: entry.teacherId?._id ?? entry.teacherId,
    branchId: entry.branchId ?? student.branchId ?? null,
    policyId: (policy as any)?._id ?? null,
    attendanceDate,
    checkInAt: now,
    checkOutAt: null,
    durationMinutes: null,
    minimumRequiredMinutes,
    session: getSessionForTime(now),
    status: 'present' as const,
    source: source ?? 'student_self_checkin',
    markedBy: markedBy ?? null,
    sessionStartTime: entry.startTime,
    sessionEndTime: entry.endTime,
    notes: ''
  };

  if (existing) {
    const updated = await Attendance.findByIdAndUpdate(existing._id, { $set: payload }, { new: true });
    return { attendance: updated, created: false, reopened: true };
  }

  const attendance = await Attendance.create(payload);
  return { attendance, created: true, reopened: false };
}

export async function leaveClassSession({ student, entry }: { student: any; entry: any }) {
  const attendanceDate = todayStart();
  const record = await Attendance.findOne({
    timetableId: entry._id,
    studentId: student._id,
    attendanceDate,
    isDeleted: false
  });

  if (!record?.checkInAt) {
    const error: any = new Error('No active class session to leave.');
    error.status = 404;
    error.messageCode = 'not_joined';
    throw error;
  }

  if (record.checkOutAt) {
    return { attendance: record, alreadyLeft: true };
  }

  const now = new Date();
  const minimumRequiredMinutes = record.minimumRequiredMinutes
    ?? resolveMinimumRequiredMinutes(entry, await businessRuleService.getAttendancePolicy(entry.branchId ?? student.branchId ?? null) as {
      minimumSessionDurationMinutes?: number;
      minimumSessionDurationPercent?: number;
    } | null);
  const durationMinutes = computeDurationMinutes(record.checkInAt, now);
  const status = finalizeAttendanceStatus(durationMinutes, minimumRequiredMinutes);

  const updated = await Attendance.findByIdAndUpdate(
    record._id,
    {
      $set: {
        checkOutAt: now,
        durationMinutes,
        minimumRequiredMinutes,
        status,
        source: record.source === 'student_self_checkin' ? 'student_self_checkin' : record.source
      }
    },
    { new: true }
  );

  return { attendance: updated, alreadyLeft: false, durationMinutes, minimumRequiredMinutes, status };
}

export async function finalizeOpenAttendanceForSession(entry: any, attendanceDate: Date) {
  const window = timetableWindowForToday(entry, new Date());
  if (window.status !== 'closed') {
    return { finalized: 0, createdAbsent: 0 };
  }

  const students = await Student.find({
    classId: entry.classId?._id ?? entry.classId,
    ...(entry.subjectId ? { subjectId: entry.subjectId?._id ?? entry.subjectId } : {}),
    isDeleted: false,
    status: { $ne: 'graduated' }
  }).select('_id studentId branchId teacherId').lean<any[]>();

  const policy = await businessRuleService.getAttendancePolicy(entry.branchId ?? null) as {
    minimumSessionDurationMinutes?: number;
    minimumSessionDurationPercent?: number;
    _id?: unknown;
  } | null;
  const minimumRequiredMinutes = resolveMinimumRequiredMinutes(entry, policy);
  const end = new Date(attendanceDate);
  end.setHours(23, 59, 59, 999);
  let finalized = 0;
  let createdAbsent = 0;

  for (const student of students) {
    const existing = await Attendance.findOne({
      timetableId: entry._id,
      studentId: student._id,
      attendanceDate,
      isDeleted: false
    });

    if (existing?.checkInAt && !existing.checkOutAt) {
      const checkOutAt = window.endsAt;
      const durationMinutes = computeDurationMinutes(existing.checkInAt, checkOutAt);
      const status = finalizeAttendanceStatus(durationMinutes, existing.minimumRequiredMinutes ?? minimumRequiredMinutes);
      await Attendance.updateOne(
        { _id: existing._id },
        {
          $set: {
            checkOutAt,
            durationMinutes,
            minimumRequiredMinutes: existing.minimumRequiredMinutes ?? minimumRequiredMinutes,
            status,
            source: existing.source ?? 'system_auto_closed'
          }
        }
      );
      finalized += 1;
      continue;
    }

    if (existing) {
      continue;
    }

    await Attendance.create({
      timetableId: entry._id,
      attendeeType: 'student',
      userId: null,
      studentId: student._id,
      classId: entry.classId?._id ?? entry.classId,
      subjectId: entry.subjectId?._id ?? entry.subjectId,
      teacherId: entry.teacherId?._id ?? entry.teacherId,
      branchId: entry.branchId ?? student.branchId ?? null,
      policyId: (policy as any)?._id ?? null,
      attendanceDate,
      checkInAt: null,
      checkOutAt: null,
      durationMinutes: null,
      minimumRequiredMinutes,
      session: getSessionForTime(window.startsAt),
      status: 'absent',
      source: 'system_auto_closed',
      sessionStartTime: entry.startTime,
      sessionEndTime: entry.endTime
    });
    createdAbsent += 1;
  }

  return { finalized, createdAbsent };
}

export async function resolveStudentUserId(student: any, fallbackUserId?: string | null) {
  const user = await User.findOne({ studentId: student.studentId, role: 'student', isDeleted: false }).select('_id').lean<any>();
  return user?._id ?? fallbackUserId ?? null;
}

export async function loadTimetableEntry(timetableId: string) {
  return Timetable.findOne({ _id: timetableId, isDeleted: false, isActive: true }).lean<any>();
}
