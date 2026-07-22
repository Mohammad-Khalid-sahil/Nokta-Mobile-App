import path from 'path';
import { Router } from 'express';
import Joi from 'joi';
import multer from 'multer';
import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { authenticate } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { createError, createResponse } from '../../helpers/response';
import { config } from '../../config/env';
import { Attendance } from '../../models/Attendance';
import { Result } from '../../models/Result';
import { Payment } from '../../models/Payment';
import { Student } from '../../models/Student';
import {
  EnterpriseAssignment,
  EnterpriseAssignmentSubmission,
  EnterpriseBackup,
  EnterpriseCertificate,
  EnterpriseExamAttempt,
  EnterpriseOnlineExam,
  EnterpriseSecurityEvent,
  EnterpriseTranscript
} from './enterprise.models';
import {
  assertClassSubjectDependency,
  assertEnterprisePermission,
  calculateEnterpriseReadiness,
  calculateGpa,
  createVerificationCode,
  createZipBackup,
  formatJalaliDate,
  streamCertificatePdf,
  validateTimetableEntry
} from './enterprise.utils';
import { Timetable } from '../../models/Timetable';

export const enterpriseRouter = Router();
const upload = multer({ dest: path.join(process.cwd(), 'uploads', 'enterprise') });
const enterpriseCronTasks: ScheduledTask[] = [];

const objectId = Joi.string().hex().length(24);
const timetableSchema = Joi.object({ body: Joi.object({
  classId: objectId.required(),
  subjectId: objectId.required(),
  teacherId: objectId.required(),
  room: Joi.string().trim().required(),
  branchId: objectId.allow('', null).optional(),
  dayOfWeek: Joi.number().integer().min(0).max(6).required(),
  startTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
  endTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
  academicYear: Joi.string().allow('', null).optional(),
  semester: Joi.string().allow('', null).optional(),
  isActive: Joi.boolean().optional()
}) });
const transcriptSchema = Joi.object({ body: Joi.object({
  studentId: objectId.required(),
  branchId: objectId.allow('', null).optional(),
  semester: Joi.string().required(),
  academicYear: Joi.string().allow('', null).optional(),
  subjects: Joi.array().items(Joi.object({ subjectId: objectId.required(), subjectName: Joi.string().allow('', null), grade: Joi.number().min(0).max(100).required(), credits: Joi.number().min(0).required() })).min(1).required()
}) });
const onlineExamSchema = Joi.object({ body: Joi.object({
  classId: objectId.required(),
  subjectId: objectId.required(),
  teacherId: objectId.required(),
  branchId: objectId.allow('', null).optional(),
  title: Joi.string().trim().required(),
  durationMinutes: Joi.number().integer().min(1).required(),
  startsAt: Joi.date().iso().required(),
  endsAt: Joi.date().iso().required(),
  randomizeQuestions: Joi.boolean().optional(),
  attemptLimit: Joi.number().integer().min(1).optional(),
  questions: Joi.array().items(Joi.object({ type: Joi.string().valid('mcq', 'essay').required(), prompt: Joi.string().required(), options: Joi.array().items(Joi.string()).optional(), correctAnswer: Joi.string().allow('', null), points: Joi.number().min(0).optional() })).min(1).required(),
  isPublished: Joi.boolean().optional()
}) });
const attemptSubmitSchema = Joi.object({ body: Joi.object({ answers: Joi.array().items(Joi.object({ questionId: Joi.string().required(), answer: Joi.string().allow('', null) })).required() }) });
const assignmentSchema = Joi.object({ body: Joi.object({
  classId: objectId.required(),
  subjectId: objectId.required(),
  teacherId: objectId.required(),
  branchId: objectId.allow('', null).optional(),
  title: Joi.string().trim().required(),
  description: Joi.string().allow('', null).optional(),
  deadline: Joi.date().iso().required(),
  maxScore: Joi.number().min(0).optional(),
  isPublished: Joi.boolean().optional()
}) });
const certificateSchema = Joi.object({ body: Joi.object({ studentId: objectId.required(), branchId: objectId.allow('', null).optional(), type: Joi.string().valid('graduation', 'attendance', 'completion').required(), title: Joi.string().required() }) });

enterpriseRouter.use(authenticate);

enterpriseRouter.get('/health', (req, res) => {
  assertEnterprisePermission(req.user, 'REPORT_VIEW');
  res.json(createResponse({ status: 'enterprise-ready', jalaliDate: formatJalaliDate(), modules: 11 }));
});

