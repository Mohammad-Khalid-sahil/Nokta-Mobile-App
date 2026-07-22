"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataIntegrityService = void 0;
const Exam_1 = require("../models/Exam");
const Result_1 = require("../models/Result");
const Attendance_1 = require("../models/Attendance");
const Subject_1 = require("../models/Subject");
const Class_1 = require("../models/Class");
const User_1 = require("../models/User");
const Student_1 = require("../models/Student");
function createCounters() {
    return {
        scanned: 0,
        repaired: 0,
        removed: 0,
        invalid: 0
    };
}
function toId(value) {
    if (!value)
        return '';
    if (typeof value === 'string')
        return value;
    if (typeof value?.toString === 'function')
        return value.toString();
    return '';
}
function deriveGrade(score, totalMarks) {
    const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;
    if (percentage >= 90)
        return 'A';
    if (percentage >= 80)
        return 'B';
    if (percentage >= 70)
        return 'C';
    if (percentage >= 60)
        return 'D';
    if (percentage >= 40)
        return 'E';
    return 'F';
}
class DataIntegrityService {
    async repair(mode = 'dry-run') {
        const summary = {
            mode,
            softDelete: {
                collectionsScanned: 0,
                collectionsUpdated: 0,
                repaired: 0
            },
            exams: createCounters(),
            results: createCounters(),
            attendance: createCounters(),
            details: []
        };
        await this.normalizeSoftDeleteFlags(summary, mode);
        await this.repairExams(summary, mode);
        await this.repairResults(summary, mode);
        await this.repairAttendance(summary, mode);
        return summary;
    }
    async repairExams(summary, mode) {
        const exams = await Exam_1.Exam.find({}).lean();
        summary.exams.scanned = exams.length;
        for (const exam of exams) {
            const examId = toId(exam._id);
            const nextUpdates = {};
            let shouldDelete = false;
            const [subject, klass, teacher] = await Promise.all([
                exam.subject ? Subject_1.Subject.findById(exam.subject).lean() : Promise.resolve(null),
                exam.class ? Class_1.ClassModel.findById(exam.class).lean() : Promise.resolve(null),
                exam.teacherId ? User_1.User.findById(exam.teacherId).lean() : Promise.resolve(null)
            ]);
            if (!subject) {
                summary.exams.invalid += 1;
                shouldDelete = true;
                summary.details.push(`Exam ${examId} removed: missing subject`);
            }
            if (!shouldDelete) {
                const subjectClassId = toId(subject.classId);
                if (!klass && subjectClassId) {
                    const subjectClass = await Class_1.ClassModel.findById(subjectClassId).lean();
                    if (subjectClass) {
                        nextUpdates.class = subjectClass._id;
                        summary.details.push(`Exam ${examId} repaired: class restored from subject`);
                    }
                    else {
                        summary.exams.invalid += 1;
                        shouldDelete = true;
                        summary.details.push(`Exam ${examId} removed: missing class and no class available from subject`);
                    }
                }
                else if (klass && subjectClassId && toId(klass._id) !== subjectClassId) {
                    nextUpdates.class = subjectClassId;
                    summary.details.push(`Exam ${examId} repaired: class aligned with subject`);
                }
            }
            if (!shouldDelete) {
                const subjectTeacherId = toId(subject?.teacher);
                if ((!teacher || teacher.role !== 'teacher') && subjectTeacherId) {
                    const subjectTeacher = await User_1.User.findById(subjectTeacherId).lean();
                    if (subjectTeacher && subjectTeacher.role === 'teacher') {
                        nextUpdates.teacherId = subjectTeacher._id;
                        summary.details.push(`Exam ${examId} repaired: teacher restored from subject`);
                    }
                }
                const effectiveTeacherId = toId(nextUpdates.teacherId ?? exam.teacherId);
                if (!effectiveTeacherId) {
                    summary.exams.invalid += 1;
                    shouldDelete = true;
                    summary.details.push(`Exam ${examId} removed: missing teacher`);
                }
            }
            if (!shouldDelete && !exam.examCode) {
                nextUpdates.examCode = `EXAM-${Date.now().toString().slice(-6)}-${examId.slice(-4)}`;
                summary.details.push(`Exam ${examId} repaired: generated missing examCode`);
            }
            const branchId = toId(exam.branchId);
            if (!shouldDelete && !branchId) {
                const nextBranchId = toId(subject?.branchId) || toId(klass?.branchId) || toId(teacher?.branchId);
                if (nextBranchId) {
                    nextUpdates.branchId = nextBranchId;
                    summary.details.push(`Exam ${examId} repaired: branch restored from related records`);
                }
            }
            if (shouldDelete) {
                if (mode === 'apply') {
                    await Result_1.Result.deleteMany({ exam: exam._id });
                    await Exam_1.Exam.deleteOne({ _id: exam._id });
                }
                summary.exams.removed += 1;
                continue;
            }
            if (Object.keys(nextUpdates).length) {
                if (mode === 'apply') {
                    await Exam_1.Exam.updateOne({ _id: exam._id }, { $set: nextUpdates }, { runValidators: true });
                }
                summary.exams.repaired += 1;
            }
        }
    }
    async repairResults(summary, mode) {
        const results = await Result_1.Result.find({}).lean();
        summary.results.scanned = results.length;
        for (const result of results) {
            const resultId = toId(result._id);
            const nextUpdates = {};
            let shouldDelete = false;
            const [student, exam] = await Promise.all([
                result.student ? User_1.User.findById(result.student).lean() : Promise.resolve(null),
                result.exam ? Exam_1.Exam.findById(result.exam).lean() : Promise.resolve(null)
            ]);
            if (!student || student.role !== 'student') {
                summary.results.invalid += 1;
                shouldDelete = true;
                summary.details.push(`Result ${resultId} removed: missing student`);
            }
            if (!exam) {
                summary.results.invalid += 1;
                shouldDelete = true;
                summary.details.push(`Result ${resultId} removed: missing exam`);
            }
            if (!shouldDelete) {
                const expectedGrade = deriveGrade(Number(result.score || 0), Number(exam.totalMarks || 100));
                if (result.grade !== expectedGrade) {
                    nextUpdates.grade = expectedGrade;
                    summary.details.push(`Result ${resultId} repaired: grade recalculated`);
                }
                if (!result.gradedBy && exam.teacherId) {
                    nextUpdates.gradedBy = exam.teacherId;
                    summary.details.push(`Result ${resultId} repaired: gradedBy restored from exam teacher`);
                }
                const studentClassId = toId(student.classId);
                const studentSubjectId = toId(student.subjectId);
                if ((studentClassId && toId(exam.class) !== studentClassId) || (studentSubjectId && toId(exam.subject) !== studentSubjectId)) {
                    summary.results.invalid += 1;
                    shouldDelete = true;
                    summary.details.push(`Result ${resultId} removed: student assignment does not match exam relation`);
                }
            }
            if (shouldDelete) {
                if (mode === 'apply') {
                    await Result_1.Result.deleteOne({ _id: result._id });
                }
                summary.results.removed += 1;
                continue;
            }
            if (Object.keys(nextUpdates).length) {
                if (mode === 'apply') {
                    await Result_1.Result.updateOne({ _id: result._id }, { $set: nextUpdates }, { runValidators: true });
                }
                summary.results.repaired += 1;
            }
        }
    }
    async repairAttendance(summary, mode) {
        const attendanceRecords = await Attendance_1.Attendance.find({}).lean();
        summary.attendance.scanned = attendanceRecords.length;
        for (const record of attendanceRecords) {
            const recordId = toId(record._id);
            const nextUpdates = {};
            let shouldDelete = false;
            const student = record.studentId ? await Student_1.Student.findById(record.studentId).lean() : null;
            if (!student) {
                summary.attendance.invalid += 1;
                shouldDelete = true;
                summary.details.push(`Attendance ${recordId} removed: missing student`);
            }
            const requestedClass = record.classId ? await Class_1.ClassModel.findById(record.classId).lean() : null;
            if (!shouldDelete) {
                const studentClass = student?.classId ? await Class_1.ClassModel.findById(student.classId).lean() : null;
                if (!requestedClass && studentClass) {
                    nextUpdates.classId = studentClass._id;
                    summary.details.push(`Attendance ${recordId} repaired: class restored from student`);
                }
                else if (!requestedClass && !studentClass) {
                    summary.attendance.invalid += 1;
                    shouldDelete = true;
                    summary.details.push(`Attendance ${recordId} removed: missing class`);
                }
                else if (studentClass && toId(requestedClass?._id) !== toId(studentClass._id)) {
                    nextUpdates.classId = studentClass._id;
                    summary.details.push(`Attendance ${recordId} repaired: class aligned with student`);
                }
                if (!record.teacherId && student?.teacherId) {
                    nextUpdates.teacherId = student.teacherId;
                    summary.details.push(`Attendance ${recordId} repaired: teacher restored from student`);
                }
                if (!record.branchId && student?.branchId) {
                    nextUpdates.branchId = student.branchId;
                    summary.details.push(`Attendance ${recordId} repaired: branch restored from student`);
                }
            }
            if (shouldDelete) {
                if (mode === 'apply') {
                    await Attendance_1.Attendance.deleteOne({ _id: record._id });
                }
                summary.attendance.removed += 1;
                continue;
            }
            if (Object.keys(nextUpdates).length) {
                if (mode === 'apply') {
                    await Attendance_1.Attendance.updateOne({ _id: record._id }, { $set: nextUpdates }, { runValidators: true });
                }
                summary.attendance.repaired += 1;
            }
        }
    }
    async normalizeSoftDeleteFlags(summary, mode) {
        const db = User_1.User.db.db;
        if (!db) {
            return;
        }
        const collections = await db.listCollections({}, { nameOnly: true }).toArray();
        summary.softDelete.collectionsScanned = collections.length;
        for (const collectionInfo of collections) {
            const collectionName = collectionInfo.name;
            const collection = db.collection(collectionName);
            const missingSoftDeleteFlag = await collection.countDocuments({ isDeleted: { $exists: false } });
            if (!missingSoftDeleteFlag) {
                continue;
            }
            if (mode === 'apply') {
                await collection.updateMany({ isDeleted: { $exists: false } }, { $set: { isDeleted: false } });
            }
            summary.softDelete.collectionsUpdated += 1;
            summary.softDelete.repaired += missingSoftDeleteFlag;
            summary.details.push(`Collection ${collectionName}: normalized isDeleted on ${missingSoftDeleteFlag} documents`);
        }
    }
}
exports.DataIntegrityService = DataIntegrityService;
