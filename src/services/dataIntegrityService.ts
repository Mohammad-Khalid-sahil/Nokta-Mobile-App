import { Exam } from '../models/Exam';
import { Result } from '../models/Result';
import { Attendance } from '../models/Attendance';
import { Subject } from '../models/Subject';
import { ClassModel } from '../models/Class';
import { User } from '../models/User';
import { Student } from '../models/Student';

type CleanupMode = 'dry-run' | 'apply';

interface IntegrityCounters {
  scanned: number;
  repaired: number;
  removed: number;
  invalid: number;
}

interface IntegritySummary {
  mode: CleanupMode;
  softDelete: {
    collectionsScanned: number;
    collectionsUpdated: number;
    repaired: number;
  };
  exams: IntegrityCounters;
  results: IntegrityCounters;
  attendance: IntegrityCounters;
  details: string[];
}

function createCounters(): IntegrityCounters {
  return {
    scanned: 0,
    repaired: 0,
    removed: 0,
    invalid: 0
  };
}

function toId(value: any) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value?.toString === 'function') return value.toString();
  return '';
}

function deriveGrade(score: number, totalMarks: number) {
  const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;
  if (percentage >= 90) return 'A';
  if (percentage >= 80) return 'B';
  if (percentage >= 70) return 'C';
  if (percentage >= 60) return 'D';
  if (percentage >= 40) return 'E';
  return 'F';
}

export class DataIntegrityService {
  async repair(mode: CleanupMode = 'dry-run'): Promise<IntegritySummary> {
    const summary: IntegritySummary = {
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

  private async repairExams(summary: IntegritySummary, mode: CleanupMode) {
    const exams = await Exam.find({}).lean<any[]>();
    summary.exams.scanned = exams.length;

    for (const exam of exams) {
      const examId = toId(exam._id);
      const nextUpdates: Record<string, any> = {};
      let shouldDelete = false;

      const [subject, klass, teacher] = await Promise.all([
        exam.subject ? Subject.findById(exam.subject).lean<any>() : Promise.resolve(null),
        exam.class ? ClassModel.findById(exam.class).lean<any>() : Promise.resolve(null),
        exam.teacherId ? User.findById(exam.teacherId).lean<any>() : Promise.resolve(null)
      ]);

      if (!subject) {
        summary.exams.invalid += 1;
        shouldDelete = true;
        summary.details.push(`Exam ${examId} removed: missing subject`);
      }

      if (!shouldDelete) {
        const subjectClassId = toId(subject.classId);
        if (!klass && subjectClassId) {
          const subjectClass = await ClassModel.findById(subjectClassId).lean<any>();
          if (subjectClass) {
            nextUpdates.class = subjectClass._id;
            summary.details.push(`Exam ${examId} repaired: class restored from subject`);
          } else {
            summary.exams.invalid += 1;
            shouldDelete = true;
            summary.details.push(`Exam ${examId} removed: missing class and no class available from subject`);
          }
        } else if (klass && subjectClassId && toId(klass._id) !== subjectClassId) {
          nextUpdates.class = subjectClassId;
          summary.details.push(`Exam ${examId} repaired: class aligned with subject`);
        }
      }

      if (!shouldDelete) {
        const subjectTeacherId = toId(subject?.teacher);
        if ((!teacher || teacher.role !== 'teacher') && subjectTeacherId) {
          const subjectTeacher = await User.findById(subjectTeacherId).lean<any>();
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
          await Result.deleteMany({ exam: exam._id });
          await Exam.deleteOne({ _id: exam._id });
        }
        summary.exams.removed += 1;
        continue;
      }

      if (Object.keys(nextUpdates).length) {
        if (mode === 'apply') {
          await Exam.updateOne({ _id: exam._id }, { $set: nextUpdates }, { runValidators: true });
        }
        summary.exams.repaired += 1;
      }
    }
  }

  private async repairResults(summary: IntegritySummary, mode: CleanupMode) {
    const results = await Result.find({}).lean<any[]>();
    summary.results.scanned = results.length;

    for (const result of results) {
      const resultId = toId(result._id);
      const nextUpdates: Record<string, any> = {};
      let shouldDelete = false;

      const [student, exam] = await Promise.all([
        result.student ? User.findById(result.student).lean<any>() : Promise.resolve(null),
        result.exam ? Exam.findById(result.exam).lean<any>() : Promise.resolve(null)
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
          await Result.deleteOne({ _id: result._id });
        }
        summary.results.removed += 1;
        continue;
      }

      if (Object.keys(nextUpdates).length) {
        if (mode === 'apply') {
          await Result.updateOne({ _id: result._id }, { $set: nextUpdates }, { runValidators: true });
        }
        summary.results.repaired += 1;
      }
    }
  }

  private async repairAttendance(summary: IntegritySummary, mode: CleanupMode) {
    const attendanceRecords = await Attendance.find({}).lean<any[]>();
    summary.attendance.scanned = attendanceRecords.length;

    for (const record of attendanceRecords) {
      const recordId = toId(record._id);
      const nextUpdates: Record<string, any> = {};
      let shouldDelete = false;

      const student = record.studentId ? await Student.findById(record.studentId).lean<any>() : null;
      if (!student) {
        summary.attendance.invalid += 1;
        shouldDelete = true;
        summary.details.push(`Attendance ${recordId} removed: missing student`);
      }

      const requestedClass = record.classId ? await ClassModel.findById(record.classId).lean<any>() : null;
      if (!shouldDelete) {
        const studentClass = student?.classId ? await ClassModel.findById(student.classId).lean<any>() : null;
        if (!requestedClass && studentClass) {
          nextUpdates.classId = studentClass._id;
          summary.details.push(`Attendance ${recordId} repaired: class restored from student`);
        } else if (!requestedClass && !studentClass) {
          summary.attendance.invalid += 1;
          shouldDelete = true;
          summary.details.push(`Attendance ${recordId} removed: missing class`);
        } else if (studentClass && toId(requestedClass?._id) !== toId(studentClass._id)) {
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
          await Attendance.deleteOne({ _id: record._id });
        }
        summary.attendance.removed += 1;
        continue;
      }

      if (Object.keys(nextUpdates).length) {
        if (mode === 'apply') {
          await Attendance.updateOne({ _id: record._id }, { $set: nextUpdates }, { runValidators: true });
        }
        summary.attendance.repaired += 1;
      }
    }
  }

  private async normalizeSoftDeleteFlags(summary: IntegritySummary, mode: CleanupMode) {
    const db = User.db.db;
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
        await collection.updateMany(
          { isDeleted: { $exists: false } },
          { $set: { isDeleted: false } }
        );
      }

      summary.softDelete.collectionsUpdated += 1;
      summary.softDelete.repaired += missingSoftDeleteFlag;
      summary.details.push(`Collection ${collectionName}: normalized isDeleted on ${missingSoftDeleteFlag} documents`);
    }
  }
}
