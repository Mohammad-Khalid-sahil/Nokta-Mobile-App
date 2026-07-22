"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionDurationMinutes = sessionDurationMinutes;
exports.resolveMinimumRequiredMinutes = resolveMinimumRequiredMinutes;
exports.computeDurationMinutes = computeDurationMinutes;
exports.finalizeAttendanceStatus = finalizeAttendanceStatus;
exports.todayStart = todayStart;
exports.getSessionForTime = getSessionForTime;
exports.timetableWindowForToday = timetableWindowForToday;
exports.joinClassSession = joinClassSession;
exports.leaveClassSession = leaveClassSession;
exports.finalizeOpenAttendanceForSession = finalizeOpenAttendanceForSession;
exports.resolveStudentUserId = resolveStudentUserId;
exports.loadTimetableEntry = loadTimetableEntry;
const Attendance_1 = require("../models/Attendance");
const Student_1 = require("../models/Student");
const Timetable_1 = require("../models/Timetable");
const User_1 = require("../models/User");
const businessRuleService_1 = require("./businessRuleService");
const businessRuleService = new businessRuleService_1.BusinessRuleService();
function sessionDurationMinutes(entry) {
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
function resolveMinimumRequiredMinutes(timetableEntry, policy) {
    const sessionDuration = sessionDurationMinutes(timetableEntry);
    if (sessionDuration <= 0) {
        return policy?.minimumSessionDurationMinutes ?? 15;
    }
    const floorMinutes = policy?.minimumSessionDurationMinutes ?? 15;
    const percent = policy?.minimumSessionDurationPercent ?? 50;
    const percentRequired = Math.ceil(sessionDuration * percent / 100);
    return Math.min(sessionDuration, Math.max(floorMinutes, percentRequired));
}
function computeDurationMinutes(checkInAt, checkOutAt) {
    return Math.max(0, Math.floor((checkOutAt.getTime() - checkInAt.getTime()) / 60000));
}
function finalizeAttendanceStatus(durationMinutes, minimumRequiredMinutes) {
    return durationMinutes >= minimumRequiredMinutes ? 'present' : 'absent';
}
function todayStart() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start;
}
function getSessionForTime(date) {
    const hour = date.getHours();
    if (hour < 12)
        return 'morning';
    if (hour < 17)
        return 'afternoon';
    return 'evening';
}
function timetableWindowForToday(entry, now = new Date()) {
    const startsAt = new Date(now);
    const [startHour, startMinute] = String(entry.startTime).split(':').map(Number);
    startsAt.setHours(startHour, startMinute, 0, 0);
    const endsAt = new Date(now);
    const [endHour, endMinute] = String(entry.endTime).split(':').map(Number);
    endsAt.setHours(endHour, endMinute, 0, 0);
    const status = now < startsAt ? 'upcoming' : now >= endsAt ? 'closed' : 'active';
    return { isOpen: status === 'active', status, opensAt: startsAt, closesAt: endsAt, startsAt, endsAt };
}
async function joinClassSession({ student, entry, userId, source, markedBy }) {
    const attendanceDate = todayStart();
    const policy = await businessRuleService.getAttendancePolicy(entry.branchId ?? student.branchId ?? null);
    const minimumRequiredMinutes = resolveMinimumRequiredMinutes(entry, policy);
    const existing = await Attendance_1.Attendance.findOne({
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
            const error = new Error('Attendance session already completed for today.');
            error.status = 409;
            error.messageCode = 'session_completed';
            throw error;
        }
    }
    const now = new Date();
    const payload = {
        timetableId: entry._id,
        attendeeType: 'student',
        userId: userId ?? null,
        studentId: student._id,
        classId: entry.classId?._id ?? entry.classId,
        subjectId: entry.subjectId?._id ?? entry.subjectId ?? student.subjectId ?? null,
        teacherId: entry.teacherId?._id ?? entry.teacherId,
        branchId: entry.branchId ?? student.branchId ?? null,
        policyId: policy?._id ?? null,
        attendanceDate,
        checkInAt: now,
        checkOutAt: null,
        durationMinutes: null,
        minimumRequiredMinutes,
        session: getSessionForTime(now),
        status: 'present',
        source: source ?? 'student_self_checkin',
        markedBy: markedBy ?? null,
        sessionStartTime: entry.startTime,
        sessionEndTime: entry.endTime,
        notes: ''
    };
    if (existing) {
        const updated = await Attendance_1.Attendance.findByIdAndUpdate(existing._id, { $set: payload }, { new: true });
        return { attendance: updated, created: false, reopened: true };
    }
    const attendance = await Attendance_1.Attendance.create(payload);
    return { attendance, created: true, reopened: false };
}
async function leaveClassSession({ student, entry }) {
    const attendanceDate = todayStart();
    const record = await Attendance_1.Attendance.findOne({
        timetableId: entry._id,
        studentId: student._id,
        attendanceDate,
        isDeleted: false
    });
    if (!record?.checkInAt) {
        const error = new Error('No active class session to leave.');
        error.status = 404;
        error.messageCode = 'not_joined';
        throw error;
    }
    if (record.checkOutAt) {
        return { attendance: record, alreadyLeft: true };
    }
    const now = new Date();
    const minimumRequiredMinutes = record.minimumRequiredMinutes
        ?? resolveMinimumRequiredMinutes(entry, await businessRuleService.getAttendancePolicy(entry.branchId ?? student.branchId ?? null));
    const durationMinutes = computeDurationMinutes(record.checkInAt, now);
    const status = finalizeAttendanceStatus(durationMinutes, minimumRequiredMinutes);
    const updated = await Attendance_1.Attendance.findByIdAndUpdate(record._id, {
        $set: {
            checkOutAt: now,
            durationMinutes,
            minimumRequiredMinutes,
            status,
            source: record.source === 'student_self_checkin' ? 'student_self_checkin' : record.source
        }
    }, { new: true });
    return { attendance: updated, alreadyLeft: false, durationMinutes, minimumRequiredMinutes, status };
}
async function finalizeOpenAttendanceForSession(entry, attendanceDate) {
    const window = timetableWindowForToday(entry, new Date());
    if (window.status !== 'closed') {
        return { finalized: 0, createdAbsent: 0 };
    }
    const students = await Student_1.Student.find({
        classId: entry.classId?._id ?? entry.classId,
        ...(entry.subjectId ? { subjectId: entry.subjectId?._id ?? entry.subjectId } : {}),
        isDeleted: false,
        status: { $ne: 'graduated' }
    }).select('_id studentId branchId teacherId').lean();
    const policy = await businessRuleService.getAttendancePolicy(entry.branchId ?? null);
    const minimumRequiredMinutes = resolveMinimumRequiredMinutes(entry, policy);
    const end = new Date(attendanceDate);
    end.setHours(23, 59, 59, 999);
    let finalized = 0;
    let createdAbsent = 0;
    for (const student of students) {
        const existing = await Attendance_1.Attendance.findOne({
            timetableId: entry._id,
            studentId: student._id,
            attendanceDate,
            isDeleted: false
        });
        if (existing?.checkInAt && !existing.checkOutAt) {
            const checkOutAt = window.endsAt;
            const durationMinutes = computeDurationMinutes(existing.checkInAt, checkOutAt);
            const status = finalizeAttendanceStatus(durationMinutes, existing.minimumRequiredMinutes ?? minimumRequiredMinutes);
            await Attendance_1.Attendance.updateOne({ _id: existing._id }, {
                $set: {
                    checkOutAt,
                    durationMinutes,
                    minimumRequiredMinutes: existing.minimumRequiredMinutes ?? minimumRequiredMinutes,
                    status,
                    source: existing.source ?? 'system_auto_closed'
                }
            });
            finalized += 1;
            continue;
        }
        if (existing) {
            continue;
        }
        await Attendance_1.Attendance.create({
            timetableId: entry._id,
            attendeeType: 'student',
            userId: null,
            studentId: student._id,
            classId: entry.classId?._id ?? entry.classId,
            subjectId: entry.subjectId?._id ?? entry.subjectId,
            teacherId: entry.teacherId?._id ?? entry.teacherId,
            branchId: entry.branchId ?? student.branchId ?? null,
            policyId: policy?._id ?? null,
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
async function resolveStudentUserId(student, fallbackUserId) {
    const user = await User_1.User.findOne({ studentId: student.studentId, role: 'student', isDeleted: false }).select('_id').lean();
    return user?._id ?? fallbackUserId ?? null;
}
async function loadTimetableEntry(timetableId) {
    return Timetable_1.Timetable.findOne({ _id: timetableId, isDeleted: false, isActive: true }).lean();
}
