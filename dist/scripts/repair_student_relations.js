"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const connect_1 = require("../database/connect");
const Attendance_1 = require("../models/Attendance");
const Enrollment_1 = require("../models/Enrollment");
const Exam_1 = require("../models/Exam");
const Payment_1 = require("../models/Payment");
const Result_1 = require("../models/Result");
const Student_1 = require("../models/Student");
const Timetable_1 = require("../models/Timetable");
const User_1 = require("../models/User");
function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}
function safeSet(target, key, current, next) {
    if (!hasValue(current) && hasValue(next))
        target[key] = next;
}
async function latestEnrollment(studentId) {
    if (!studentId)
        return null;
    return Enrollment_1.Enrollment.findOne({ studentId, isDeleted: { $ne: true } })
        .sort({ status: 1, enrolledAt: -1, createdAt: -1 })
        .lean();
}
async function repairStudents() {
    let repaired = 0;
    const students = await Student_1.Student.find({
        isDeleted: { $ne: true },
        $or: [{ classId: { $exists: false } }, { subjectId: { $exists: false } }, { teacherId: { $exists: false } }, { branchId: { $exists: false } }]
    }).lean();
    for (const student of students) {
        const enrollment = await latestEnrollment(student._id);
        if (!enrollment)
            continue;
        const patch = {};
        safeSet(patch, 'classId', student.classId, enrollment.classId);
        safeSet(patch, 'subjectId', student.subjectId, enrollment.subjectId);
        safeSet(patch, 'teacherId', student.teacherId, enrollment.teacherId);
        safeSet(patch, 'branchId', student.branchId, enrollment.branchId);
        if (Object.keys(patch).length) {
            await Student_1.Student.updateOne({ _id: student._id }, { $set: patch });
            repaired += 1;
        }
    }
    return repaired;
}
async function repairPayments() {
    let repaired = 0;
    const payments = await Payment_1.Payment.find({ isDeleted: { $ne: true } }).lean();
    for (const payment of payments) {
        const student = payment.studentId ? await Student_1.Student.findById(payment.studentId).lean() : null;
        const enrollment = payment.enrollmentId ? await Enrollment_1.Enrollment.findById(payment.enrollmentId).lean() : await latestEnrollment(payment.studentId);
        const patch = {};
        safeSet(patch, 'enrollmentId', payment.enrollmentId, enrollment?._id);
        safeSet(patch, 'classId', payment.classId, student?.classId ?? enrollment?.classId);
        safeSet(patch, 'subjectId', payment.subjectId, student?.subjectId ?? enrollment?.subjectId);
        safeSet(patch, 'teacherId', payment.teacherId, student?.teacherId ?? enrollment?.teacherId);
        safeSet(patch, 'branchId', payment.branchId, student?.branchId ?? enrollment?.branchId);
        if (Object.keys(patch).length) {
            await Payment_1.Payment.updateOne({ _id: payment._id }, { $set: patch });
            repaired += 1;
        }
    }
    return repaired;
}
async function repairResults() {
    let repaired = 0;
    const results = await Result_1.Result.find({ isDeleted: { $ne: true } }).lean();
    for (const result of results) {
        const [exam, user] = await Promise.all([
            result.exam ? Exam_1.Exam.findById(result.exam).lean() : null,
            result.student ? User_1.User.findById(result.student).select('studentId').lean() : null
        ]);
        const student = user?.studentId ? await Student_1.Student.findOne({ studentId: user.studentId, isDeleted: { $ne: true } }).lean() : null;
        const enrollment = student?._id ? await latestEnrollment(student._id) : null;
        const patch = {};
        safeSet(patch, 'classId', result.classId, exam?.class ?? student?.classId ?? enrollment?.classId);
        safeSet(patch, 'subjectId', result.subjectId, exam?.subject ?? student?.subjectId ?? enrollment?.subjectId);
        safeSet(patch, 'teacherId', result.teacherId, exam?.teacherId ?? student?.teacherId ?? enrollment?.teacherId);
        if (Object.keys(patch).length) {
            await Result_1.Result.updateOne({ _id: result._id }, { $set: patch });
            repaired += 1;
        }
    }
    return repaired;
}
async function repairAttendance() {
    let repaired = 0;
    const records = await Attendance_1.Attendance.find({ isDeleted: { $ne: true } }).lean();
    for (const record of records) {
        const [student, timetable] = await Promise.all([
            record.studentId ? Student_1.Student.findById(record.studentId).lean() : null,
            record.timetableId ? Timetable_1.Timetable.findById(record.timetableId).lean() : null
        ]);
        const enrollment = student?._id ? await latestEnrollment(student._id) : null;
        const patch = {};
        safeSet(patch, 'classId', record.classId, timetable?.classId ?? student?.classId ?? enrollment?.classId);
        safeSet(patch, 'subjectId', record.subjectId, timetable?.subjectId ?? student?.subjectId ?? enrollment?.subjectId);
        safeSet(patch, 'teacherId', record.teacherId, timetable?.teacherId ?? student?.teacherId ?? enrollment?.teacherId);
        safeSet(patch, 'branchId', record.branchId, timetable?.branchId ?? student?.branchId ?? enrollment?.branchId);
        if (Object.keys(patch).length) {
            await Attendance_1.Attendance.updateOne({ _id: record._id }, { $set: patch });
            repaired += 1;
        }
    }
    return repaired;
}
async function main() {
    await (0, connect_1.connectDatabase)();
    const result = {
        students: await repairStudents(),
        payments: await repairPayments(),
        results: await repairResults(),
        attendance: await repairAttendance()
    };
    console.log('Student relation repair completed:', result);
    await mongoose_1.default.disconnect();
}
main().catch(async (error) => {
    console.error('Student relation repair failed:', error);
    await mongoose_1.default.disconnect();
    process.exit(1);
});