enterpriseRouter.get('/readiness', async (req, res, next) => {
  try {
    assertEnterprisePermission(req.user, 'REPORT_VIEW');
    const readiness = await calculateEnterpriseReadiness(req.user);
    res.json(createResponse(readiness));
  } catch (error) {
    next(error);
  }
});

enterpriseRouter.post('/timetable/validate', validate(timetableSchema), async (req, res, next) => {
  try {
    assertEnterprisePermission(req.user, 'CLASS_UPDATE');
    const result = await validateTimetableEntry(req.body);
    res.json(createResponse(result, 'Timetable entry is conflict-free'));
  } catch (error: any) {
    res.status(error.statusCode ?? 400).json(createError(error.message));
  }
});

enterpriseRouter.post('/timetable', validate(timetableSchema), async (req, res) => {
  try {
    assertEnterprisePermission(req.user, 'CLASS_UPDATE');
    const validation = await validateTimetableEntry(req.body);
    const item = await Timetable.create({ ...req.body, durationMinutes: validation.durationMinutes, active: req.body.isActive ?? true });
    res.status(201).json(createResponse(item, 'Enterprise timetable item created'));
  } catch (error: any) {
    res.status(error.statusCode ?? 400).json(createError(error.message));
  }
});

enterpriseRouter.get('/attendance/active-sessions', async (req, res) => {
  assertEnterprisePermission(req.user, 'ATTENDANCE_VIEW');
  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const entries = await Timetable.find({ isDeleted: false, isActive: true, dayOfWeek }).populate('classId', 'className').populate('subjectId', 'title').populate('teacherId', 'name').lean<any[]>();
  const active = entries.filter((entry) => {
    const [startHour, startMinute] = entry.startTime.split(':').map(Number);
    const [endHour, endMinute] = entry.endTime.split(':').map(Number);
    return currentMinutes >= (startHour * 60 + startMinute - 10) && currentMinutes <= (endHour * 60 + endMinute + 15);
  });
  res.json(createResponse(active.map((entry) => ({ ...entry, countdownClosesAt: entry.endTime, jalaliDate: formatJalaliDate() }))));
});

enterpriseRouter.get('/subjects/by-class/:classId', async (req, res) => {
  assertEnterprisePermission(req.user, 'SUBJECT_VIEW');
  const subjects = await import('../../models/Subject').then(({ Subject }) => Subject.find({ isDeleted: false, activeStatus: true, $or: [{ classId: req.params.classId }, { classIds: req.params.classId }] }).sort({ title: 1 }).lean());
  res.json(createResponse(subjects));
});

enterpriseRouter.post('/subjects/validate', async (req, res) => {
  try {
    assertEnterprisePermission(req.user, 'SUBJECT_VIEW');
    await assertClassSubjectDependency(req.body.classId, req.body.subjectId);
    res.json(createResponse({ valid: true }));
  } catch (error: any) {
    res.status(error.statusCode ?? 400).json(createError(error.message));
  }
});

enterpriseRouter.post('/transcripts', validate(transcriptSchema), async (req, res) => {
  try {
    assertEnterprisePermission(req.user, 'RESULT_CREATE');
    const { totalCredits, gpa } = calculateGpa(req.body.subjects);
    const previous = await EnterpriseTranscript.find({ studentId: req.body.studentId, isDeleted: false }).lean<any[]>();
    const cumulativeCredits = previous.reduce((sum, item) => sum + Number(item.totalCredits ?? 0), 0) + totalCredits;
    const cumulativeWeighted = previous.reduce((sum, item) => sum + Number(item.gpa ?? 0) * Number(item.totalCredits ?? 0), 0) + gpa * totalCredits;
    const transcript = await EnterpriseTranscript.create({ ...req.body, totalCredits, gpa, cgpa: cumulativeCredits ? Number((cumulativeWeighted / cumulativeCredits).toFixed(2)) : gpa, verificationCode: createVerificationCode('TRN') });
    res.status(201).json(createResponse(transcript));
  } catch (error: any) {
    res.status(error.statusCode ?? 400).json(createError(error.message));
  }
});

enterpriseRouter.get('/transcripts/:id/pdf', async (req, res) => {
  assertEnterprisePermission(req.user, 'RESULT_VIEW');
  const transcript = await EnterpriseTranscript.findById(req.params.id).populate('studentId', 'firstName lastName').lean<any>();
  if (!transcript) return res.status(404).json(createError('Transcript not found'));
  return streamCertificatePdf(res, { title: `Transcript GPA ${transcript.gpa} CGPA ${transcript.cgpa}`, studentName: [transcript.studentId?.firstName, transcript.studentId?.lastName].filter(Boolean).join(' '), verificationCode: transcript.verificationCode, type: 'transcript' });
});

