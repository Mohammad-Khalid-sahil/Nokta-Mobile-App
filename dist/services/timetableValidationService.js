"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimetableValidationService = void 0;
exports.toMinutes = toMinutes;
exports.hasTimeConflict = hasTimeConflict;
exports.calculateDurationMinutes = calculateDurationMinutes;
exports.subjectBelongsToClass = subjectBelongsToClass;
exports.teacherCanTeachClassSubject = teacherCanTeachClassSubject;
const Class_1 = require("../models/Class");
const Curriculum_1 = require("../models/Curriculum");
const Subject_1 = require("../models/Subject");
const Timetable_1 = require("../models/Timetable");
const User_1 = require("../models/User");
function toMinutes(time) {
    const [hours, minutes] = String(time).split(':').map(Number);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
        throw new Error('Invalid timetable time format');
    }
    return hours * 60 + minutes;
}
function hasTimeConflict(leftStart, leftEnd, rightStart, rightEnd) {
    const leftStartMinutes = toMinutes(leftStart);
    const leftEndMinutes = toMinutes(leftEnd);
    const rightStartMinutes = toMinutes(rightStart);
    const rightEndMinutes = toMinutes(rightEnd);
    if (leftEndMinutes <= leftStartMinutes || rightEndMinutes <= rightStartMinutes) {
        throw new Error('End time must be after start time');
    }
    return leftStartMinutes < rightEndMinutes && rightStartMinutes < leftEndMinutes;
}
function calculateDurationMinutes(startTime, endTime) {
    return toMinutes(endTime) - toMinutes(startTime);
}
function subjectBelongsToClass(subject, klass) {
    const subjectClassIds = new Set([
        subject?.classId ? String(subject.classId) : '',
        ...(Array.isArray(subject?.classIds) ? subject.classIds.map((id) => String(id)) : [])
    ].filter(Boolean));
    const classSubjectIds = new Set((klass?.assignedSubjects ?? []).map((id) => String(id?._id ?? id)));
    if (klass?.subjectId && String(klass.subjectId) === String(subject?._id))
        return true;
    return subjectClassIds.has(String(klass?._id)) || classSubjectIds.has(String(subject?._id));
}
function teacherCanTeachClassSubject(teacher, klass, subject) {
    const assignedSubjectIds = Array.isArray(teacher?.assignedSubjects)
        ? teacher.assignedSubjects.map((item) => String(item?._id ?? item))
        : [];
    const assignedClassIds = Array.isArray(teacher?.assignedClasses)
        ? teacher.assignedClasses.map((item) => String(item?._id ?? item))
        : [];
    const classTeacherIds = Array.isArray(klass?.assignedTeachers)
        ? klass.assignedTeachers.map((item) => String(item?._id ?? item))
        : [];
    const isClassPrimaryTeacher = klass?.teacherId && String(klass.teacherId) === String(teacher?._id);
    return ((subject?.teacher && String(subject.teacher) === String(teacher?._id)) ||
        assignedSubjectIds.includes(String(subject?._id)) ||
        isClassPrimaryTeacher ||
        (assignedClassIds.includes(String(klass?._id)) &&
            (!assignedSubjectIds.length || assignedSubjectIds.includes(String(subject?._id)))) ||
        (classTeacherIds.includes(String(teacher?._id)) &&
            (!assignedSubjectIds.length || assignedSubjectIds.includes(String(subject?._id)))));
}
class TimetableValidationService {
    async getTimetableConflicts(payload, options = {}) {
        const [klass, subject, teacher] = await Promise.all([
            Class_1.ClassModel.findOne({ _id: payload.classId, isDeleted: false }).lean(),
            Subject_1.Subject.findOne({ _id: payload.subjectId, isDeleted: false, activeStatus: true }).lean(),
            User_1.User.findOne({ _id: payload.teacherId, role: 'teacher', isDeleted: false }).lean()
        ]);
        const relationErrors = [];
        if (!klass)
            relationErrors.push({ type: 'class', message: 'Selected class is invalid.' });
        if (!subject)
            relationErrors.push({ type: 'subject', message: 'Selected subject is invalid.' });
        if (!teacher)
            relationErrors.push({ type: 'teacher', message: 'Selected teacher is invalid.' });
        if (relationErrors.length || !klass || !subject || !teacher) {
            return { hasConflict: true, conflicts: relationErrors, durationMinutes: 0, branchId: payload.branchId ?? null };
        }
        const branchId = payload.branchId ?? klass.branchId ?? teacher.branchId ?? null;
        const durationMinutes = calculateDurationMinutes(payload.startTime, payload.endTime);
        const conflicts = [];
        if (!subjectBelongsToClass(subject, klass)) {
            conflicts.push({ type: 'subject', message: 'This subject does not belong to the selected class.' });
        }
        if (!teacherCanTeachClassSubject(teacher, klass, subject)) {
            conflicts.push({ type: 'teacher', message: 'This teacher is not assigned to the selected class and subject.' });
        }
        const conflictFilter = {
            isDeleted: false,
            isActive: true,
            dayOfWeek: Number(payload.dayOfWeek),
            $or: branchId ? [{ branchId }, { branchId: null }] : [{ branchId: null }, { branchId: { $exists: false } }]
        };
        if (options.excludeId)
            conflictFilter._id = { $ne: options.excludeId };
        const candidates = await Timetable_1.Timetable.find(conflictFilter)
            .populate('teacherId', 'name')
            .populate('classId', 'className name')
            .populate('subjectId', 'title code')
            .lean();
        for (const entry of candidates) {
            if (!hasTimeConflict(payload.startTime, payload.endTime, entry.startTime, entry.endTime))
                continue;
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
    async validateTimetableEntry(payload, options = {}) {
        const [klass, subject, teacher] = await Promise.all([
            Class_1.ClassModel.findOne({ _id: payload.classId, isDeleted: false }).lean(),
            Subject_1.Subject.findOne({ _id: payload.subjectId, isDeleted: false, activeStatus: true }).lean(),
            User_1.User.findOne({ _id: payload.teacherId, role: 'teacher', isDeleted: false }).lean()
        ]);
        if (!klass)
            throw new Error('Selected class is invalid.');
        if (!subject)
            throw new Error('Selected subject is invalid.');
        if (!teacher)
            throw new Error('Selected teacher is invalid.');
        const actorRole = options.actor?.canonicalRole ?? options.actor?.role;
        const actorBranchId = options.actor?.branchId ? String(options.actor.branchId) : '';
        const classBranchId = klass.branchId ? String(klass.branchId) : '';
        if (['admin', 'branch_manager'].includes(actorRole ?? '') && actorBranchId && classBranchId !== actorBranchId) {
            throw new Error('You can only manage timetable entries in your branch.');
        }
        if (actorRole === 'teacher') {
            const assignedTeacherIds = (klass.assignedTeachers ?? []).map((id) => String(id));
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
        const curriculumCount = await Curriculum_1.Curriculum.countDocuments({ classId: klass._id, isDeleted: false, active: true });
        if (curriculumCount > 0) {
            const curriculumMatch = await Curriculum_1.Curriculum.exists({ classId: klass._id, subjectId: subject._id, isDeleted: false, active: true });
            if (!curriculumMatch) {
                throw new Error('Subject is not included in the selected class curriculum.');
            }
        }
        const durationMinutes = calculateDurationMinutes(payload.startTime, payload.endTime);
        if (durationMinutes <= 0)
            throw new Error('End time must be after start time.');
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
    async findConflicts(filter = {}) {
        const entries = await Timetable_1.Timetable.find({ isDeleted: false, isActive: true, ...filter }).lean();
        const conflicts = [];
        for (let i = 0; i < entries.length; i += 1) {
            for (let j = i + 1; j < entries.length; j += 1) {
                const left = entries[i];
                const right = entries[j];
                if (Number(left.dayOfWeek) !== Number(right.dayOfWeek))
                    continue;
                if (!hasTimeConflict(left.startTime, left.endTime, right.startTime, right.endTime))
                    continue;
                if (String(left.teacherId) === String(right.teacherId))
                    conflicts.push({ sourceId: String(left._id), targetId: String(right._id), type: 'teacher', message: 'Teacher schedule conflict' });
                if (left.room && right.room && String(left.room).toLowerCase() === String(right.room).toLowerCase())
                    conflicts.push({ sourceId: String(left._id), targetId: String(right._id), type: 'room', message: 'Room booking conflict' });
                if (String(left.classId) === String(right.classId))
                    conflicts.push({ sourceId: String(left._id), targetId: String(right._id), type: 'class', message: 'Class schedule conflict' });
            }
        }
        return conflicts;
    }
}
exports.TimetableValidationService = TimetableValidationService;
