import mongoose from 'mongoose';
import { connectDatabase } from '../database/connect';
import { Attendance } from '../models/Attendance';
import { Enrollment } from '../models/Enrollment';
import { Exam } from '../models/Exam';
import { Payment } from '../models/Payment';
import { Result } from '../models/Result';
import { Student } from '../models/Student';
import { Timetable } from '../models/Timetable';
import { User } from '../models/User';

type RelationPatch = {
  classId?: unknown;
  subjectId?: unknown;
  teacherId?: unknown;
  branchId?: unknown;
  enrollmentId?: unknown;
};

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== '';
}

function safeSet(target: RelationPatch, key: keyof RelationPatch, current: unknown, next: unknown) {
  if (!hasValue(current) && hasValue(next)) target[key] = next;
}

async function latestEnrollment(studentId: unknown) {
  if (!studentId) return null;
  return Enrollment.findOne({ studentId, isDeleted: { $ne: true } })
    .sort({ status: 1, enrolledAt: -1, createdAt: -1 })
    .lean<any>();
}

async function repairStudents() {
  let repaired = 0;
  const students = await Student.find({
    isDeleted: { $ne: true },
    $or: [{ classId: { $exists: false } }, { subjectId: { $exists: false } }, { teacherId: { $exists: false } }, { branchId: { $exists: false } }]
  }).lean<any[]>();

  for (const student of students) {
    const enrollment = await latestEnrollment(student._id);
    if (!enrollment) continue;
    const patch: RelationPatch = {};
    safeSet(patch, 'classId', student.classId, enrollment.classId);
    safeSet(patch, 'subjectId', student.subjectId, enrollment.subjectId);
    safeSet(patch, 'teacherId', student.teacherId, enrollment.teacherId);
    safeSet(patch, 'branchId', student.branchId, enrollment.branchId);
    if (Object.keys(patch).length) {
      await Student.updateOne({ _id: student._id }, { $set: patch });
      repaired += 1;
    }
  }
  return repaired;
}

async function repairPayments() {
  let repaired = 0;
  const payments = await Payment.find({ isDeleted: { $ne: true } }).lean<any[]>();
  for (const payment of payments) {
    const student = payment.studentId ? await Student.findById(payment.studentId).lean<any>() : null;
    const enrollment = payment.enrollmentId ? await Enrollment.findById(payment.enrollmentId).lean<any>() : await latestEnrollment(payment.studentId);
    const patch: RelationPatch = {};
    safeSet(patch, 'enrollmentId', payment.enrollmentId, enrollment?._id);
    safeSet(patch, 'classId', payment.classId, student?.classId ?? enrollment?.classId);
    safeSet(patch, 'subjectId', payment.subjectId, student?.subjectId ?? enrollment?.subjectId);
    safeSet(patch, 'teacherId', payment.teacherId, student?.teacherId ?? enrollment?.teacherId);
    safeSet(patch, 'branchId', payment.branchId, student?.branchId ?? enrollment?.branchId);
    if (Object.keys(patch).length) {
      await Payment.updateOne({ _id: payment._id }, { $set: patch });
      repaired += 1;
    }
  }
  return repaired;
}

async function repairResults() {
  let repaired = 0;
  const results = await Result.find({ isDeleted: { $ne: true } }).lean<any[]>();
  for (const result of results) {
    const [exam, user] = await Promise.all([
      result.exam ? Exam.findById(result.exam).lean<any>() : null,
      result.student ? User.findById(result.student).select('studentId').lean<any>() : null
    ]);
    const student = user?.studentId ? await Student.findOne({ studentId: user.studentId, isDeleted: { $ne: true } }).lean<any>() : null;
    const enrollment = student?._id ? await latestEnrollment(student._id) : null;
    const patch: RelationPatch = {};
    safeSet(patch, 'classId', result.classId, exam?.class ?? student?.classId ?? enrollment?.classId);
    safeSet(patch, 'subjectId', result.subjectId, exam?.subject ?? student?.subjectId ?? enrollment?.subjectId);
    safeSet(patch, 'teacherId', result.teacherId, exam?.teacherId ?? student?.teacherId ?? enrollment?.teacherId);
    if (Object.keys(patch).length) {
      await Result.updateOne({ _id: result._id }, { $set: patch });
      repaired += 1;
    }
  }
  return repaired;
}

async function repairAttendance() {
  let repaired = 0;
  const records = await Attendance.find({ isDeleted: { $ne: true } }).lean<any[]>();
  for (const record of records) {
    const [student, timetable] = await Promise.all([
      record.studentId ? Student.findById(record.studentId).lean<any>() : null,
      record.timetableId ? Timetable.findById(record.timetableId).lean<any>() : null
    ]);
    const enrollment = student?._id ? await latestEnrollment(student._id) : null;
    const patch: RelationPatch = {};
    safeSet(patch, 'classId', record.classId, timetable?.classId ?? student?.classId ?? enrollment?.classId);
    safeSet(patch, 'subjectId', record.subjectId, timetable?.subjectId ?? student?.subjectId ?? enrollment?.subjectId);
    safeSet(patch, 'teacherId', record.teacherId, timetable?.teacherId ?? student?.teacherId ?? enrollment?.teacherId);
    safeSet(patch, 'branchId', record.branchId, timetable?.branchId ?? student?.branchId ?? enrollment?.branchId);
    if (Object.keys(patch).length) {
      await Attendance.updateOne({ _id: record._id }, { $set: patch });
      repaired += 1;
    }
  }
  return repaired;
}

async function main() {
  await connectDatabase();
  const result = {
    students: await repairStudents(),
    payments: await repairPayments(),
    results: await repairResults(),
    attendance: await repairAttendance()
  };
  console.log('Student relation repair completed:', result);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Student relation repair failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});