enterpriseRouter.post('/online-exams', validate(onlineExamSchema), async (req, res) => {
  try {
    assertEnterprisePermission(req.user, 'EXAM_CREATE');
    await assertClassSubjectDependency(req.body.classId, req.body.subjectId);
    const exam = await EnterpriseOnlineExam.create(req.body);
    res.status(201).json(createResponse(exam));
  } catch (error: any) {
    res.status(error.statusCode ?? 400).json(createError(error.message));
  }
});

enterpriseRouter.post('/online-exams/:id/start', async (req, res) => {
  try {
    assertEnterprisePermission(req.user, 'EXAM_VIEW');
    const student = await Student.findOne({ studentId: (req.user as any)?.studentId, isDeleted: false }).lean<any>();
    const studentId = req.body.studentId ?? student?._id;
    const attempt = await EnterpriseExamAttempt.create({ examId: req.params.id, studentId, ipAddress: req.ip, userAgent: req.get('user-agent') ?? '', logs: [{ type: 'start', detail: 'Exam attempt started' }] });
    res.status(201).json(createResponse(attempt));
  } catch (error: any) {
    res.status(409).json(createError('Exam attempt already exists or cannot be started.'));
  }
});

enterpriseRouter.post('/online-attempts/:id/submit', validate(attemptSubmitSchema), async (req, res) => {
  try {
    assertEnterprisePermission(req.user, 'EXAM_VIEW');
    const attempt = await EnterpriseExamAttempt.findOne({ _id: req.params.id, status: 'in_progress', isDeleted: false });
    if (!attempt) return res.status(409).json(createError('Attempt is locked or already submitted.'));
    attempt.answers = req.body.answers;
    attempt.status = 'submitted';
    attempt.submittedAt = new Date();
    attempt.logs.push({ type: 'submit', detail: 'Submitted by user' } as any);
    await attempt.save();
    res.json(createResponse(attempt));
  } catch (error: any) {
    res.status(error.statusCode ?? 400).json(createError(error.message));
  }
});

enterpriseRouter.post('/assignments', upload.array('files'), validate(assignmentSchema), async (req, res) => {
  try {
    assertEnterprisePermission(req.user, 'CURRICULUM_CREATE');
    await assertClassSubjectDependency(req.body.classId, req.body.subjectId);
    const files = ((req.files as Express.Multer.File[]) ?? []).map((file) => file.path);
    const assignment = await EnterpriseAssignment.create({ ...req.body, attachments: files });
    res.status(201).json(createResponse(assignment));
  } catch (error: any) {
    res.status(error.statusCode ?? 400).json(createError(error.message));
  }
});

enterpriseRouter.post('/assignments/:id/submit', upload.array('files'), async (req, res) => {
  try {
    assertEnterprisePermission(req.user, 'CURRICULUM_VIEW');
    const assignment = await EnterpriseAssignment.findById(req.params.id).lean<any>();
    if (!assignment) return res.status(404).json(createError('Assignment not found'));
    const files = ((req.files as Express.Multer.File[]) ?? []).map((file) => file.path);
    const submission = await EnterpriseAssignmentSubmission.create({ assignmentId: req.params.id, studentId: req.body.studentId, files, answerText: req.body.answerText ?? '', isLate: new Date() > new Date(assignment.deadline) });
    res.status(201).json(createResponse(submission));
  } catch (error: any) {
    res.status(409).json(createError(error.message));
  }
});

enterpriseRouter.post('/certificates', validate(certificateSchema), async (req, res) => {
  try {
    assertEnterprisePermission(req.user, 'RESULT_CREATE');
    const verificationCode = createVerificationCode('CERT');
    const cert = await EnterpriseCertificate.create({ ...req.body, verificationCode, signedBy: req.user?.userId ?? null });
    res.status(201).json(createResponse(cert));
  } catch (error: any) {
    res.status(error.statusCode ?? 400).json(createError(error.message));
  }
});

enterpriseRouter.get('/certificates/verify/:code', async (req, res) => {
  assertEnterprisePermission(req.user, 'RESULT_VIEW');
  const cert = await EnterpriseCertificate.findOne({ verificationCode: req.params.code, isDeleted: false }).populate('studentId', 'firstName lastName').lean();
  res.json(createResponse({ valid: Boolean(cert), certificate: cert ?? null }));
});

