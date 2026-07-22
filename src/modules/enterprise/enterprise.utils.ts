import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import jalaliday from 'jalaliday';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import archiver from 'archiver';
import { v4 as uuidv4 } from 'uuid';
import type { Response } from 'express';
import { ClassModel } from '../../models/Class';
import { Curriculum } from '../../models/Curriculum';
import { Subject } from '../../models/Subject';
import { Timetable } from '../../models/Timetable';
import { Attendance } from '../../models/Attendance';
import { Student } from '../../models/Student';
import { User } from '../../models/User';
import { hasPermission } from '../../utils/roleHelpers';
import type { PermissionKey } from '../../config/systemMasterRules';
import {
  EnterpriseAssignment,
  EnterpriseBackup,
  EnterpriseCertificate,
  EnterpriseOnlineExam,
  EnterpriseSecurityEvent,
  EnterpriseTranscript
} from './enterprise.models';

dayjs.extend(jalaliday);

export function formatJalaliDate(value: Date | string = new Date()) {
  return dayjs(value).calendar('jalali').locale('fa').format('YYYY/MM/DD');
}

function timeToMinutes(value: string) {
  const [hours, minutes] = String(value).split(':').map(Number);
  return hours * 60 + minutes;
}

export function hasTimeConflict(startA: string, endA: string, startB: string, endB: string) {
  return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(startB) < timeToMinutes(endA);
}

export function calculateDurationMinutes(startTime: string, endTime: string) {
  return timeToMinutes(endTime) - timeToMinutes(startTime);
}

export function assertEnterprisePermission(user: any, permission: PermissionKey) {
  if (!hasPermission(user, permission)) {
    throw Object.assign(new Error('Permission denied'), { statusCode: 403 });
  }
}

export async function assertClassSubjectDependency(classId: string, subjectId: string) {
  const [klass, subject] = await Promise.all([
    ClassModel.findOne({ _id: classId, isDeleted: false }).lean<any>(),
    Subject.findOne({ _id: subjectId, isDeleted: false, activeStatus: true }).lean<any>()
  ]);
  if (!klass) throw new Error('Selected class is invalid.');
  if (!subject) throw new Error('Selected subject is invalid.');

  const subjectClassIds = new Set([
    subject.classId ? String(subject.classId) : '',
    ...(Array.isArray(subject.classIds) ? subject.classIds.map((id: any) => String(id)) : [])
  ].filter(Boolean));
  const classSubjectIds = new Set((klass.assignedSubjects ?? []).map((id: any) => String(id)));
  if (!subjectClassIds.has(String(klass._id)) && !classSubjectIds.has(String(subject._id))) {
    throw new Error('This subject is not assigned to this class.');
  }

  const curriculumCount = await Curriculum.countDocuments({ classId: klass._id, isDeleted: false, active: true });
  if (curriculumCount > 0) {
    const match = await Curriculum.exists({ classId: klass._id, subjectId: subject._id, isDeleted: false, active: true });
    if (!match) throw new Error('Subject is not included in the selected class curriculum.');
  }

  return { klass, subject };
}

export async function validateTimetableEntry(payload: {
  classId: string;
  subjectId: string;
  teacherId: string;
  room: string;
  branchId?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  excludeId?: string;
}) {
  await assertClassSubjectDependency(payload.classId, payload.subjectId);
  const durationMinutes = calculateDurationMinutes(payload.startTime, payload.endTime);
  if (durationMinutes <= 0) throw new Error('End time must be after start time.');

  const filter: any = { isDeleted: false, isActive: true, dayOfWeek: payload.dayOfWeek };
  if (payload.branchId) filter.branchId = payload.branchId;
  if (payload.excludeId) filter._id = { $ne: payload.excludeId };
  const entries = await Timetable.find(filter).lean<any[]>();

  for (const entry of entries) {
    if (!hasTimeConflict(payload.startTime, payload.endTime, entry.startTime, entry.endTime)) continue;
    if (String(entry.teacherId) === String(payload.teacherId)) throw new Error('This teacher already has a class scheduled during this time.');
    if (entry.room && payload.room && String(entry.room).toLowerCase() === String(payload.room).toLowerCase()) throw new Error(`Room ${payload.room} is already booked from ${entry.startTime} to ${entry.endTime}`);
    if (String(entry.classId) === String(payload.classId)) throw new Error('This class already has another subject scheduled during this time.');
  }

  return { durationMinutes };
}

export function calculateGradePoints(grade: number) {
  if (grade >= 90) return 4;
  if (grade >= 80) return 3;
  if (grade >= 70) return 2;
  if (grade >= 60) return 1;
  return 0;
}

export function calculateGpa(subjects: Array<{ grade: number; credits: number }>) {
  const totalCredits = subjects.reduce((sum, item) => sum + Number(item.credits || 0), 0);
  const weighted = subjects.reduce((sum, item) => sum + calculateGradePoints(Number(item.grade)) * Number(item.credits || 0), 0);
  return { totalCredits, gpa: totalCredits > 0 ? Number((weighted / totalCredits).toFixed(2)) : 0 };
}

