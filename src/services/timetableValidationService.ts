import { ClassModel } from '../models/Class';
import { Curriculum } from '../models/Curriculum';
import { Subject } from '../models/Subject';
import { Timetable } from '../models/Timetable';
import { User } from '../models/User';

export interface TimetablePayload {
  classId: string;
  subjectId: string;
  teacherId: string;
  branchId?: string | null;
  room?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  academicYear?: string;
  semester?: string;
  isActive?: boolean;
}

export function toMinutes(time: string) {
  const [hours, minutes] = String(time).split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    throw new Error('Invalid timetable time format');
  }
  return hours * 60 + minutes;
}

export function hasTimeConflict(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string) {
  const leftStartMinutes = toMinutes(leftStart);
  const leftEndMinutes = toMinutes(leftEnd);
  const rightStartMinutes = toMinutes(rightStart);
  const rightEndMinutes = toMinutes(rightEnd);

  if (leftEndMinutes <= leftStartMinutes || rightEndMinutes <= rightStartMinutes) {
    throw new Error('End time must be after start time');
  }

  return leftStartMinutes < rightEndMinutes && rightStartMinutes < leftEndMinutes;
}

export function calculateDurationMinutes(startTime: string, endTime: string) {
  return toMinutes(endTime) - toMinutes(startTime);
}

export function subjectBelongsToClass(subject: any, klass: any) {
  const subjectClassIds = new Set([
    subject?.classId ? String(subject.classId) : '',
    ...(Array.isArray(subject?.classIds) ? subject.classIds.map((id: any) => String(id)) : [])
  ].filter(Boolean));
  const classSubjectIds = new Set((klass?.assignedSubjects ?? []).map((id: any) => String(id?._id ?? id)));
  if (klass?.subjectId && String(klass.subjectId) === String(subject?._id)) return true;
  return subjectClassIds.has(String(klass?._id)) || classSubjectIds.has(String(subject?._id));
}

export function teacherCanTeachClassSubject(teacher: any, klass: any, subject: any) {
  const assignedSubjectIds = Array.isArray(teacher?.assignedSubjects)
    ? teacher.assignedSubjects.map((item: any) => String(item?._id ?? item))
    : [];
  const assignedClassIds = Array.isArray(teacher?.assignedClasses)
    ? teacher.assignedClasses.map((item: any) => String(item?._id ?? item))
    : [];
  const classTeacherIds = Array.isArray(klass?.assignedTeachers)
    ? klass.assignedTeachers.map((item: any) => String(item?._id ?? item))
    : [];
  const isClassPrimaryTeacher = klass?.teacherId && String(klass.teacherId) === String(teacher?._id);
  return (
    (subject?.teacher && String(subject.teacher) === String(teacher?._id)) ||
    assignedSubjectIds.includes(String(subject?._id)) ||
    isClassPrimaryTeacher ||
    (assignedClassIds.includes(String(klass?._id)) &&
      (!assignedSubjectIds.length || assignedSubjectIds.includes(String(subject?._id)))) ||
    (classTeacherIds.includes(String(teacher?._id)) &&
      (!assignedSubjectIds.length || assignedSubjectIds.includes(String(subject?._id))))
  );
}

export class TimetableValidationService {
  async getTimetableConflicts(payload: TimetablePayload, options: { excludeId?: string; actor?: any } = {}) {
    const [klass, subject, teacher] = await Promise.all([
      ClassModel.findOne({ _id: payload.classId, isDeleted: false }).lean<any>(),
      Subject.findOne({ _id: payload.subjectId, isDeleted: false, activeStatus: true }).lean<any>(),
      User.findOne({ _id: payload.teacherId, role: 'teacher', isDeleted: false }).lean<any>()
    ]);

    const relationErrors: Array<{ type: string; message: string }> = [];
    if (!klass) relationErrors.push({ type: 'class', message: 'Selected class is invalid.' });
    if (!subject) relationErrors.push({ type: 'subject', message: 'Selected subject is invalid.' });
    if (!teacher) relationErrors.push({ type: 'teacher', message: 'Selected teacher is invalid.' });
    if (relationErrors.length || !klass || !subject || !teacher) {
      return { hasConflict: true, conflicts: relationErrors, durationMinutes: 0, branchId: payload.branchId ?? null };
    }

    const branchId = payload.branchId ?? klass.branchId ?? teacher.branchId ?? null;
    const durationMinutes = calculateDurationMinutes(payload.startTime, payload.endTime);
    const conflicts: Array<{ type: string; message: string; targetId?: string; target?: Record<string, unknown> }> = [];

    if (!subjectBelongsToClass(subject, klass)) {
      conflicts.push({ type: 'subject', message: 'This subject does not belong to the selected class.' });
    }

    if (!teacherCanTeachClassSubject(teacher, klass, subject)) {
      conflicts.push({ type: 'teacher', message: 'This teacher is not assigned to the selected class and subject.' });
    }

    const conflictFilter: any = {
      isDeleted: false,
      isActive: true,
      dayOfWeek: Number(payload.dayOfWeek),
      $or: branchId ? [{ branchId }, { branchId: null }] : [{ branchId: null }, { branchId: { $exists: false } }]
    };
    if (options.excludeId) conflictFilter._id = { $ne: options.excludeId };

    const candidates = await Timetable.find(conflictFilter)
      .populate('teacherId', 'name')
      .populate('classId', 'className name')
      .populate('subjectId', 'title code')
      .lean<any[]>();

    for (const entry of candidates) {
      if (!hasTimeConflict(payload.startTime, payload.endTime, entry.startTime, entry.endTime)) continue;

      const target = {
        className: entry.classId?.className ?? entry.classId?.name ?? '',
        subjectName: entry.subjectId?.title ?? '',
        teacherName: entry.teacherId?.name ?? '',
        room: entry.room ?? '',
        startTime: entry.startTime,
        endTime: entry.endTime
      };

      if (String(entry.teacherId?._id ?? entry.teacherId) === String(payload.teacherId)) {
        conflicts.push({ type: 'teacher', targetId: String(entry._id), message: 'This teacher already has a lesson at this day and time.', target });
      }
      if (String(entry.teacherId?._id ?? entry.teacherId) === String(payload.teacherId) && String(entry.subjectId?._id ?? entry.subjectId) !== String(payload.subjectId)) {
        conflicts.push({ type: 'subject', targetId: String(entry._id), message: 'This teacher is already teaching another subject at this time.', target });
      }
      if (payload.room && entry.room && String(entry.room).trim().toLowerCase() === String(payload.room).trim().toLowerCase()) {
        conflicts.push({ type: 'room', targetId: String(entry._id), message: 'This room already has another lesson at this day and time.', target });
      }
      if (String(entry.classId?._id ?? entry.classId) === String(payload.classId)) {
        conflicts.push({ type: 'class', targetId: String(entry._id), message: 'This class already has another lesson at this day and time.', target });
      }
    }

    return { hasConflict: conflicts.length > 0, conflicts, durationMinutes, branchId };
  }