enterpriseRouter.get('/certificates/:id/pdf', async (req, res) => {
  assertEnterprisePermission(req.user, 'RESULT_VIEW');
  const cert = await EnterpriseCertificate.findById(req.params.id).populate('studentId', 'firstName lastName').lean<any>();
  if (!cert) return res.status(404).json(createError('Certificate not found'));
  return streamCertificatePdf(res, { title: cert.title, studentName: [cert.studentId?.firstName, cert.studentId?.lastName].filter(Boolean).join(' '), verificationCode: cert.verificationCode, type: cert.type });
});

enterpriseRouter.get('/parents/:studentId/monitoring', async (req, res) => {
  assertEnterprisePermission(req.user, 'DASHBOARD_VIEW');
  const [attendance, results, payments] = await Promise.all([
    Attendance.find({ studentId: req.params.studentId, isDeleted: false }).sort({ attendanceDate: -1 }).limit(30).lean(),
    Result.find({ student: req.params.studentId, isDeleted: false }).sort({ createdAt: -1 }).limit(30).lean(),
    Payment.find({ studentId: req.params.studentId, isDeleted: false }).sort({ paymentDate: -1 }).limit(30).lean()
  ]);
  res.json(createResponse({ attendance, results, payments }));
});

enterpriseRouter.get('/analytics/advanced', async (req, res) => {
  assertEnterprisePermission(req.user, 'REPORT_VIEW');
  const [attendanceByStatus, teacherLoad, classUtilization] = await Promise.all([
    Attendance.aggregate([{ $match: { isDeleted: false } }, { $group: { _id: '$status', total: { $sum: 1 } } }]),
    Timetable.aggregate([{ $match: { isDeleted: false, isActive: true } }, { $group: { _id: '$teacherId', minutes: { $sum: '$durationMinutes' } } }]),
    Timetable.aggregate([{ $match: { isDeleted: false, isActive: true } }, { $group: { _id: '$classId', sessions: { $sum: 1 } } }])
  ]);
  res.json(createResponse({ attendanceByStatus, teacherLoad, classUtilization, jalaliDate: formatJalaliDate() }));
});

enterpriseRouter.post('/backups/manual', async (req, res) => {
  try {
    assertEnterprisePermission(req.user, 'AUDIT_VIEW');
    const backup = await createZipBackup(path.join(process.cwd(), 'uploads'), path.join(process.cwd(), 'backups'));
    const record = await EnterpriseBackup.create({ ...backup, requestedBy: req.user?.userId ?? null, createdAtJalali: formatJalaliDate() });
    res.status(201).json(createResponse(record));
  } catch (error: any) {
    res.status(error.statusCode ?? 400).json(createError(error.message));
  }
});

enterpriseRouter.get('/backups/:id/download', async (req, res) => {
  assertEnterprisePermission(req.user, 'AUDIT_VIEW');
  const backup = await EnterpriseBackup.findById(req.params.id).lean<any>();
  if (!backup) return res.status(404).json(createError('Backup not found'));
  return res.download(backup.filePath, backup.fileName);
});

enterpriseRouter.post('/security/events', async (req, res) => {
  assertEnterprisePermission(req.user, 'AUDIT_VIEW');
  const riskScore = req.body.type === 'suspicious' ? 80 : 10;
  const event = await EnterpriseSecurityEvent.create({ ...req.body, userId: req.body.userId ?? req.user?.userId ?? null, ipAddress: req.ip, userAgent: req.get('user-agent') ?? '', riskScore });
  res.status(201).json(createResponse(event));
});

enterpriseRouter.get('/security/events', async (req, res) => {
  assertEnterprisePermission(req.user, 'AUDIT_VIEW');
  const events = await EnterpriseSecurityEvent.find({ isDeleted: false }).sort({ createdAt: -1 }).limit(100).lean();
  res.json(createResponse(events));
});

if (config.enableJobs) {
  enterpriseCronTasks.push(cron.schedule('0 2 * * *', async () => {
    try {
      const backup = await createZipBackup(path.join(process.cwd(), 'uploads'), path.join(process.cwd(), 'backups'));
      await EnterpriseBackup.create({ ...backup, createdAtJalali: formatJalaliDate() });
    } catch (error) {
      console.error('[ENTERPRISE BACKUP]', error);
    }
  }));
}

export function stopEnterpriseJobs() {
  for (const task of enterpriseCronTasks) {
    task.stop();
    task.destroy();
  }
  enterpriseCronTasks.length = 0;
}