export async function streamCertificatePdf(res: Response, payload: { title: string; studentName: string; verificationCode: string; type: string }) {
  const doc = new PDFDocument({ size: 'A4', margin: 56 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${payload.verificationCode}.pdf"`);
  doc.pipe(res);
  doc.fontSize(24).text('Nokta Academy Certificate', { align: 'center' });
  doc.moveDown();
  doc.fontSize(18).text(payload.title, { align: 'center' });
  doc.moveDown();
  doc.fontSize(14).text(`Awarded to: ${payload.studentName}`, { align: 'center' });
  doc.moveDown();
  doc.text(`Type: ${payload.type}`, { align: 'center' });
  doc.text(`Issued: ${formatJalaliDate()}`, { align: 'center' });
  const qr = await QRCode.toDataURL(payload.verificationCode);
  doc.image(Buffer.from(qr.split(',')[1], 'base64'), 240, 470, { width: 120 });
  doc.fontSize(10).text(`Verification: ${payload.verificationCode}`, 56, 620, { align: 'center' });
  doc.end();
}

export function createVerificationCode(prefix: string) {
  return `${prefix}-${uuidv4()}`;
}

function readinessScore(completed: number, total: number) {
  if (total <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
}

function readinessStatus(score: number) {
  if (score >= 95) return 'global_ready';
  if (score >= 80) return 'strong';
  if (score >= 60) return 'needs_work';
  return 'critical';
}

function branchFilter(user: any) {
  const role = user?.canonicalRole ?? user?.role;
  const branchId = user?.branchId;
  if (!branchId || ['super_admin', 'owner'].includes(role)) return {};
  return { branchId };
}

export async function calculateEnterpriseReadiness(user: any) {
  const scoped = branchFilter(user);
  const [
    studentTotal,
    studentsMissingClass,
    teacherTotal,
    teachersUnassigned,
    classTotal,
    classesWithoutSubjects,
    classesWithoutSchedule,
    subjectTotal,
    subjectsUnassigned,
    timetableEntries,
    attendanceTotal,
    transcriptTotal,
    examTotal,
    assignmentTotal,
    certificateTotal,
    backupTotal,
    recentSuspiciousEvents
  ] = await Promise.all([
    Student.countDocuments({ isDeleted: false, ...scoped }),
    Student.countDocuments({ isDeleted: false, ...scoped, $or: [{ classId: null }, { classId: { $exists: false } }] }),
    User.countDocuments({ role: 'teacher', isDeleted: false, ...scoped }),
    User.countDocuments({ role: 'teacher', isDeleted: false, ...scoped, $or: [{ assignedClasses: { $size: 0 } }, { assignedClasses: { $exists: false } }, { assignedSubjects: { $size: 0 } }, { assignedSubjects: { $exists: false } }] }),
    ClassModel.countDocuments({ isDeleted: false, ...scoped }),
    ClassModel.countDocuments({ isDeleted: false, ...scoped, $or: [{ assignedSubjects: { $size: 0 } }, { assignedSubjects: { $exists: false } }] }),
    ClassModel.countDocuments({ isDeleted: false, ...scoped, $or: [{ weeklySchedule: { $size: 0 } }, { weeklySchedule: { $exists: false } }] }),
    Subject.countDocuments({ isDeleted: false, activeStatus: true, ...scoped }),
    Subject.countDocuments({ isDeleted: false, activeStatus: true, ...scoped, $or: [{ classId: null }, { classId: { $exists: false } }, { classIds: { $size: 0 } }, { classIds: { $exists: false } }] }),
    Timetable.find({ isDeleted: false, isActive: true, ...scoped }).select('classId teacherId room branchId dayOfWeek startTime endTime').lean<any[]>(),
    Attendance.countDocuments({ isDeleted: false, ...scoped }),
    EnterpriseTranscript.countDocuments({ isDeleted: false, ...scoped }),
    EnterpriseOnlineExam.countDocuments({ isDeleted: false, ...scoped }),
    EnterpriseAssignment.countDocuments({ isDeleted: false, ...scoped }),
    EnterpriseCertificate.countDocuments({ isDeleted: false, ...scoped }),
    EnterpriseBackup.countDocuments({ isDeleted: false }),
    EnterpriseSecurityEvent.countDocuments({ isDeleted: false, type: 'suspicious', createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } })
  ]);

  const timetableConflicts: Array<{ type: string; sourceId: string; targetId: string; message: string }> = [];
  for (let i = 0; i < timetableEntries.length; i += 1) {
    for (let j = i + 1; j < timetableEntries.length; j += 1) {
      const a = timetableEntries[i];
      const b = timetableEntries[j];
      if (String(a.branchId ?? '') !== String(b.branchId ?? '') || a.dayOfWeek !== b.dayOfWeek || !hasTimeConflict(a.startTime, a.endTime, b.startTime, b.endTime)) {
        continue;
      }
      if (String(a.teacherId) === String(b.teacherId)) timetableConflicts.push({ type: 'teacher', sourceId: String(a._id), targetId: String(b._id), message: 'Teacher has overlapping timetable entries.' });
      if (a.room && b.room && String(a.room).toLowerCase() === String(b.room).toLowerCase()) timetableConflicts.push({ type: 'room', sourceId: String(a._id), targetId: String(b._id), message: `Room ${a.room} has overlapping timetable entries.` });
      if (String(a.classId) === String(b.classId)) timetableConflicts.push({ type: 'class', sourceId: String(a._id), targetId: String(b._id), message: 'Class has overlapping timetable entries.' });
    }
  }

  const domains = [
    {
      key: 'academic_records',
      score: readinessScore(studentTotal - studentsMissingClass, studentTotal || 1),
      completed: studentTotal - studentsMissingClass,
      total: studentTotal,
      issues: studentsMissingClass,
      recommendations: ['Assign every active student to a class.', 'Keep student academic ownership branch-scoped.']
    },
    {
      key: 'teacher_allocation',
      score: readinessScore(teacherTotal - teachersUnassigned, teacherTotal || 1),
      completed: teacherTotal - teachersUnassigned,
      total: teacherTotal,
      issues: teachersUnassigned,
      recommendations: ['Assign each teacher to at least one class and subject.', 'Review teacher workload weekly.']
    },
    {
      key: 'curriculum_mapping',
      score: readinessScore((classTotal - classesWithoutSubjects) + (subjectTotal - subjectsUnassigned), (classTotal + subjectTotal) || 1),
      completed: (classTotal - classesWithoutSubjects) + (subjectTotal - subjectsUnassigned),
      total: classTotal + subjectTotal,
      issues: classesWithoutSubjects + subjectsUnassigned,
      recommendations: ['Link every class to its allowed subjects.', 'Keep curriculum mappings active before timetable creation.']
    },
    {
      key: 'timetable_integrity',
      score: readinessScore(Math.max(0, timetableEntries.length - timetableConflicts.length - classesWithoutSchedule), Math.max(1, timetableEntries.length + classesWithoutSchedule)),
      completed: Math.max(0, timetableEntries.length - timetableConflicts.length - classesWithoutSchedule),
      total: timetableEntries.length + classesWithoutSchedule,
      issues: timetableConflicts.length + classesWithoutSchedule,
      recommendations: ['Resolve all room, teacher and class overlaps.', 'Create weekly schedules for every active class.']
    },
    {
      key: 'lms_depth',
      score: readinessScore(Number(transcriptTotal > 0) + Number(examTotal > 0) + Number(assignmentTotal > 0) + Number(certificateTotal > 0), 4),
      completed: Number(transcriptTotal > 0) + Number(examTotal > 0) + Number(assignmentTotal > 0) + Number(certificateTotal > 0),
      total: 4,
      issues: [transcriptTotal, examTotal, assignmentTotal, certificateTotal].filter((item) => item === 0).length,
      recommendations: ['Use transcripts, online exams, assignments and certificates in live workflows.', 'Export official academic records with QR verification.']
    },
    {
      key: 'operations_security',
      score: readinessScore(Number(attendanceTotal > 0) + Number(backupTotal > 0) + Number(recentSuspiciousEvents === 0), 3),
      completed: Number(attendanceTotal > 0) + Number(backupTotal > 0) + Number(recentSuspiciousEvents === 0),
      total: 3,
      issues: Number(attendanceTotal === 0) + Number(backupTotal === 0) + Number(recentSuspiciousEvents > 0),
      recommendations: ['Run scheduled backups and test restore plans.', 'Review suspicious security events daily.', 'Keep attendance time-lock active.']
    }
  ].map((domain) => ({ ...domain, status: readinessStatus(domain.score) }));

  const overallScore = readinessScore(domains.reduce((sum, item) => sum + item.score, 0), domains.length * 100);
  return {
    overallScore,
    status: readinessStatus(overallScore),
    jalaliDate: formatJalaliDate(),
    domains,
    counts: {
      studentTotal,
      teacherTotal,
      classTotal,
      subjectTotal,
      timetableTotal: timetableEntries.length,
      attendanceTotal,
      transcriptTotal,
      examTotal,
      assignmentTotal,
      certificateTotal,
      backupTotal,
      recentSuspiciousEvents
    },
    conflicts: timetableConflicts.slice(0, 50)
  };
}

export async function createZipBackup(sourceDir: string, targetDir: string) {
  fs.mkdirSync(targetDir, { recursive: true });
  const fileName = `nokta-backup-${Date.now()}.zip`;
  const filePath = path.join(targetDir, fileName);
  const output = fs.createWriteStream(filePath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(output);
  if (fs.existsSync(sourceDir)) archive.directory(sourceDir, false);
  await archive.finalize();
  await new Promise<void>((resolve, reject) => {
    output.on('close', () => resolve());
    archive.on('error', reject);
  });
  return { fileName, filePath, sizeBytes: fs.statSync(filePath).size };
}
