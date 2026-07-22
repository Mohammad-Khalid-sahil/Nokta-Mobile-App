import { Enrollment } from '../models/Enrollment';
import { Family } from '../models/Family';
import { ParentProfile } from '../models/Parent';

function idOf(value: any) {
  return value?._id ? String(value._id) : value ? String(value) : '';
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value !== null && value !== undefined && typeof value !== 'object') return String(value);
  }
  return '';
}

function fullName(student: any) {
  return firstText(student?.fullName, student?.name, [student?.firstName, student?.lastName].filter(Boolean).join(' '));
}

function relationName(value: any, keys: string[]) {
  if (!value || typeof value !== 'object') return '';
  for (const key of keys) {
    const text = firstText(value[key]);
    if (text) return text;
  }
  return '';
}

export const studentPopulatePaths = [
  { path: 'classId', select: 'className name title classCode code' },
  { path: 'subjectId', select: 'title name code' },
  { path: 'teacherId', select: 'name firstName lastName teacherCode phone whatsapp email' },
  { path: 'branchId', select: 'name code city' },
  { path: 'familyId', select: 'guardianName guardianPhone guardianEmail' },
  { path: 'parentProfileId', select: 'guardianName guardianPhone guardianEmail relationType' }
];

export async function enrichStudentsWithDisplay<T extends any>(students: T[]): Promise<T[]> {
  const list = students.map((student: any) => ({ ...student }));
  const studentIds = list.map((student: any) => idOf(student?._id)).filter(Boolean);
  const familyIds = list.map((student: any) => idOf(student?.familyId)).filter(Boolean);
  const parentIds = list.map((student: any) => idOf(student?.parentProfileId)).filter(Boolean);

  const [enrollments, families, parents] = await Promise.all([
    studentIds.length
      ? Enrollment.find({ studentId: { $in: studentIds }, isDeleted: { $ne: true } })
        .populate('classId', 'className name title classCode code')
        .populate('subjectId', 'title name code')
        .populate('teacherId', 'name firstName lastName teacherCode phone whatsapp email')
        .populate('branchId', 'name code city')
        .sort({ status: 1, enrolledAt: -1, createdAt: -1 })
        .lean<any[]>()
      : [],
    familyIds.length ? Family.find({ _id: { $in: familyIds } }).select('guardianName guardianPhone guardianEmail').lean<any[]>() : [],
    parentIds.length ? ParentProfile.find({ _id: { $in: parentIds } }).select('guardianName guardianPhone guardianEmail relationType').lean<any[]>() : []
  ]);

  const enrollmentMap = new Map<string, any>();
  enrollments.forEach((enrollment) => {
    const key = idOf(enrollment.studentId);
    const existing = enrollmentMap.get(key);
    if (!existing || enrollment.status === 'active') enrollmentMap.set(key, enrollment);
  });
  const familyMap = new Map(families.map((family) => [idOf(family._id), family]));
  const parentMap = new Map(parents.map((parent) => [idOf(parent._id), parent]));

  return list.map((student: any) => {
    const enrollment = enrollmentMap.get(idOf(student._id));
    const family = typeof student.familyId === 'object' ? student.familyId : familyMap.get(idOf(student.familyId));
    const parent = typeof student.parentProfileId === 'object' ? student.parentProfileId : parentMap.get(idOf(student.parentProfileId));
    const classRef = student.classId?._id ? student.classId : enrollment?.classId;
    const subjectRef = student.subjectId?._id ? student.subjectId : enrollment?.subjectId;
    const teacherRef = student.teacherId?._id ? student.teacherId : enrollment?.teacherId;
    const branchRef = student.branchId?._id ? student.branchId : enrollment?.branchId;
    const display = {
      studentNumber: firstText(student.rollNo, student.studentId),
      fullName: fullName(student),
      className: firstText(student.className, relationName(classRef, ['className', 'name', 'title'])),
      subjectName: firstText(student.subjectName, relationName(subjectRef, ['title', 'name'])),
      teacherName: firstText(student.teacherName, relationName(teacherRef, ['name']), [teacherRef?.firstName, teacherRef?.lastName].filter(Boolean).join(' ')),
      guardianPhone: firstText(student.guardianPhone, student.familyPhone, parent?.guardianPhone, family?.guardianPhone),
      guardianName: firstText(student.guardianName, parent?.guardianName, family?.guardianName, student.fatherName),
      studentPhone: firstText(student.phone, student.whatsapp, student.familyPhone),
      branchName: firstText(student.branchName, relationName(branchRef, ['name', 'code', 'city'])),
      enrollmentStatus: firstText(student.enrollmentStatus, enrollment?.status, student.status, student.accountStatus)
    };

    return {
      ...student,
      classId: student.classId?._id ?? enrollment?.classId?._id ?? student.classId ?? enrollment?.classId ?? null,
      subjectId: student.subjectId?._id ?? enrollment?.subjectId?._id ?? student.subjectId ?? enrollment?.subjectId ?? null,
      teacherId: student.teacherId?._id ?? enrollment?.teacherId?._id ?? student.teacherId ?? enrollment?.teacherId ?? null,
      branchId: student.branchId?._id ?? enrollment?.branchId?._id ?? student.branchId ?? enrollment?.branchId ?? null,
      latestEnrollment: enrollment ?? null,
      studentDisplay: display,
      studentNumber: display.studentNumber,
      fullName: display.fullName,
      className: display.className,
      subjectName: display.subjectName,
      teacherName: display.teacherName,
      guardianPhone: display.guardianPhone,
      guardianName: display.guardianName,
      studentPhone: display.studentPhone,
      branchName: display.branchName,
      enrollmentStatus: display.enrollmentStatus
    };
  }) as T[];
}

export async function enrichStudentWithDisplay<T extends any>(student: T | null): Promise<T | null> {
  if (!student) return null;
  const [item] = await enrichStudentsWithDisplay([student]);
  return item;
}
