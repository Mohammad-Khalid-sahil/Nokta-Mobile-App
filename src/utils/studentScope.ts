import type { Request } from 'express';
import { Student } from '../models/Student';
import { User } from '../models/User';

export async function resolveStudentRecordForUser(userId: string | undefined | null) {
  if (!userId) return null;

  const user = await User.findById(userId)
    .select('role studentId classId subjectId assignedTeacherId branchId familyId name email phone')
    .lean<Record<string, any>>();

  if (!user || user.role !== 'student') return null;

  let student = user.studentId
    ? await Student.findOne({ studentId: user.studentId, isDeleted: false })
        .populate('classId', 'className name classCode feeAmount')
        .populate('subjectId', 'title code feeAmount')
        .populate('teacherId', 'name email phone whatsapp')
        .lean<Record<string, any>>()
    : null;

  if (!student) {
    student = await Student.findOne({ _id: userId, isDeleted: false })
      .populate('classId', 'className name classCode feeAmount')
      .populate('subjectId', 'title code feeAmount')
      .populate('teacherId', 'name email phone whatsapp')
      .lean<Record<string, any>>();
  }

  return { user, student };
}

export async function resolveStudentContext(req: Request) {
  const resolved = await resolveStudentRecordForUser(req.user?.userId);
  if (!resolved?.student && !resolved?.user) {
    return null;
  }

  const { user, student } = resolved;
  const classId = student?.classId?._id ?? student?.classId ?? user.classId ?? null;
  const subjectId = student?.subjectId?._id ?? student?.subjectId ?? user.subjectId ?? null;
  const teacherId = student?.teacherId?._id ?? student?.teacherId ?? user.assignedTeacherId ?? null;
  const studentDocId = student?._id ?? null;

  return {
    user,
    student,
    studentDocId,
    classId,
    subjectId,
    teacherId,
    branchId: student?.branchId ?? user.branchId ?? req.user?.branchId ?? null
  };
}