  async validateTimetableEntry(payload: TimetablePayload, options: { excludeId?: string; actor?: any } = {}) {
    const [klass, subject, teacher] = await Promise.all([
      ClassModel.findOne({ _id: payload.classId, isDeleted: false }).lean<any>(),
      Subject.findOne({ _id: payload.subjectId, isDeleted: false, activeStatus: true }).lean<any>(),
      User.findOne({ _id: payload.teacherId, role: 'teacher', isDeleted: false }).lean<any>()
    ]);

    if (!klass) throw new Error('Selected class is invalid.');
    if (!subject) throw new Error('Selected subject is invalid.');
    if (!teacher) throw new Error('Selected teacher is invalid.');

    const actorRole = options.actor?.canonicalRole ?? options.actor?.role;
    const actorBranchId = options.actor?.branchId ? String(options.actor.branchId) : '';
    const classBranchId = klass.branchId ? String(klass.branchId) : '';
    if (['admin', 'branch_manager'].includes(actorRole ?? '') && actorBranchId && classBranchId !== actorBranchId) {
      throw new Error('You can only manage timetable entries in your branch.');
    }

    if (actorRole === 'teacher') {
      const assignedTeacherIds = (klass.assignedTeachers ?? []).map((id: any) => String(id));
      if (String(payload.teacherId) !== String(options.actor?.userId) || !assignedTeacherIds.includes(String(options.actor?.userId))) {
        throw new Error('Teachers can only manage their assigned class timetable.');
      }
    }

    if (!subjectBelongsToClass(subject, klass)) {
      throw new Error('This subject does not belong to the selected class.');
    }

    if (!teacherCanTeachClassSubject(teacher, klass, subject)) {
      throw new Error('This teacher is not assigned to the selected class and subject.');
    }

    const curriculumCount = await Curriculum.countDocuments({ classId: klass._id, isDeleted: false, active: true });
    if (curriculumCount > 0) {
      const curriculumMatch = await Curriculum.exists({ classId: klass._id, subjectId: subject._id, isDeleted: false, active: true });
      if (!curriculumMatch) {
        throw new Error('Subject is not included in the selected class curriculum.');
      }
    }

    const durationMinutes = calculateDurationMinutes(payload.startTime, payload.endTime);
    if (durationMinutes <= 0) throw new Error('End time must be after start time.');

    const conflictResult = await this.getTimetableConflicts(payload, options);
    if (conflictResult.conflicts.length) {
      throw new Error(conflictResult.conflicts.map((conflict) => conflict.message).join(' '));
    }

    return {
      klass,
      subject,
      teacher,
      durationMinutes,
      branchId: conflictResult.branchId
    };
  }

  async findConflicts(filter: Record<string, any> = {}) {
    const entries = await Timetable.find({ isDeleted: false, isActive: true, ...filter }).lean<any[]>();
    const conflicts: Array<{ sourceId: string; targetId: string; type: string; message: string }> = [];

    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const left = entries[i];
        const right = entries[j];
        if (Number(left.dayOfWeek) !== Number(right.dayOfWeek)) continue;
        if (!hasTimeConflict(left.startTime, left.endTime, right.startTime, right.endTime)) continue;
        if (String(left.teacherId) === String(right.teacherId)) conflicts.push({ sourceId: String(left._id), targetId: String(right._id), type: 'teacher', message: 'Teacher schedule conflict' });
        if (left.room && right.room && String(left.room).toLowerCase() === String(right.room).toLowerCase()) conflicts.push({ sourceId: String(left._id), targetId: String(right._id), type: 'room', message: 'Room booking conflict' });
        if (String(left.classId) === String(right.classId)) conflicts.push({ sourceId: String(left._id), targetId: String(right._id), type: 'class', message: 'Class schedule conflict' });
      }
    }

    return conflicts;
  }
}
