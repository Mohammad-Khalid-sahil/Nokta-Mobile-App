import { Router, type Request, type Response } from 'express';
import fs from 'fs';
import mongoose from 'mongoose';
import multer from 'multer';
import path from 'path';
import { Attendance } from '../../models/Attendance';
import { ClassModel } from '../../models/Class';
import { Course } from '../../models/Course';
import { Enrollment } from '../../models/Enrollment';
import { Exam } from '../../models/Exam';
import { ExamResult } from '../../models/ExamResult';
import { Family } from '../../models/Family';
import { Message } from '../../models/Message';
import { Notification } from '../../models/Notification';
import { ParentProfile } from '../../models/Parent';
import { Payment } from '../../models/Payment';
import { Result } from '../../models/Result';
import { Salary } from '../../models/Salary';
import { SalaryRecord } from '../../models/SalaryRecord';
import { Student } from '../../models/Student';
import { Subject } from '../../models/Subject';
import { TeacherRating } from '../../models/TeacherRating';
import { TeacherProfile } from '../../models/Teacher';
import { Timetable } from '../../models/Timetable';
import { User } from '../../models/User';
import { Book } from '../../models/Book';
import { Branch } from '../../models/Branch';
import { LearningResource } from '../../models/LearningResource';
import { generateExamInsights, upsertAIResultInsight } from '../ai-results/aiResultAnalysis.service';
import { calculateSalaryRecord } from '../../services/payrollCalculation.service';
import { getHijriYearMonth } from '../../services/afghanistanSalaryTaxService';
import { resolveLocalizedText } from '../../utils/localizedText';
import { resolveStudentRecordForUser } from '../../utils/studentScope';

export const mobileRouter = Router();

const maxItems = 100;
const learningResourceUploadRoot = path.resolve(process.cwd(), 'uploads', 'learning-resources');
const LEARNING_RESOURCE_MAX_BYTES = 100 * 1024 * 1024;
const LEARNING_RESOURCE_TYPES = new Set(['document', 'video', 'link', 'assignment', 'book']);
const LEARNING_RESOURCE_MIME_ALLOW = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'audio/mpeg',
  'audio/mp3',
  'application/epub+zip',
  'application/octet-stream'
]);

if (!fs.existsSync(learningResourceUploadRoot)) {
  fs.mkdirSync(learningResourceUploadRoot, { recursive: true });
}

const learningResourceUpload = multer({
  dest: learningResourceUploadRoot,
  limits: { fileSize: LEARNING_RESOURCE_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedExt = new Set([
      '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt',
      '.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mp3', '.epub'
    ]);
    if (LEARNING_RESOURCE_MIME_ALLOW.has(mime) || allowedExt.has(ext)) {
      cb(null, true);
      return;
    }
    cb(new Error('Unsupported file type'));
  }
});

const websiteApiMap = [
  { path: '/dashboard', endpoint: '/api/dashboard/summary', methods: ['GET'] },
  { path: '/academic-standards', endpoint: '/api/reports/academic-standards', methods: ['GET'], fallback: '/api/reports' },
  { path: '/enterprise', endpoint: '/api/admin/enterprise', methods: ['GET'], fallback: '/api/dashboard/summary' },
  { path: '/branches', endpoint: '/api/branches', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  { path: '/users', endpoint: '/api/users', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  { path: '/students', endpoint: '/api/students', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  { path: '/teachers', endpoint: '/api/teachers', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  { path: '/classes', endpoint: '/api/classes', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  { path: '/timetable', endpoint: '/api/timetable', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  { path: '/courses', endpoint: '/api/courses', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  { path: '/subjects', endpoint: '/api/subjects', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  { path: '/attendance', endpoint: '/api/attendance', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  { path: '/exams', endpoint: '/api/exams', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  { path: '/results', endpoint: '/api/results', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  { path: '/payments', endpoint: '/api/payments', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  { path: '/finance', endpoint: '/api/finance', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  { path: '/expenses', endpoint: '/api/expenses', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  { path: '/payroll', endpoint: '/api/payroll', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  { path: '/academy-financial-report', endpoint: '/api/academy-financial-report', methods: ['GET'] },
  { path: '/reports', endpoint: '/api/reports', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  { path: '/books', endpoint: '/api/books', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  { path: '/messages', endpoint: '/api/messages', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  { path: '/notifications', endpoint: '/api/notifications', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  { path: '/curriculum', endpoint: '/api/curriculum', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  { path: '/audit', endpoint: '/api/audit', methods: ['GET'] },
  { path: '/roles', endpoint: '/api/roles', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  { path: '/permissions', endpoint: '/api/permissions', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  { path: '/global-search', endpoint: '/api/search', methods: ['GET'] },
  { path: '/security-events', endpoint: '/api/observability/security-events', methods: ['GET'], fallback: '/api/audit' },
  { path: '/ai-assistant', endpoint: '/api/admin/ai-assistant', methods: ['GET', 'POST'], fallback: '/api/dashboard/summary' }
];

type AnyRecord = Record<string, any>;

function ok(res: Response, data: unknown) {
  return res.json({ success: true, data });
}

mobileRouter.get('/api-map', (_req, res) => ok(res, {
  generatedAt: new Date().toISOString(),
  basePath: '/api',
  health: '/api/health',
  modules: websiteApiMap
}));

mobileRouter.get('/admin/teacher-ratings', async (req, res, next) => {
  try {
    if (!requireAdminAccess(req, res)) return;
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(maxItems, Math.max(1, Number(req.query.limit || 50)));
    const status = String(req.query.status || '').trim();
    const filter: AnyRecord = {
      isDeleted: false,
      ...branchFilter(req)
    };
    if (status) filter.status = status;
    const [items, total] = await Promise.all([
      TeacherRating.find(filter)
        .populate('studentId', 'firstName lastName studentId')
        .populate('studentUserId', 'name email')
        .populate('teacherId', 'name email')
        .populate('classId', 'className name')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<AnyRecord[]>(),
      TeacherRating.countDocuments(filter)
    ]);
    ok(res, {
      items: items.map((item) => ({
        id: String(item._id),
        studentName: item.studentId
          ? `${item.studentId.firstName ?? ''} ${item.studentId.lastName ?? ''}`.trim()
          : item.studentUserId?.name ?? 'Student',
        studentEmail: item.studentUserId?.email ?? '',
        teacherName: item.teacherId?.name ?? 'Teacher',
        teacherEmail: item.teacherId?.email ?? '',
        className: item.classId?.className ?? item.classId?.name ?? '',
        rating: Number(item.rating ?? 0),
        comment: item.comment ?? '',
        status: item.status ?? '',
        createdAt: compactDate(item.createdAt)
      })),
      page,
      limit,
      total
    });
  } catch (error) {
    next(error);
  }
});

mobileRouter.patch('/admin/teacher-ratings/:id', async (req, res, next) => {
  try {
    if (!requireAdminAccess(req, res)) return;
    const status = String(req.body?.status ?? '').trim();
    if (!['pending_admin_review', 'reviewed', 'archived'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid rating status' });
    }
    const item = await TeacherRating.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false, ...branchFilter(req) },
      { status },
      { new: true }
    ).lean<AnyRecord>();
    if (!item) {
      return res.status(404).json({ success: false, message: 'Rating not found' });
    }
    return ok(res, { id: String(item._id), status: item.status });
  } catch (error) {
    return next(error);
  }
});

mobileRouter.get('/admin/student-registrations', async (req, res, next) => {
  try {
    if (!requireAdminAccess(req, res)) return;
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(maxItems, Math.max(1, Number(req.query.limit || 50)));
    const filter: AnyRecord = {
      isDeleted: false,
      ...branchFilter(req)
    };
    const [items, total] = await Promise.all([
      Student.find(filter)
        .populate('classId', 'className name')
        .populate('subjectId', 'title name')
        .populate('teacherId', 'name email')
        .populate('parentProfileId', 'guardianName guardianEmail guardianPhone')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<AnyRecord[]>(),
      Student.countDocuments(filter)
    ]);
    ok(res, {
      items: items.map((item) => ({
        id: String(item._id),
        studentId: item.studentId ?? '',
        studentName: `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim(),
        fatherName: item.fatherName ?? '',
        familyPhone: item.familyPhone ?? '',
        familyEmail: item.familyEmail ?? '',
        className: item.classId?.className ?? item.classId?.name ?? '',
        subjectName: item.subjectId?.title ?? item.subjectId?.name ?? '',
        teacherName: item.teacherId?.name ?? '',
        parentName: item.parentProfileId?.guardianName ?? '',
        parentEmail: item.parentProfileId?.guardianEmail ?? '',
        parentPhone: item.parentProfileId?.guardianPhone ?? '',
        status: item.status ?? item.accountStatus ?? '',
        accountStatus: item.accountStatus ?? '',
        createdAt: compactDate(item.createdAt)
      })),
      page,
      limit,
      total
    });
  } catch (error) {
    next(error);
  }
});

function objectId(value: unknown) {
  const id = String(value ?? '');
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

function compactDate(value: unknown) {
  if (!value) return '';
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function isPendingScheduleText(value: unknown) {
  const text = String(value ?? '').trim().toLowerCase();
  return !text ||
    text === 'schedule pending' ||
    text === 'time pending' ||
    text === 'pending';
}

function resolveClassScheduleSlots(item: AnyRecord, timetableByClass?: Map<string, AnyRecord[]>) {
  const classId = String(item._id ?? item.id ?? '');
  const timetableSlots = timetableByClass?.get(classId) ?? [];
  if (timetableSlots.length) {
    return timetableSlots.map((entry) => scheduleDto(entry, item));
  }
  const weekly = Array.isArray(item.weeklySchedule) ? item.weeklySchedule : [];
  return weekly
    .filter((slot: AnyRecord) =>
      slot?.startTime &&
      slot?.endTime &&
      Number.isFinite(Number(slot.dayOfWeek))
    )
    .map((slot: AnyRecord) =>
      scheduleDto({ ...slot, room: slot.room ?? item.room, classId: item }, item)
    );
}

function pickPrimaryScheduleSlot(slots: ReturnType<typeof scheduleDto>[]) {
  if (!slots.length) return null;
  const current = slots.find((slot) => slot.status === 'current');
  if (current) return current;
  const upcoming = slots.filter((slot) => slot.status === 'upcoming');
  if (upcoming.length) {
    const today = kabulDayOfWeek();
    const nowMinutes = kabulMinutes();
    const sorted = [...upcoming].sort((left, right) => {
      const leftDistance = (left.dayOfWeek - today + 7) % 7;
      const rightDistance = (right.dayOfWeek - today + 7) % 7;
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      return (timeToMinutes(left.startTime) ?? 0) - (timeToMinutes(right.startTime) ?? 0);
    });
    const laterToday = sorted.find(
      (slot) =>
        slot.dayOfWeek === today &&
        (timeToMinutes(slot.startTime) ?? 0) >= nowMinutes
    );
    return laterToday ?? sorted[0];
  }
  return slots[0];
}

function classScheduleSummary(slots: ReturnType<typeof scheduleDto>[]) {
  if (!slots.length) return '';
  const primary = pickPrimaryScheduleSlot(slots);
  if (!primary) return '';
  const parts = [
    primary.dayLabel,
    primary.timeLabel,
    primary.durationLabel,
    primary.room,
    primary.deliveryMode === 'online'
      ? 'Online'
      : primary.deliveryMode === 'hybrid'
        ? 'Hybrid'
        : ''
  ].filter(Boolean);
  if (slots.length > 1) parts.push(`+${slots.length - 1}`);
  return parts.join(' · ');
}

function classSchedule(item: AnyRecord, timetableByClass?: Map<string, AnyRecord[]>) {
  return classScheduleSummary(resolveClassScheduleSlots(item, timetableByClass));
}

function dayName(dayOfWeek: unknown) {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][Number(dayOfWeek)] ?? '';
}

function timeToMinutes(value: unknown) {
  const [hour, minute] = String(value ?? '').split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function nextScheduleDate(dayOfWeek: unknown) {
  const target = Number(dayOfWeek);
  if (!Number.isFinite(target)) return null;
  const today = kabulDayOfWeek();
  const diff = (target - today + 7) % 7;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kabul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  const base = new Date(`${year}-${month}-${day}T00:00:00+04:30`);
  base.setDate(base.getDate() + diff);
  return base;
}

function hijriShamsiDate(date: Date | null) {
  if (!date) return '';
  try {
    return new Intl.DateTimeFormat('fa-AF-u-ca-persian', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Asia/Kabul'
    }).format(date);
  } catch {
    return compactDate(date);
  }
}

function kabulDayOfWeek(date = new Date()) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kabul',
    weekday: 'long'
  }).format(date);
  const map: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6
  };
  return map[weekday] ?? date.getDay();
}

function kabulMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kabul',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

function scheduleStatus(dayOfWeek: unknown, startTime: unknown, endTime: unknown) {
  const target = Number(dayOfWeek);
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (!Number.isFinite(target) || start == null || end == null) return 'upcoming';
  const today = kabulDayOfWeek();
  if (today !== target) return 'upcoming';
  const minutes = kabulMinutes();
  if (minutes >= start && minutes <= end) return 'current';
  if (minutes > end) return 'completed';
  return 'upcoming';
}

function scheduleDto(entry: AnyRecord, fallbackClass?: AnyRecord) {
  const klass = entry.classId?._id ? entry.classId : fallbackClass;
  const subject = entry.subjectId?._id ? entry.subjectId : fallbackClass?.subjectId;
  const teacher = entry.teacherId?._id ? entry.teacherId : fallbackClass?.teacherId;
  const branch = entry.branchId?._id ? entry.branchId : fallbackClass?.branchId;
  const date = nextScheduleDate(entry.dayOfWeek);
  const duration = Number(entry.durationMinutes ?? 0) ||
    Math.max(0, (timeToMinutes(entry.endTime) ?? 0) - (timeToMinutes(entry.startTime) ?? 0));
  const deliveryMode = entry.deliveryMode ?? entry.mode ?? 'in_person';
  return {
    id: String(entry._id ?? `${klass?._id ?? fallbackClass?._id ?? 'class'}-${entry.dayOfWeek}-${entry.startTime}`),
    _id: String(entry._id ?? `${klass?._id ?? fallbackClass?._id ?? 'class'}-${entry.dayOfWeek}-${entry.startTime}`),
    classId: String(klass?._id ?? fallbackClass?._id ?? ''),
    className: klass?.className ?? klass?.name ?? fallbackClass?.className ?? fallbackClass?.name ?? 'Class',
    title: klass?.className ?? klass?.name ?? fallbackClass?.className ?? fallbackClass?.name ?? 'Class',
    subjectId: String(subject?._id ?? entry.subjectId ?? ''),
    subjectName: subject?.title ?? subject?.name ?? subject?.subjectName ?? fallbackClass?.subjectName ?? '',
    subject: subject?.title ?? subject?.name ?? subject?.subjectName ?? fallbackClass?.subjectName ?? '',
    courseName: klass?.courseName ?? fallbackClass?.courseName ?? '',
    teacherId: String(teacher?._id ?? entry.teacherId ?? ''),
    teacherName: teacher?.name ?? `${teacher?.firstName ?? ''} ${teacher?.lastName ?? ''}`.trim(),
    teacher: teacher?.name ?? `${teacher?.firstName ?? ''} ${teacher?.lastName ?? ''}`.trim(),
    branchId: String(branch?._id ?? entry.branchId ?? ''),
    branchName: branch?.name ?? branch?.branchName ?? '',
    branch: branch?.name ?? branch?.branchName ?? '',
    room: entry.room ?? klass?.room ?? fallbackClass?.room ?? '',
    location: entry.room ?? klass?.room ?? fallbackClass?.room ?? '',
    dayOfWeek: Number(entry.dayOfWeek),
    dayLabel: dayName(entry.dayOfWeek),
    sessionDate: compactDate(date),
    hijriShamsiDate: hijriShamsiDate(date),
    startTime: entry.startTime ?? '',
    endTime: entry.endTime ?? '',
    timeLabel: `${entry.startTime ?? ''}-${entry.endTime ?? ''}`,
    durationMinutes: duration,
    durationLabel: duration ? `${duration} min` : '',
    deliveryMode,
    mode: deliveryMode,
    sessionType: deliveryMode,
    onlineLink: entry.onlineLink ?? entry.meetingLink ?? '',
    meetingLink: entry.onlineLink ?? entry.meetingLink ?? '',
    status: scheduleStatus(entry.dayOfWeek, entry.startTime, entry.endTime),
    notes: entry.notes ?? ''
  };
}

function attendanceDto(item: AnyRecord) {
  const klass = item.classId?._id ? item.classId : null;
  const subject = item.subjectId?._id ? item.subjectId : null;
  const teacher = item.teacherId?._id ? item.teacherId : null;
  const student = item.studentId?._id ? item.studentId : null;
  const branch = item.branchId?._id ? item.branchId : klass?.branchId;
  const timetable = item.timetableId?._id ? item.timetableId : null;
  const attendanceDate = item.attendanceDate ? new Date(item.attendanceDate) : null;
  const studentName = student
    ? [student.firstName, student.lastName].filter(Boolean).join(' ').trim()
    : String(item.studentName ?? '').trim();
  const startTime = item.sessionStartTime || timetable?.startTime || '';
  const endTime = item.sessionEndTime || timetable?.endTime || '';
  const duration = Number(item.durationMinutes ?? 0) ||
    Math.max(0, (timeToMinutes(endTime) ?? 0) - (timeToMinutes(startTime) ?? 0));
  const deliveryMode = timetable?.deliveryMode ?? (item.session === 'online' ? 'online' : 'in_person');

  return {
    ...item,
    id: String(item._id ?? item.id ?? ''),
    _id: String(item._id ?? item.id ?? ''),
    classId: String(klass?._id ?? item.classId ?? ''),
    className: klass?.className ?? klass?.name ?? klass?.title ?? '',
    studentId: String(student?._id ?? item.studentId ?? ''),
    studentName,
    title: studentName || (klass?.className ?? klass?.name ?? klass?.title ?? 'Attendance'),
    subjectId: String(subject?._id ?? item.subjectId ?? ''),
    subjectName: subject?.title ?? subject?.name ?? subject?.subjectName ?? '',
    subject: subject?.title ?? subject?.name ?? subject?.subjectName ?? '',
    teacherId: String(teacher?._id ?? item.teacherId ?? ''),
    teacherName: teacher?.name ?? `${teacher?.firstName ?? ''} ${teacher?.lastName ?? ''}`.trim(),
    teacher: teacher?.name ?? `${teacher?.firstName ?? ''} ${teacher?.lastName ?? ''}`.trim(),
    branchId: String(branch?._id ?? item.branchId ?? ''),
    branchName: branch?.name ?? branch?.branchName ?? '',
    branch: branch?.name ?? branch?.branchName ?? '',
    timetableId: String(timetable?._id ?? item.timetableId ?? ''),
    room: timetable?.room ?? klass?.room ?? '',
    location: timetable?.room ?? klass?.room ?? '',
    attendanceDate: compactDate(item.attendanceDate),
    gregorianDate: item.attendanceDate
      ? new Date(item.attendanceDate).toISOString()
      : '',
    date: compactDate(item.attendanceDate),
    dateLabel: compactDate(item.attendanceDate),
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : '',
    updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : '',
    hijriShamsiDate: hijriShamsiDate(attendanceDate),
    startTime,
    endTime,
    timeLabel: [startTime, endTime].filter(Boolean).join(' - '),
    durationMinutes: duration,
    durationLabel: duration ? `${duration} min` : '',
    session: item.session ?? '',
    sessionType: deliveryMode,
    deliveryMode,
    mode: item.source ?? deliveryMode,
    onlineLink: timetable?.onlineLink ?? '',
    meetingLink: timetable?.onlineLink ?? '',
    note: item.notes ?? item.note ?? '',
    notes: item.notes ?? item.note ?? '',
    reason: item.notes ?? item.note ?? '',
    recordedAt: compactDate(item.createdAt),
    markedAt: compactDate(item.createdAt),
    checkInAt: compactDate(item.checkInAt),
    checkOutAt: compactDate(item.checkOutAt)
  };
}

function pickLocalizedValue(value: unknown, language = 'en') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return String(value ?? '').trim();
  }
  const record = value as AnyRecord;
  return String(record[language] ?? record.en ?? record.fa ?? record.ps ?? '').trim();
}

function courseProgress(course: AnyRecord) {
  const start = course.startDate ? new Date(course.startDate).getTime() : NaN;
  const end = course.endDate ? new Date(course.endDate).getTime() : NaN;
  const now = Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null;
  }
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
}

function courseDto(item: AnyRecord, language = 'en', enrollmentStatus = '') {
  const teacher = item.teacher?._id ? item.teacher : item.instructor;
  const gallery = Array.isArray(item.galleryImages) ? item.galleryImages : [];
  const imageUrl = item.imageUrl ?? item.thumbnailUrl ?? gallery[0] ?? '';
  const progress = courseProgress(item);
  return {
    id: String(item._id ?? item.id ?? ''),
    _id: String(item._id ?? item.id ?? ''),
    title: pickLocalizedValue(item.title, language),
    name: pickLocalizedValue(item.title, language),
    description: pickLocalizedValue(item.shortDescription, language) || pickLocalizedValue(item.description, language),
    imageUrl,
    thumbnailUrl: item.thumbnailUrl ?? imageUrl,
    galleryImages: gallery,
    teacherId: String(teacher?._id ?? teacher ?? ''),
    teacherName: teacher?.name ?? '',
    instructorName: teacher?.name ?? '',
    category: item.category ?? item.academicCategory ?? '',
    academicCategory: item.academicCategory ?? item.category ?? '',
    startDate: compactDate(item.startDate),
    endDate: compactDate(item.endDate),
    duration: item.duration ?? '',
    fee: Number(item.fee ?? 0),
    price: Number(item.fee ?? 0),
    currency: item.currency ?? 'AFN',
    enrollmentStatus: enrollmentStatus || item.enrollmentStatus || (item.registrationOpen === false ? 'closed' : 'open'),
    registrationOpen: item.registrationOpen !== false,
    progressPercent: progress,
    progressLabel: progress == null ? '' : `${progress}%`,
    subjectNames: Array.isArray(item.subjects)
      ? item.subjects.map((subject: AnyRecord) => subject?.title ?? subject?.name ?? subject?.subjectName).filter(Boolean).join(', ')
      : '',
    status: item.status ?? ''
  };
}

function teacherCourseDto(
  item: AnyRecord,
  language = 'en',
  options?: {
    relatedClasses?: AnyRecord[];
    relatedSubjects?: AnyRecord[];
    studentCount?: number;
  }
) {
  const base = courseDto(item, language);
  const relatedClasses = options?.relatedClasses ?? [];
  const relatedSubjects = options?.relatedSubjects ?? [];
  const classSummaries = relatedClasses.map((klass) => ({
    id: String(klass._id ?? klass.id ?? ''),
    className: klass.className ?? klass.name ?? klass.title ?? '',
    classCode: klass.classCode ?? '',
    studentCount: Number(klass.enrolledStudentCount ?? 0),
    status: klass.active === false ? 'inactive' : 'active',
    schedule: klass.schedule ?? ''
  }));
  const subjectSummaries = relatedSubjects.map((subject) => ({
    id: String(subject._id ?? subject.id ?? ''),
    title: pickLocalizedValue(subject.title, language) ||
      String(subject.name ?? subject.subjectName ?? '').trim(),
    subjectName: pickLocalizedValue(subject.title, language) ||
      String(subject.name ?? subject.subjectName ?? '').trim(),
    code: subject.code ?? ''
  }));
  const teacher = item.teacher?._id ? item.teacher : item.instructor;
  const teacherDisplayName = `${teacher?.firstName ?? ''} ${teacher?.lastName ?? ''}`.trim();
  const teacherName = teacher?.name || teacherDisplayName || base.teacherName || '';
  return {
    ...base,
    titleText: pickLocalizedValue(item.title, language),
    descriptionText: pickLocalizedValue(item.description, language) || base.description,
    shortDescription: pickLocalizedValue(item.shortDescription, language) || base.description,
    courseName: base.title,
    slug: item.slug ?? '',
    code: item.slug ?? item.code ?? '',
    classNames: classSummaries.map((klass) => klass.className).filter(Boolean).join(', '),
    className: classSummaries.map((klass) => klass.className).filter(Boolean).join(', '),
    classes: classSummaries,
    classCount: classSummaries.length,
    subjects: subjectSummaries,
    subjectName: subjectSummaries.map((subject) => subject.subjectName).filter(Boolean).join(', '),
    subjectNames: subjectSummaries.map((subject) => subject.subjectName).filter(Boolean).join(', '),
    enrolledStudentCount: Number(options?.studentCount ?? 0),
    studentCount: Number(options?.studentCount ?? 0),
    teacherName,
    instructorName: teacherName,
    level: item.level ?? '',
    branchName: item.branchId?.name ?? item.branchId?.branchName ?? ''
  };
}

function classDto(
  item: AnyRecord,
  options?: {
    scheduleSlots?: ReturnType<typeof scheduleDto>[];
    timetableByClass?: Map<string, AnyRecord[]>;
  }
) {
  const teachers = Array.isArray(item.assignedTeachers) ? item.assignedTeachers : [];
  const subjects = Array.isArray(item.assignedSubjects) ? item.assignedSubjects : [];
  const teacherNames = teachers
    .map((teacher: AnyRecord) => teacher?.name ?? `${teacher?.firstName ?? ''} ${teacher?.lastName ?? ''}`.trim())
    .filter(Boolean)
    .join(', ');
  const subjectNames = subjects
    .map((subject: AnyRecord) => subject?.title ?? subject?.name ?? subject?.subjectName)
    .filter(Boolean)
    .join(', ');
  const primaryImage = item.imageUrl ?? item.thumbnailUrl ?? (Array.isArray(item.galleryImages) ? item.galleryImages[0] : '');
  const resolvedStudentCount = Number(
    item.enrolledStudentCount ?? item.studentCount ?? item.students ?? 0
  );
  const scheduleSlots = options?.scheduleSlots ??
    resolveClassScheduleSlots(item, options?.timetableByClass);
  const primary = pickPrimaryScheduleSlot(scheduleSlots);
  const scheduleSummary = classScheduleSummary(scheduleSlots);
  const rawSchedule = item.schedule ?? '';
  const schedule = scheduleSummary ||
    (isPendingScheduleText(rawSchedule) ? '' : String(rawSchedule));
  return {
    id: String(item._id ?? item.id ?? ''),
    _id: String(item._id ?? item.id ?? ''),
    name: item.name ?? item.className ?? item.title ?? 'Class',
    className: item.className ?? item.name ?? item.title ?? 'Class',
    classCode: item.classCode ?? '',
    room: primary?.room ?? item.room ?? '',
    schedule,
    scheduleSlots,
    scheduleStatus: primary?.status ?? '',
    dayLabel: primary?.dayLabel ?? '',
    dayOfWeek: primary?.dayOfWeek ?? null,
    startTime: primary?.startTime ?? '',
    endTime: primary?.endTime ?? '',
    timeLabel: primary?.timeLabel ?? '',
    durationMinutes: primary?.durationMinutes ?? 0,
    durationLabel: primary?.durationLabel ?? '',
    deliveryMode: primary?.deliveryMode ?? item.mode ?? '',
    studentCount: resolvedStudentCount,
    students: resolvedStudentCount,
    studentsCount: resolvedStudentCount,
    enrolledStudentCount: resolvedStudentCount,
    capacity: Number(item.capacity ?? 0),
    description: item.description ?? item.shortDescription ?? '',
    shortDescription: item.shortDescription ?? item.description ?? '',
    allowedGender: item.genderRestriction ?? 'coed',
    mode: item.mode ?? 'onsite',
    imageUrl: primaryImage ?? '',
    thumbnailUrl: item.thumbnailUrl ?? primaryImage ?? '',
    galleryImages: Array.isArray(item.galleryImages) ? item.galleryImages : [],
    teacherId: String(item.teacherId?._id ?? item.teacherId ?? ''),
    teacherName: item.teacherName ?? item.teacherId?.name ?? teacherNames,
    teachers: teacherNames,
    subjectId: String(item.subjectId?._id ?? item.subjectId ?? ''),
    subject: item.subjectName ?? item.subjectId?.title ?? item.subjectId?.name ?? subjectNames,
    subjectName: item.subjectName ?? item.subjectId?.title ?? item.subjectId?.name ?? subjectNames,
    subjects: subjects,
    courseName: item.courseName ?? item.course?.name ?? '',
    endDate: compactDate(item.endDate),
    active: item.active !== false,
    status: item.active === false ? 'inactive' : 'active',
    registrationOpen: item.registrationOpen !== false,
    registrationStatus: item.registrationOpen === false ? 'closed' : 'open',
    progress: item.progress ?? item.studentProgress ?? ''
  };
}

async function activeStudentIdsForClass(classId: mongoose.Types.ObjectId) {
  const [directIds, enrollmentIds] = await Promise.all([
    Student.distinct('_id', {
      classId,
      isDeleted: false,
      status: 'active'
    }),
    Enrollment.distinct('studentId', {
      classId,
      status: 'active',
      isDeleted: { $ne: true }
    })
  ]);
  const combined = new Set<string>();
  directIds.forEach((id) => combined.add(String(id)));
  enrollmentIds.forEach((id) => combined.add(String(id)));
  return [...combined]
    .map((id) => objectId(id))
    .filter((id): id is mongoose.Types.ObjectId => Boolean(id));
}

async function activeStudentBelongsToClass(
  studentDocId: mongoose.Types.ObjectId,
  classId: mongoose.Types.ObjectId
) {
  const student = await Student.findOne({
    _id: studentDocId,
    isDeleted: false,
    status: 'active'
  }).lean<AnyRecord>();
  if (!student) return null;
  if (String(student.classId) === String(classId)) return student;

  const enrollment = await Enrollment.findOne({
    studentId: studentDocId,
    classId,
    status: 'active',
    isDeleted: { $ne: true }
  })
    .select('_id')
    .lean<AnyRecord>();
  return enrollment ? student : null;
}

async function activeStudentCountsByClass(classIds: mongoose.Types.ObjectId[]) {
  if (!classIds.length) return new Map<string, number>();
  const counts = new Map<string, number>(classIds.map((id) => [String(id), 0]));
  const [directRows, enrollmentRows] = await Promise.all([
    Student.aggregate([
      {
        $match: {
          classId: { $in: classIds },
          isDeleted: false,
          status: 'active'
        }
      },
      { $group: { _id: '$classId', studentIds: { $addToSet: '$_id' } } }
    ]),
    Enrollment.aggregate([
      {
        $match: {
          classId: { $in: classIds },
          status: 'active',
          isDeleted: { $ne: true }
        }
      },
      { $group: { _id: '$classId', studentIds: { $addToSet: '$studentId' } } }
    ])
  ]);

  const uniqueByClass = new Map<string, Set<string>>();
  classIds.forEach((id) => uniqueByClass.set(String(id), new Set<string>()));
  directRows.forEach((row) => {
    const key = String(row._id);
    const bucket = uniqueByClass.get(key) ?? new Set<string>();
    (row.studentIds ?? []).forEach((id: unknown) => bucket.add(String(id)));
    uniqueByClass.set(key, bucket);
  });
  enrollmentRows.forEach((row) => {
    const key = String(row._id);
    const bucket = uniqueByClass.get(key) ?? new Set<string>();
    (row.studentIds ?? []).forEach((id: unknown) => bucket.add(String(id)));
    uniqueByClass.set(key, bucket);
  });
  uniqueByClass.forEach((ids, classKey) => counts.set(classKey, ids.size));
  return counts;
}

async function uniqueActiveStudentCountForClasses(classIds: mongoose.Types.ObjectId[]) {
  if (!classIds.length) return 0;
  const [directIds, enrollmentIds] = await Promise.all([
    Student.distinct('_id', {
      classId: { $in: classIds },
      isDeleted: false,
      status: 'active'
    }),
    Enrollment.distinct('studentId', {
      classId: { $in: classIds },
      status: 'active',
      isDeleted: { $ne: true }
    })
  ]);
  const unique = new Set<string>();
  directIds.forEach((id) => unique.add(String(id)));
  enrollmentIds.forEach((id) => unique.add(String(id)));
  return unique.size;
}

function withClassStudentCounts(
  classes: AnyRecord[],
  countMap: Map<string, number>
) {
  return classes.map((item) => {
    const classId = String(item._id ?? item.id ?? '');
    const enrolledStudentCount = countMap.get(classId) ?? 0;
    return {
      ...item,
      enrolledStudentCount,
      studentCount: enrolledStudentCount
    };
  });
}

function messageDto(item: AnyRecord, viewerId?: string) {
  const senderId = String(item.senderId?._id ?? item.senderId ?? '');
  const recipientId = String(item.recipientId?._id ?? item.recipientId ?? '');
  const isMine = Boolean(viewerId && senderId === String(viewerId));

  return {
    id: String(item._id ?? item.id ?? ''),
    _id: String(item._id ?? item.id ?? ''),
    senderId,
    recipientId,
    senderRole: item.senderRole || '',
    recipientRole: item.recipientRole || '',
    name: item.senderName || item.subject || 'Academy',
    role: item.senderRole || item.category || 'message',
    title: item.subject || 'Message',
    lastMessage: item.body || item.message || '',
    body: item.body || item.message || '',
    timeLabel: compactDate(item.createdAt),
    status: item.status || '',
    category: item.category || '',
    direction: isMine ? 'outgoing' : 'incoming',
    isMine,
    unreadCount: item.status === 'unread' && !isMine ? 1 : 0
  };
}

function notificationDto(item: AnyRecord, lang = 'en', options: { viewerId?: string; owned?: boolean } = {}) {
  const title = resolveLocalizedText(item.title, lang);
  const body = resolveLocalizedText(item.message ?? item.description, lang);
  const readBy = Array.isArray(item.readBy) ? item.readBy.map(String) : [];
  const viewerId = options.viewerId ? String(options.viewerId) : '';
  const teacherId = String(item.teacherId?._id ?? item.teacherId ?? '');
  const owned = options.owned ?? (Boolean(viewerId) && teacherId === viewerId);
  const uniqueViewers = Array.from(new Set(readBy.filter((id) => id && id !== teacherId)));
  const isRead = Boolean(
    viewerId && (readBy.includes(viewerId) || item.readAt)
  );
  return {
    id: String(item._id ?? item.id ?? ''),
    _id: String(item._id ?? item.id ?? ''),
    title,
    body,
    message: body,
    description: body,
    label: item.category ?? 'Announcement',
    category: item.category ?? 'general',
    type: item.category ?? 'general',
    priority: item.priority ?? 'normal',
    severity: item.severity ?? 'info',
    status: item.status ?? (isRead ? 'read' : 'unread'),
    publishStatus: item.publishStatus ?? '',
    pinned: Boolean(item.pinned),
    teacherId,
    classId: String(item.classId?._id ?? item.classId ?? ''),
    className: item.classId?.className ?? item.classId?.name ?? item.className ?? '',
    subjectId: String(item.subjectId?._id ?? item.subjectId ?? ''),
    subjectName: item.subjectId?.title ?? item.subjectId?.name ?? item.subjectName ?? '',
    recipientRoles: Array.isArray(item.recipientRoles) ? item.recipientRoles : [],
    recipientIds: Array.isArray(item.recipientIds) ? item.recipientIds.map(String) : [],
    readBy,
    viewedCount: uniqueViewers.length,
    viewCount: uniqueViewers.length,
    unreadCount: Math.max(0, Number(item.recipientEstimate ?? 0) - uniqueViewers.length),
    isOwned: owned,
    source: owned ? 'authored' : 'received',
    author: item.authorName ?? item.teacherId?.name ?? '',
    authorName: item.authorName ?? item.teacherId?.name ?? '',
    teacherName: item.teacherId?.name ?? item.authorName ?? '',
    attachments: Array.isArray(item.attachments)
      ? item.attachments
      : Array.isArray(item.metadata?.attachments)
        ? item.metadata.attachments
        : [],
    link: item.link ?? item.url ?? item.metadata?.link ?? item.metadata?.url ?? '',
    timeLabel: compactDate(item.publishDate ?? item.createdAt),
    publishDate: compactDate(item.publishDate ?? item.createdAt),
    expiresAt: compactDate(item.expiresAt),
    createdAt: compactDate(item.createdAt ?? item.publishDate),
    updatedAt: compactDate(item.updatedAt)
  };
}

function mapAudienceRoles(audience: unknown) {
  const value = String(audience ?? '').trim().toLowerCase();
  if (value === 'students' || value === 'student') return ['student'];
  if (value === 'parents' || value === 'parent') return ['parent'];
  if (value === 'students_and_parents' || value === 'both') return ['student', 'parent'];
  if (Array.isArray(audience)) {
    return audience.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

async function estimateNotificationRecipients(payload: {
  classId?: unknown;
  recipientRoles?: string[];
  recipientIds?: unknown[];
}) {
  const roles = Array.isArray(payload.recipientRoles) ? payload.recipientRoles : [];
  const classId = objectId(payload.classId);
  let estimate = Array.isArray(payload.recipientIds) ? payload.recipientIds.length : 0;

  if (!classId || !roles.length) return estimate;

  if (roles.includes('student') || roles.includes('family_student')) {
    estimate += await Student.countDocuments({ classId, status: 'active', isDeleted: false });
  }
  if (roles.includes('parent')) {
    const students = await Student.find({ classId, status: 'active', isDeleted: false })
      .select('parentProfileId userId')
      .lean<AnyRecord[]>();
    const parentIds = new Set(
      students
        .map((item) => String(item.parentProfileId ?? ''))
        .filter(Boolean)
    );
    estimate += parentIds.size;
  }
  return estimate;
}

function chatMessageDto(item: AnyRecord) {
  return {
    id: String(item._id ?? item.id ?? ''),
    _id: String(item._id ?? item.id ?? ''),
    threadId: String(item.threadId ?? item.parentMessageId ?? item._id ?? ''),
    senderId: String(item.senderId?._id ?? item.senderId ?? ''),
    senderName: item.senderName || item.senderId?.name || 'Student',
    senderRole: item.senderRole || '',
    recipientId: String(item.recipientId?._id ?? item.recipientId ?? ''),
    recipientName: item.recipientId?.name || '',
    body: item.body || item.message || '',
    subject: item.subject || '',
    status: item.status || 'unread',
    createdAt: compactDate(item.createdAt),
    isMine: false,
    messageType: item.messageType || '',
    attachments: Array.isArray(item.attachments) ? item.attachments : []
  };
}

async function currentUser(req: Request) {
  if (!req.user?.userId) return null;
  return User.findById(req.user.userId).lean<AnyRecord>();
}

async function currentStudent(req: Request) {
  const scope = await resolveStudentRecordForUser(req.user?.userId);
  return scope?.student ?? null;
}

async function currentStudentContext(req: Request) {
  const student = await currentStudent(req);
  if (!student || !req.user?.userId) return null;
  return {
    student,
    studentId: objectId(student._id),
    userId: objectId(req.user.userId),
    classId: objectId(student.classId),
    teacherId: objectId(student.teacherId),
    branchId: objectId(student.branchId)
  };
}

async function studentUserForStudentId(studentId: unknown) {
  const student = await Student.findById(studentId).select('studentId loginEmail').lean<AnyRecord>();
  if (!student) return null;
  const fallbackEmail = student.studentId
    ? `${String(student.studentId).trim().toLowerCase()}@student.nokta.academy`
    : '';
  const orClauses: AnyRecord[] = [];
  if (student.studentId) orClauses.push({ studentId: student.studentId });
  if (student.loginEmail) orClauses.push({ email: String(student.loginEmail).trim().toLowerCase() });
  if (fallbackEmail) orClauses.push({ email: fallbackEmail });
  if (!orClauses.length) return null;
  return User.findOne({
    role: 'student',
    isDeleted: false,
    $or: orClauses
  }).select('name email role profileImage studentId').lean<AnyRecord>();
}

async function currentParent(req: Request) {
  const user = await currentUser(req);
  if (!user) return null;
  return ParentProfile.findOne({
    $or: [
      { userId: user._id },
      user.parentProfileId ? { _id: user.parentProfileId } : { _id: null },
      user.familyId ? { linkedStudentIds: { $exists: true } } : { _id: null }
    ],
    isDeleted: false
  }).lean<AnyRecord>();
}

async function currentParentScope(req: Request) {
  const user = await currentUser(req);
  const parent = await currentParent(req);
  let family: AnyRecord | null = null;

  if (user?.familyId) {
    family = await Family.findById(user.familyId).lean<AnyRecord>();
  }
  if (!family && parent?.guardianEmail) {
    family = await Family.findOne({
      guardianEmail: parent.guardianEmail,
    }).lean<AnyRecord>();
  }
  if (!family && user?.email) {
    family = await Family.findOne({
      guardianEmail: user.email,
    }).lean<AnyRecord>();
  }
  if (!family && user?.phone) {
    family = await Family.findOne({
      guardianPhone: user.phone,
    }).lean<AnyRecord>();
  }
  if (!family && String(user?.role ?? '') === 'family_student') {
    const match = String(user?.email ?? '').match(/^family(\d+)@nokta\.com$/i);
    const index = match ? Math.max(0, Number(match[1]) - 1) : -1;
    if (index >= 0) {
      family = await Family.findOne({}).sort({ createdAt: 1, _id: 1 }).skip(index).lean<AnyRecord>();
    }
  }

  const profileStudentIds = Array.isArray(parent?.linkedStudentIds)
    ? parent.linkedStudentIds
    : [];
  const familyStudentIds = Array.isArray(family?.students) ? family.students : [];
  const studentIds = Array.from(
    new Set([...profileStudentIds, ...familyStudentIds].map(String).filter(Boolean))
  )
    .map(objectId)
    .filter((id): id is mongoose.Types.ObjectId => Boolean(id));

  return { user, parent, family, studentIds };
}

async function studentUserIdsForStudentRecords(studentIds: mongoose.Types.ObjectId[]) {
  if (!studentIds.length) return [];
  const students = await Student.find({ _id: { $in: studentIds }, isDeleted: false })
    .select('studentId loginEmail')
    .lean<AnyRecord[]>();
  const studentNumbers = students.map((student) => student.studentId).filter(Boolean);
  const emails = students.map((student) => student.loginEmail).filter(Boolean);
  const users = await User.find({
    role: 'student',
    isDeleted: false,
    $or: [
      studentNumbers.length ? { studentId: { $in: studentNumbers } } : { _id: null },
      emails.length ? { email: { $in: emails } } : { _id: null }
    ]
  }).select('_id').lean<AnyRecord[]>();
  return users.map((user) => objectId(user._id)).filter((id): id is mongoose.Types.ObjectId => Boolean(id));
}

async function currentTeacher(req: Request) {
  if (!req.user?.userId) return null;
  return TeacherProfile.findOne({ userId: req.user.userId, isDeleted: false }).lean<AnyRecord>();
}

async function teacherClassForRequest(req: Request, classIdValue: unknown) {
  const classId = objectId(classIdValue);
  const teacherId = objectId(req.user?.userId);
  if (!classId || !teacherId) return null;
  const teacher = await currentTeacher(req);
  const assignedClassIds = Array.isArray(teacher?.assignedClassIds)
    ? teacher.assignedClassIds
      .map(objectId)
      .filter((id): id is mongoose.Types.ObjectId => Boolean(id))
    : [];
  const classScope: AnyRecord[] = [
    { teacherId },
    { assignedTeachers: teacherId }
  ];
  if (assignedClassIds.some((id) => String(id) === String(classId))) {
    classScope.push({ _id: classId });
  }
  return ClassModel.findOne({
    _id: classId,
    isDeleted: false,
    $or: classScope
  }).lean<AnyRecord>();
}

function learningResourceDto(item: AnyRecord) {
  const classRef = item.classId;
  const subjectRef = item.subjectId;
  const uploader = item.uploadedBy;
  const fileUrl = String(item.url ?? '');
  const hasFile = Boolean(item.fileName || (fileUrl && !/^https?:\/\//i.test(fileUrl)));
  const isExternal = /^https?:\/\//i.test(fileUrl);
  return {
    id: String(item._id ?? item.id ?? ''),
    _id: String(item._id ?? item.id ?? ''),
    title: item.title ?? '',
    description: item.description ?? '',
    type: item.type ?? 'document',
    url: isExternal ? fileUrl : '',
    fileUrl: hasFile ? fileUrl : (isExternal ? '' : fileUrl),
    fileName: item.fileOriginalName || item.fileName || '',
    storedFileName: item.fileName || '',
    fileMimeType: item.fileMimeType || '',
    mimeType: item.fileMimeType || '',
    fileSize: Number(item.fileSize ?? 0),
    published: item.published !== false,
    status: item.published === false ? 'draft' : 'published',
    publishStatus: item.published === false ? 'draft' : 'published',
    classId: String(classRef?._id ?? classRef ?? ''),
    className: classRef?.className ?? classRef?.name ?? '',
    subjectId: String(subjectRef?._id ?? subjectRef ?? ''),
    subjectName: subjectRef?.title ?? subjectRef?.name ?? subjectRef?.subjectName ?? '',
    authorName: uploader?.name ?? '',
    author: uploader?.name ?? '',
    uploadedBy: String(uploader?._id ?? uploader ?? ''),
    accessRoles: Array.isArray(item.accessRoles) ? item.accessRoles : [],
    downloadable: Boolean(hasFile || isExternal),
    isExternalLink: isExternal || item.type === 'link',
    createdAt: compactDate(item.createdAt),
    updatedAt: compactDate(item.updatedAt),
    timeLabel: compactDate(item.updatedAt ?? item.createdAt)
  };
}

function normalizeLearningResourceType(raw: unknown, mime = '', fileName = '') {
  const value = String(raw ?? '').trim().toLowerCase();
  if (LEARNING_RESOURCE_TYPES.has(value)) return value;
  const combined = `${mime} ${fileName}`.toLowerCase();
  if (combined.includes('video') || combined.includes('.mp4')) return 'video';
  if (combined.includes('epub') || combined.includes('book')) return 'book';
  return 'document';
}

function sanitizeExternalResourceUrl(raw: unknown) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return '';
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return '';
  return parsed.toString();
}

function persistLearningResourceUpload(file?: { path: string; originalname?: string; mimetype?: string; size?: number } | null) {
  if (!file) return null;
  const ext = path.extname(file.originalname || '').toLowerCase() || '';
  const safeBase = path
    .basename(file.originalname || 'resource', ext)
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 80) || 'resource';
  const storedName = `${Date.now()}-${safeBase}${ext}`;
  const finalPath = path.join(learningResourceUploadRoot, storedName);
  fs.renameSync(file.path, finalPath);
  return {
    fileName: storedName,
    fileOriginalName: file.originalname || storedName,
    fileMimeType: file.mimetype || 'application/octet-stream',
    fileSize: Number(file.size || 0),
    url: `/uploads/learning-resources/${storedName}`
  };
}

function resolveLearningResourceFilePath(item: AnyRecord) {
  const stored = String(item.fileName || '').trim();
  if (stored) {
    const candidate = path.resolve(learningResourceUploadRoot, path.basename(stored));
    if (candidate.startsWith(learningResourceUploadRoot) && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  const url = String(item.url || '');
  if (url.startsWith('/uploads/learning-resources/')) {
    const candidate = path.resolve(process.cwd(), url.replace(/^\//, ''));
    if (candidate.startsWith(path.resolve(process.cwd(), 'uploads')) && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function assertTeacherSubjectForClass(req: Request, classId: mongoose.Types.ObjectId, subjectIdValue: unknown) {
  const subjectId = objectId(subjectIdValue);
  if (!subjectId) return null;
  const subject = await Subject.findOne({ _id: subjectId, isDeleted: false }).lean<AnyRecord>();
  if (!subject) return null;
  if (String(subject.classId ?? '') !== String(classId)) return null;
  return subject;
}

function parentDto(parent: AnyRecord | null, student: AnyRecord) {
  const guardianPhone = String(parent?.guardianPhone ?? '').trim();
  const fallbackPhone = String(student.familyPhone ?? student.whatsapp ?? '').trim();
  const phone = guardianPhone || (parent ? '' : fallbackPhone);
  return {
    id: String(parent?._id ?? student.parentProfileId ?? ''),
    parentId: String(parent?._id ?? student.parentProfileId ?? ''),
    parentUserId: String(parent?.userId ?? ''),
    name: parent?.guardianName ?? 'Parent',
    parentName: parent?.guardianName ?? student.fatherName ?? 'Parent',
    role: 'parent',
    phone,
    parentPhone: phone,
    whatsapp: phone,
    email: parent?.guardianEmail ?? '',
    parentEmail: parent?.guardianEmail ?? '',
    studentId: String(student._id ?? ''),
    studentCode: student.studentId ?? '',
    studentName: `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim() || 'Student',
    classId: String(student.classId?._id ?? student.classId ?? ''),
    className: student.classId?.className ?? student.classId?.name ?? ''
  };
}

function branchFilter(req: Request) {
  return req.user?.branchId ? { branchId: req.user.branchId } : {};
}

function requireAdminAccess(req: Request, res: Response) {
  const role = String(req.user?.canonicalRole ?? req.user?.role ?? '');
  if (!['super_admin', 'admin', 'owner', 'branch_manager'].includes(role)) {
    res.status(403).json({ success: false, message: 'Admin access required' });
    return false;
  }
  return true;
}

mobileRouter.get('/student/dashboard', async (req, res, next) => {
  try {
    const student = await currentStudent(req);
    const studentId = objectId(student?._id);
    const classId = objectId(student?.classId);
    const [classes, exams, attendanceCount, presentCount, notifications, payments] = await Promise.all([
      classId ? ClassModel.find({ _id: classId, isDeleted: false }).select('className name title classCode room weeklySchedule studentCount capacity description shortDescription genderRestriction imageUrl thumbnailUrl galleryImages teacherId assignedTeachers subjectId assignedSubjects startDate endDate active registrationOpen').populate('teacherId', 'name firstName lastName').populate('assignedTeachers', 'name firstName lastName').populate('subjectId', 'title name subjectName').populate('assignedSubjects', 'title name subjectName').lean<AnyRecord[]>() : Promise.resolve([]),
      classId ? Exam.find({ class: classId, isDeleted: false }).select('title date totalMarks status onlineExamUrl googleFormUrl examType').sort({ date: 1 }).limit(5).lean<AnyRecord[]>() : Promise.resolve([]),
      studentId ? Attendance.countDocuments({ studentId, isDeleted: false }) : Promise.resolve(0),
      studentId ? Attendance.countDocuments({ studentId, status: 'present', isDeleted: false }) : Promise.resolve(0),
      Notification.find({ publishStatus: 'published', isDeleted: false }).select('title message description category publishDate createdAt pinned').sort({ pinned: -1, publishDate: -1, createdAt: -1 }).limit(5).lean<AnyRecord[]>(),
      studentId ? Payment.find({ studentId, isDeleted: false }).select('amount status paymentDate invoiceNumber paymentFor').sort({ paymentDate: -1 }).limit(10).lean<AnyRecord[]>() : Promise.resolve([])
    ]);
    const pendingFeeAmount = Number(student?.remainingBalance ?? 0);
    ok(res, {
      attendancePercentage: attendanceCount ? Math.round((presentCount / attendanceCount) * 100) : 0,
      gpa: 0,
      gpaTrendPercentage: 0,
      gpaHistory: [],
      activeClasses: classes.length,
      upcomingExamCount: exams.length,
      unreadNotifications: notifications.length,
      pendingFeeAmount,
      upcomingClasses: classes.map((item) => classDto(item)),
      notifications: notifications.map((item) => notificationDto(item)),
      stats: {
        totalClasses: classes.length,
        attendedClasses: presentCount,
        pendingAssignments: 0,
        completedAssignments: 0,
        upcomingExams: exams.length
      },
      todayTimeline: classes.map((item) => ({
        id: String(item._id),
        subject: item.className ?? item.name ?? 'Class',
        timeRange: classSchedule(item),
        teacher: '',
        room: item.room ?? '',
        mode: 'onsite',
        isCurrent: false,
        countdownLabel: ''
      })),
      alerts: pendingFeeAmount > 0 ? [{ id: 'fees', title: 'Pending fees', message: `${pendingFeeAmount} AFN pending`, severity: 'warning' }] : [],
      announcements: notifications.map((item) => notificationDto(item)),
      recentPayments: payments
    });
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/student/classes', async (req, res, next) => {
  try {
    const student = await currentStudent(req);
    const classId = objectId(student?.classId);
    const studentObjectId = objectId(student?._id);
    const enrollments = studentObjectId
      ? await Enrollment.find({ studentId: studentObjectId, isDeleted: false })
        .select('classId')
        .lean<AnyRecord[]>()
      : [];
    const classIds = [
      classId,
      ...enrollments.map((item) => objectId(item.classId))
    ].filter((id): id is mongoose.Types.ObjectId => Boolean(id));
    const uniqueClassIds = Array.from(new Set(classIds.map(String)))
      .map((id) => new mongoose.Types.ObjectId(id));
    const classes = uniqueClassIds.length
      ? await ClassModel.find({ _id: { $in: uniqueClassIds }, isDeleted: false }).select('className name title classCode room weeklySchedule studentCount capacity description shortDescription genderRestriction imageUrl thumbnailUrl galleryImages teacherId assignedTeachers subjectId assignedSubjects startDate endDate active registrationOpen').populate('teacherId', 'name firstName lastName').populate('assignedTeachers', 'name firstName lastName').populate('subjectId', 'title name subjectName').populate('assignedSubjects', 'title name subjectName').limit(maxItems).lean<AnyRecord[]>()
      : [];
    ok(res, classes.map((item) => classDto(item)));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/student/courses', async (req, res, next) => {
  try {
    const student = await currentStudent(req);
    const studentId = objectId(student?._id);
    if (!studentId) {
      ok(res, []);
      return;
    }

    const enrollments = await Enrollment.find({ studentId, isDeleted: false })
      .select('classId subjectId teacherId status')
      .lean<AnyRecord[]>();
    const classIds = [
      objectId(student?.classId),
      ...enrollments.map((item) => objectId(item.classId))
    ].filter((id): id is mongoose.Types.ObjectId => Boolean(id));
    const subjectIds = [
      objectId(student?.subjectId),
      ...enrollments.map((item) => objectId(item.subjectId))
    ].filter((id): id is mongoose.Types.ObjectId => Boolean(id));
    const teacherIds = [
      objectId(student?.teacherId),
      ...enrollments.map((item) => objectId(item.teacherId))
    ].filter((id): id is mongoose.Types.ObjectId => Boolean(id));

    const filters: AnyRecord[] = [];
    if (classIds.length) filters.push({ linkedClassId: { $in: classIds } });
    if (subjectIds.length) filters.push({ subjects: { $in: subjectIds } });
    if (teacherIds.length) filters.push({ $or: [{ teacher: { $in: teacherIds } }, { instructor: { $in: teacherIds } }] });

    if (!filters.length) {
      ok(res, []);
      return;
    }

    const courses = await Course.find({
      isDeleted: false,
      status: { $ne: 'archived' },
      $or: filters
    })
      .populate('teacher', 'name firstName lastName')
      .populate('instructor', 'name firstName lastName')
      .populate('subjects', 'title name subjectName')
      .sort({ startDate: 1, createdAt: -1 })
      .limit(maxItems)
      .lean<AnyRecord[]>();

    const enrollmentStatus = enrollments.find((item) => item.status)?.status ?? '';
    ok(res, courses.map((course) => courseDto(course, String(req.query.lang || 'en'), enrollmentStatus)));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/student/schedule', async (req, res, next) => {
  try {
    const student = await currentStudent(req);
    const classId = objectId(student?.classId);
    if (!classId) {
      ok(res, []);
      return;
    }

    const [entries, fallbackClass] = await Promise.all([
      Timetable.find({ classId, isDeleted: false, active: { $ne: false }, isActive: { $ne: false } })
        .select('classId subjectId teacherId branchId dayOfWeek startTime endTime durationMinutes room deliveryMode onlineLink notes active isActive')
        .populate('classId', 'className name room branchId subjectId teacherId')
        .populate('subjectId', 'title name subjectName')
        .populate('teacherId', 'name firstName lastName')
        .populate('branchId', 'name branchName')
        .sort({ dayOfWeek: 1, startTime: 1 })
        .limit(maxItems)
        .lean<AnyRecord[]>(),
      ClassModel.findById(classId)
        .select('className name title room weeklySchedule branchId subjectId teacherId')
        .populate('subjectId', 'title name subjectName')
        .populate('teacherId', 'name firstName lastName')
        .populate('branchId', 'name branchName')
        .lean<AnyRecord>()
    ]);

    if (entries.length) {
      ok(res, entries.map((entry) => scheduleDto(entry, fallbackClass ?? undefined)));
      return;
    }

    const fallback = fallbackClass ?? undefined;
    const fallbackEntries = (fallback?.weeklySchedule ?? []).map((slot: AnyRecord) =>
      scheduleDto({ ...slot, room: fallback?.room, classId: fallback }, fallback)
    );
    ok(res, fallbackEntries);
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/student/attendance', async (req, res, next) => {
  try {
    const student = await currentStudent(req);
    const studentId = objectId(student?._id);
    const records = studentId
      ? await Attendance.find({ studentId, isDeleted: false })
        .select('attendanceDate status source session classId subjectId teacherId branchId timetableId sessionStartTime sessionEndTime checkInAt checkOutAt durationMinutes notes markedAutomatically createdAt')
        .populate('classId', 'className name title room branchId')
        .populate('subjectId', 'title name subjectName')
        .populate('teacherId', 'name firstName lastName')
        .populate('branchId', 'name branchName')
        .populate('timetableId', 'startTime endTime durationMinutes room deliveryMode onlineLink')
        .sort({ attendanceDate: -1, createdAt: -1 })
        .limit(maxItems)
        .lean<AnyRecord[]>()
      : [];
    ok(res, records.map(attendanceDto));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/student/exams', async (req, res, next) => {
  try {
    const student = await currentStudent(req);
    const classId = objectId(student?.classId);
    const exams = classId
      ? await Exam.find({ class: classId, isDeleted: false }).select('title date totalMarks status onlineExamUrl googleFormUrl examType subject').sort({ date: 1 }).limit(maxItems).lean<AnyRecord[]>()
      : [];
    ok(res, exams.map((item) => ({
      ...item,
      id: String(item._id),
      scheduleLabel: compactDate(item.date),
      examDate: compactDate(item.date),
      mode: item.googleFormUrl || item.onlineExamUrl ? 'online' : 'onsite',
      canStart: Boolean(item.googleFormUrl || item.onlineExamUrl)
    })));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/student/exams/:id', async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.id).lean<AnyRecord>();
    ok(res, {
      id: String(exam?._id ?? req.params.id),
      title: exam?.title ?? 'Exam',
      questions: [],
      remainingTime: '',
      examUrl: exam?.onlineExamUrl || exam?.googleFormUrl || ''
    });
  } catch (error) {
    next(error);
  }
});

mobileRouter.post('/student/exams/:id/submit', (_req, res) => ok(res, { submitted: true }));

mobileRouter.get('/student/finance', async (req, res, next) => {
  try {
    const student = await currentStudent(req);
    const studentId = objectId(student?._id);
    const payments = studentId
      ? await Payment.find({ studentId, isDeleted: false })
        .populate('studentId', 'firstName lastName studentId rollNo feeAmount paidAmount remainingBalance classId subjectId branchId')
        .populate('classId', 'className name classCode feeAmount')
        .populate('subjectId', 'title name subjectName code feeAmount')
        .populate('branchId', 'name branchName code')
        .populate('collectedBy', 'name email role')
        .sort({ paymentDate: -1 })
        .limit(maxItems)
        .lean<AnyRecord[]>()
      : [];
    ok(res, payments.map((item) => ({
      ...item,
      id: String(item._id),
      _id: String(item._id),
      title: item.invoiceNumber || item.referenceNumber || item.paymentFor || 'Payment',
      studentId: String(item.studentId?._id ?? item.studentId ?? ''),
      studentName: [item.studentId?.firstName, item.studentId?.lastName].filter(Boolean).join(' ').trim(),
      studentRollNo: item.studentId?.rollNo ?? item.studentId?.studentId ?? '',
      classId: String(item.classId?._id ?? item.classId ?? item.studentId?.classId ?? ''),
      className: item.classId?.className ?? item.classId?.name ?? '',
      classCode: item.classId?.classCode ?? '',
      courseName: item.subjectId?.title ?? item.subjectId?.name ?? item.subjectId?.subjectName ?? '',
      subjectId: String(item.subjectId?._id ?? item.subjectId ?? item.studentId?.subjectId ?? ''),
      subjectName: item.subjectId?.title ?? item.subjectId?.name ?? item.subjectId?.subjectName ?? '',
      paymentType: item.paymentFor ?? 'student_fee',
      paymentFor: item.paymentFor ?? 'student_fee',
      amountAf: Number(item.amount ?? 0),
      amount: Number(item.amount ?? 0),
      discount: Number(item.discount ?? 0),
      paidAmount: Number(item.amount ?? item.netAmount ?? 0),
      paidAmountAf: Number(item.amount ?? item.netAmount ?? 0),
      remainingAmount: Number(item.studentId?.remainingBalance ?? 0),
      remainingBalance: Number(item.studentId?.remainingBalance ?? 0),
      method: item.method ?? '',
      paymentMethod: item.method ?? '',
      paymentDate: compactDate(item.paymentDate),
      hijriShamsiDate: hijriShamsiDate(item.paymentDate ? new Date(item.paymentDate) : null),
      dueDateLabel: compactDate(item.paymentDate),
      receiptNumber: item.invoiceNumber ?? '',
      invoiceNumber: item.invoiceNumber ?? '',
      reference: item.referenceNumber || item.invoiceNumber || '',
      referenceNumber: item.referenceNumber ?? '',
      status: item.status ?? '',
      paymentStatus: item.status ?? '',
      branchId: String(item.branchId?._id ?? item.branchId ?? item.studentId?.branchId ?? ''),
      branchName: item.branchId?.name ?? item.branchId?.branchName ?? '',
      recordedBy: item.collectedBy?.name ?? '',
      recordedByName: item.collectedBy?.name ?? '',
      note: item.notes ?? '',
      notes: item.notes ?? '',
      currency: item.currency ?? 'AFN',
      isImmutable: item.immutableRecord ?? true
    })));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/student/announcements', async (req, res, next) => {
  try {
    const context = await currentStudentContext(req);
    if (!context?.studentId || !context.userId) return ok(res, []);

    const studentObjectId = context.studentId;
    const enrollments = await Enrollment.find({
      studentId: studentObjectId,
      isDeleted: false
    }).select('classId subjectId courseId').lean<AnyRecord[]>();

    const allowedClassIds = Array.from(new Set([
      String(context.classId ?? ''),
      ...enrollments.map((item) => String(item.classId ?? ''))
    ].filter(Boolean))).map((id) => new mongoose.Types.ObjectId(id));

    const allowedSubjectIds = Array.from(new Set([
      String(context.student?.subjectId ?? ''),
      ...enrollments.map((item) => String(item.subjectId ?? ''))
    ].filter(Boolean))).filter(mongoose.Types.ObjectId.isValid).map((id) => new mongoose.Types.ObjectId(id));

    const lang = String(req.query.lang ?? req.headers['accept-language'] ?? 'en');
    const now = new Date();
    const notifications = await Notification.find({
      publishStatus: 'published',
      isDeleted: false,
      $and: [
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
        {
          $or: [
            { branchId: null },
            context.branchId ? { branchId: context.branchId } : { branchId: null }
          ]
        },
        {
          $or: [
            { recipientRoles: { $size: 0 }, recipientIds: { $size: 0 } },
            { recipientRoles: { $in: ['student', 'family_student', 'all'] } },
            { recipientIds: context.userId }
          ]
        },
        {
          $or: [
            { classId: null },
            ...(allowedClassIds.length ? [{ classId: { $in: allowedClassIds } }] : [])
          ]
        },
        {
          $or: [
            { subjectId: null },
            ...(allowedSubjectIds.length ? [{ subjectId: { $in: allowedSubjectIds } }] : [])
          ]
        },
        {
          $or: [
            { teacherId: null },
            context.teacherId ? { teacherId: context.teacherId } : { teacherId: null }
          ]
        }
      ]
    })
      .populate('classId', 'className name classCode')
      .populate('subjectId', 'title name subjectName')
      .populate('teacherId', 'name email')
      .sort({ pinned: -1, publishDate: -1, createdAt: -1 })
      .limit(maxItems)
      .lean<AnyRecord[]>();
    ok(res, notifications.map((item) => notificationDto(item, lang)));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/student/messages', async (req, res, next) => {
  try {
    const records = await Message.find({
      $or: [{ senderId: req.user?.userId }, { recipientId: req.user?.userId }, { recipientRole: 'student' }],
      isDeleted: false
    }).sort({ createdAt: -1 }).limit(maxItems).lean<AnyRecord[]>();
    ok(res, records.map((item) => messageDto(item, req.user?.userId)));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/student/classes/discover', async (_req, res, next) => {
  try {
    const classes = await ClassModel.find({
      isDeleted: false,
      active: true,
      registrationOpen: { $ne: false }
    })
      .select('className name title room weeklySchedule studentCount description shortDescription genderRestriction feeAmount imageUrl category level')
      .sort({ featured: -1, className: 1 })
      .limit(maxItems)
      .lean<AnyRecord[]>();
    ok(res, classes.map((item) => ({
      ...classDto(item),
      feeAmount: Number(item.feeAmount ?? 0),
      imageUrl: item.imageUrl ?? '',
      category: item.category ?? item.level ?? ''
    })));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/student/chat/contacts', async (req, res, next) => {
  try {
    const context = await currentStudentContext(req);
    if (!context?.classId) return ok(res, { classmates: [], teachers: [], admins: [], groups: [] });

    const classmates = await Student.find({
      _id: { $ne: context.studentId },
      classId: context.classId,
      status: 'active',
      isDeleted: false
    }).select('firstName lastName studentId profileImage classId').limit(80).lean<AnyRecord[]>();
    const classmateUsers = await Promise.all(classmates.map((item) => studentUserForStudentId(item._id)));

    const classDoc = await ClassModel.findById(context.classId)
      .select('className assignedTeachers teacherId')
      .populate('assignedTeachers', 'name email profileImage role')
      .populate('teacherId', 'name email profileImage role')
      .lean<AnyRecord>();
    const teacherDocs = [
      classDoc?.teacherId,
      ...(Array.isArray(classDoc?.assignedTeachers) ? classDoc.assignedTeachers : [])
    ].filter(Boolean);
    const teachersById = new Map<string, AnyRecord>();
    teacherDocs.forEach((teacher: AnyRecord) => teachersById.set(String(teacher._id), teacher));
    if (context.teacherId && !teachersById.has(String(context.teacherId))) {
      const teacher = await User.findById(context.teacherId).select('name email profileImage role').lean<AnyRecord>();
      if (teacher) teachersById.set(String(teacher._id), teacher);
    }

    const admins = await User.find({
      role: { $in: ['super_admin', 'admin', 'branch_manager'] },
      isDeleted: false,
      active: { $ne: false },
      $or: [{ branchId: context.branchId }, { role: { $in: ['super_admin', 'admin'] } }]
    }).select('name email role profileImage').limit(20).lean<AnyRecord[]>();

    const classmatesPayload = classmates.map((student, index) => ({
        id: String(classmateUsers[index]?._id ?? student._id),
        studentId: String(student._id),
        name: `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim(),
        role: 'classmate',
        profileImage: student.profileImage ?? ''
      })).filter((item) => item.id);
    const teachersPayload = Array.from(teachersById.values()).map((teacher) => ({
        id: String(teacher._id),
        name: teacher.name ?? 'Teacher',
        role: 'teacher',
        profileImage: teacher.profileImage ?? ''
      }));
    const adminsPayload = admins.map((admin) => ({
        id: String(admin._id),
        name: admin.name ?? 'Admin',
        role: 'admin',
        profileImage: admin.profileImage ?? ''
      }));
    const groupsPayload = [{
        id: String(context.classId),
        name: classDoc?.className ?? 'Class group',
        role: 'class_group'
      }];

    const recentMessages = await Message.find({
      isDeleted: false,
      $or: [
        { senderId: context.userId },
        { recipientId: context.userId },
        { classId: context.classId, messageType: { $in: ['student_to_class_group', 'student_resource_share'] } }
      ]
    }).sort({ createdAt: -1 }).limit(300).lean<AnyRecord[]>();

    const decorateContact = (contact: AnyRecord) => {
      const relevant = contact.role === 'class_group'
        ? recentMessages.filter((item) => String(item.classId ?? '') === String(contact.id))
        : recentMessages.filter((item) => {
          const senderId = String(item.senderId ?? '');
          const recipientId = String(item.recipientId ?? '');
          return senderId === String(contact.id) || recipientId === String(contact.id);
        });
      const last = relevant[0];
      const unreadCount = relevant.filter((item) => (
        item.status === 'unread' &&
        String(item.senderId ?? '') !== String(context.userId) &&
        (contact.role === 'class_group' || String(item.recipientId ?? '') === String(context.userId))
      )).length;
      return {
        ...contact,
        lastMessage: last?.body ?? '',
        timestamp: compactDate(last?.createdAt),
        status: last?.status ?? '',
        unreadCount
      };
    };

    ok(res, {
      classmates: classmatesPayload.map(decorateContact),
      teachers: teachersPayload.map(decorateContact),
      admins: adminsPayload.map(decorateContact),
      groups: groupsPayload.map(decorateContact)
    });
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/student/chat/messages', async (req, res, next) => {
  try {
    const context = await currentStudentContext(req);
    if (!context?.userId) return ok(res, []);
    const targetId = String(req.query.targetId ?? '');
    const targetType = String(req.query.targetType ?? '');
    const filter: AnyRecord = { isDeleted: false };
    if (targetType === 'class_group' && context.classId && targetId === String(context.classId)) {
      filter.classId = context.classId;
      filter.messageType = {
        $in: [
          'student_to_class_group',
          'student_resource_share',
          'teacher_to_class_group',
          'teacher_resource_share'
        ]
      };
    } else {
      const targetObjectId = objectId(targetId);
      if (!targetObjectId) return ok(res, []);
      filter.$or = [
        { senderId: context.userId, recipientId: targetObjectId },
        { senderId: targetObjectId, recipientId: context.userId }
      ];
      await Message.updateMany(
        {
          senderId: targetObjectId,
          recipientId: context.userId,
          status: 'unread',
          isDeleted: false
        },
        { status: 'read', readAt: new Date() }
      );
    }
    const records = await Message.find(filter)
      .sort({ createdAt: 1 })
      .limit(200)
      .populate('senderId', 'name role profileImage')
      .populate('recipientId', 'name role profileImage')
      .lean<AnyRecord[]>();
    ok(res, records.map((item) => ({
      ...chatMessageDto(item),
      isMine: String(item.senderId?._id ?? item.senderId) === String(context.userId)
    })));
  } catch (error) {
    next(error);
  }
});

mobileRouter.post('/student/chat/messages', async (req, res, next) => {
  try {
    const context = await currentStudentContext(req);
    if (!context?.userId || !context.studentId) {
      return res.status(403).json({ success: false, message: 'Student profile not found' });
    }
    const targetType = String(req.body?.targetType ?? '');
    const targetId = String(req.body?.targetId ?? '');
    const body = String(req.body?.message ?? '').trim();
    if (!body) return res.status(400).json({ success: false, message: 'Message is required' });

    let recipientId: mongoose.Types.ObjectId | null = null;
    let recipientRole = '';
    let targetGroup = '';
    let messageType = 'student_to_teacher';

    if (targetType === 'classmate') {
      const classmateUserId = objectId(targetId);
      const classmateUser = classmateUserId
        ? await User.findOne({ _id: classmateUserId, role: 'student', isDeleted: false }).select('studentId').lean<AnyRecord>()
        : null;
      const classmate = classmateUser?.studentId
        ? await Student.findOne({ studentId: classmateUser.studentId, classId: context.classId, isDeleted: false }).select('_id').lean<AnyRecord>()
        : null;
      if (!classmate) return res.status(403).json({ success: false, message: 'Classmate access denied' });
      recipientId = classmateUserId;
      recipientRole = 'student';
      messageType = 'student_to_student';
    } else if (targetType === 'teacher') {
      const teacherId = objectId(targetId);
      const allowed = teacherId && (String(teacherId) === String(context.teacherId) || await ClassModel.exists({ _id: context.classId, assignedTeachers: teacherId }));
      if (!allowed) return res.status(403).json({ success: false, message: 'Teacher access denied' });
      recipientId = teacherId;
      recipientRole = 'teacher';
      messageType = 'student_to_teacher';
    } else if (targetType === 'admin') {
      const adminId = objectId(targetId);
      const admin = adminId ? await User.findOne({ _id: adminId, role: { $in: ['super_admin', 'admin', 'branch_manager'] }, isDeleted: false }).lean<AnyRecord>() : null;
      if (!admin) return res.status(403).json({ success: false, message: 'Admin access denied' });
      recipientId = adminId;
      recipientRole = 'admin';
      targetGroup = 'admin';
      messageType = 'student_to_admin';
    } else if (targetType === 'class_group' && targetId === String(context.classId)) {
      targetGroup = 'class_group';
      recipientRole = 'student';
      messageType = 'student_to_class_group';
    } else {
      return res.status(400).json({ success: false, message: 'Invalid chat target' });
    }

    const item = await Message.create({
      senderId: context.userId,
      senderRole: 'student',
      recipientId,
      recipientRole,
      targetGroup,
      studentId: context.studentId,
      teacherId: targetType === 'teacher' ? recipientId : context.teacherId,
      branchId: context.branchId,
      classId: context.classId,
      subject: String(req.body?.subject ?? 'Student chat').slice(0, 200),
      body,
      category: 'student',
      messageType,
      attachments: Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 5) : [],
      status: 'unread',
      priority: 'normal'
    });
    return ok(res, { ...chatMessageDto(item.toObject()), isMine: true });
  } catch (error) {
    return next(error);
  }
});

mobileRouter.post('/student/resources/share', async (req, res, next) => {
  try {
    const context = await currentStudentContext(req);
    if (!context?.userId || !context.studentId) return res.status(403).json({ success: false, message: 'Student profile not found' });
    const targetType = String(req.body?.targetType ?? '');
    const targetId = String(req.body?.targetId ?? '');
    const title = String(req.body?.title ?? 'Shared resource').trim().slice(0, 200);
    const description = String(req.body?.description ?? '').trim().slice(0, 2000);
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 5).map(String) : [];
    if (!description && !attachments.length) return res.status(400).json({ success: false, message: 'Resource content is required' });
    const created = await Message.create({
      senderId: context.userId,
      senderRole: 'student',
      recipientId: targetType === 'teacher' ? objectId(targetId) : null,
      recipientRole: targetType === 'teacher' ? 'teacher' : 'student',
      targetGroup: targetType === 'class_group' ? 'class_group' : '',
      studentId: context.studentId,
      teacherId: targetType === 'teacher' ? objectId(targetId) : context.teacherId,
      branchId: context.branchId,
      classId: context.classId,
      subject: title,
      body: description || title,
      category: 'academic',
      messageType: 'student_resource_share',
      attachments,
      status: 'unread'
    });
    ok(res, chatMessageDto(created.toObject()));
  } catch (error) {
    next(error);
  }
});

mobileRouter.post('/student/ai-assistant', async (req, res, next) => {
  try {
    const context = await currentStudentContext(req);
    if (!context) return res.status(403).json({ success: false, message: 'Student profile not found' });
    const prompt = String(req.body?.prompt ?? '').trim();
    const lang = String(req.body?.lang ?? 'en');
    if (!prompt) return res.status(400).json({ success: false, message: 'Prompt is required' });
    const [klass, subject] = await Promise.all([
      context.classId ? ClassModel.findById(context.classId).select('className classCode').lean<AnyRecord>() : null,
      objectId(context.student.subjectId) ? Subject.findById(context.student.subjectId).select('title code').lean<AnyRecord>() : null
    ]);
    ok(res, {
      title: 'Student AI Assistant',
      answer: [
        `Class: ${klass?.className ?? 'Your class'}`,
        `Subject: ${subject?.title ?? 'Your subject'}`,
        `Focus: ${prompt}`,
        'Recommended study plan: review today notes, solve 3 practice questions, ask your teacher one specific question, and summarize what you learned.',
        lang === 'fa' ? 'پیشنهاد: پاسخ را کوتاه یادداشت کنید و با معلم شریک سازید.' : '',
        lang === 'ps' ? 'سپارښتنه: لنډ یادښت جوړ کړئ او له ښوونکي سره یې شریک کړئ.' : ''
      ].filter(Boolean).join('\n')
    });
  } catch (error) {
    next(error);
  }
});

mobileRouter.post('/student/teacher-ratings', async (req, res, next) => {
  try {
    const context = await currentStudentContext(req);
    if (!context?.userId || !context.studentId || !context.classId) return res.status(403).json({ success: false, message: 'Student profile not found' });
    const teacherId = objectId(req.body?.teacherId) ?? context.teacherId;
    const rating = Number(req.body?.rating ?? 0);
    const comment = String(req.body?.comment ?? '').trim().slice(0, 1200);
    const allowed = teacherId && (String(teacherId) === String(context.teacherId) || await ClassModel.exists({ _id: context.classId, assignedTeachers: teacherId }));
    if (!allowed) return res.status(403).json({ success: false, message: 'Teacher access denied' });
    if (rating < 1 || rating > 5) return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    const item = await TeacherRating.findOneAndUpdate(
      {
        studentId: context.studentId,
        teacherId,
        classId: context.classId,
        isDeleted: false
      },
      {
        studentId: context.studentId,
        studentUserId: context.userId,
        teacherId,
        classId: context.classId,
        branchId: context.branchId,
        rating,
        comment,
        status: 'pending_admin_review'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    ok(res, { id: String(item._id), status: item.status, rating: item.rating });
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/parent/dashboard', async (req, res, next) => {
  try {
    const { parent, family, studentIds } = await currentParentScope(req);
    const [students, payments] = await Promise.all([
      studentIds.length ? Student.find({ _id: { $in: studentIds }, isDeleted: false }).lean<AnyRecord[]>() : Promise.resolve([]),
      studentIds.length ? Payment.find({ studentId: { $in: studentIds }, status: { $in: ['pending'] }, isDeleted: false }).lean<AnyRecord[]>() : Promise.resolve([])
    ]);
    const studentUserIds = await studentUserIdsForStudentRecords(studentIds);
    const classIds = Array.from(new Set(
      students
        .map((item) => objectId(item.classId?._id ?? item.classId))
        .filter((id): id is mongoose.Types.ObjectId => Boolean(id))
    ));
    const now = new Date();
    const parentUserId = objectId(req.user?.userId);
    const classAudience: AnyRecord[] = [];
    if (classIds.length) classAudience.push({ classId: { $in: classIds } });
    if (parentUserId) classAudience.push({ recipientIds: parentUserId });

    const [attendanceCount, presentCount, results, announcements] = await Promise.all([
      studentIds.length ? Attendance.countDocuments({ studentId: { $in: studentIds }, isDeleted: false }) : Promise.resolve(0),
      studentIds.length ? Attendance.countDocuments({ studentId: { $in: studentIds }, status: 'present', isDeleted: false }) : Promise.resolve(0),
      studentUserIds.length ? Result.find({ student: { $in: studentUserIds }, isDeleted: false }).select('score').lean<AnyRecord[]>() : Promise.resolve([]),
      classAudience.length
        ? Notification.find({
            publishStatus: 'published',
            isDeleted: false,
            $and: [
              { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
              {
                $or: [
                  { recipientRoles: { $in: ['parent'] } },
                  ...(parentUserId ? [{ recipientIds: parentUserId }] : [])
                ]
              },
              { $or: classAudience }
            ]
          })
            .populate('classId', 'className name')
            .populate('teacherId', 'name')
            .sort({ pinned: -1, publishDate: -1, createdAt: -1 })
            .limit(maxItems)
            .lean<AnyRecord[]>()
        : Promise.resolve([])
    ]);
    const averageScore = results.length
      ? Math.round(results.reduce((sum: number, item: AnyRecord) => sum + Number(item.score || 0), 0) / results.length)
      : 0;
    const feeAlerts = payments.length
      ? [{ title: 'Pending invoices', message: `${payments.length} payment(s) pending`, type: 'finance' }]
      : [];
    const announcementAlerts = announcements.map((item) => ({
      ...notificationDto(item, String(req.query.lang ?? 'en'), {
        viewerId: String(req.user?.userId ?? '')
      }),
      type: 'announcement',
      announcementTitle: resolveLocalizedText(item.title, String(req.query.lang ?? 'en'))
    }));
    ok(res, {
      familyName: parent?.guardianName ?? family?.guardianName ?? 'Family',
      studentsCount: students.length,
      linkedStudentsCount: students.length,
      pendingInvoices: payments.length,
      averageAttendance: attendanceCount ? Math.round((presentCount / attendanceCount) * 100) : 0,
      averageScore,
      announcementsCount: announcements.length,
      alerts: [...announcementAlerts, ...feeAlerts]
    });
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/parent/linked-students', async (req, res, next) => {
  try {
    const { studentIds } = await currentParentScope(req);
    const students = studentIds.length
      ? await Student.find({ _id: { $in: studentIds }, isDeleted: false }).populate('classId').lean<AnyRecord[]>()
      : [];
    ok(res, students.map((item) => ({
      id: String(item._id),
      _id: String(item._id),
      fullName: `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim(),
      className: item.classId?.className ?? '',
      status: item.status ?? 'active',
      attendancePercentage: 0,
      averageScore: 0
    })));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/parent/classes', async (req, res, next) => {
  try {
    const { studentIds } = await currentParentScope(req);
    const students = studentIds.length
      ? await Student.find({ _id: { $in: studentIds }, isDeleted: false }).select('classId').lean<AnyRecord[]>()
      : [];
    const classIds = Array.from(new Set(students.map((student) => String(student.classId ?? '')).filter(Boolean)))
      .map(objectId)
      .filter((id): id is mongoose.Types.ObjectId => Boolean(id));
    const classes = classIds.length
      ? await ClassModel.find({ _id: { $in: classIds }, isDeleted: false })
        .select('className name title room weeklySchedule studentCount description shortDescription genderRestriction')
        .lean<AnyRecord[]>()
      : [];
    ok(res, classes.map((item) => classDto(item)));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/parent/schedule', async (req, res, next) => {
  try {
    const { studentIds } = await currentParentScope(req);
    const students = studentIds.length
      ? await Student.find({ _id: { $in: studentIds }, isDeleted: false }).select('classId').lean<AnyRecord[]>()
      : [];
    const classIds = Array.from(new Set(students.map((student) => String(student.classId ?? '')).filter(Boolean)))
      .map(objectId)
      .filter((id): id is mongoose.Types.ObjectId => Boolean(id));
    const classes = classIds.length
      ? await ClassModel.find({ _id: { $in: classIds }, isDeleted: false }).select('className name title room weeklySchedule').lean<AnyRecord[]>()
      : [];
    ok(res, classes.flatMap((item) => (item.weeklySchedule ?? []).map((slot: AnyRecord) => ({
      id: `${item._id}-${slot.dayOfWeek}-${slot.startTime}`,
      title: item.className ?? item.name ?? 'Class',
      subject: item.className ?? item.name ?? 'Class',
      room: item.room ?? '',
      dayLabel: String(slot.dayOfWeek ?? ''),
      timeLabel: `${slot.startTime ?? ''}-${slot.endTime ?? ''}`,
      mode: 'onsite'
    }))));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/parent/attendance', async (req, res, next) => {
  try {
    const { studentIds } = await currentParentScope(req);
    const records = studentIds.length
      ? await Attendance.find({ studentId: { $in: studentIds }, isDeleted: false }).sort({ attendanceDate: -1 }).limit(maxItems).lean<AnyRecord[]>()
      : [];
    ok(res, records.map((item) => ({ ...item, id: String(item._id), dateLabel: compactDate(item.attendanceDate) })));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/parent/progress', async (req, res, next) => {
  try {
    const { studentIds } = await currentParentScope(req);
    const studentUserIds = await studentUserIdsForStudentRecords(studentIds);
    const results = studentUserIds.length
      ? await Result.find({ student: { $in: studentUserIds }, isDeleted: false })
        .populate('student', 'name studentId')
        .populate('exam', 'title date totalMarks examType')
        .populate('subjectId', 'title name')
        .sort({ createdAt: -1 })
        .limit(maxItems)
        .lean<AnyRecord[]>()
      : [];
    ok(res, results.map((item) => ({
      ...item,
      id: String(item._id),
      averageScore: item.score,
      title: item.exam?.title ?? item.subjectId?.title ?? 'Result',
      studentName: item.student?.name ?? '',
      subjectName: item.subjectId?.title ?? item.subjectId?.name ?? '',
      examType: item.exam?.examType ?? item.examType ?? '',
      status: Number(item.score ?? 0) >= 50 ? 'passed' : 'failed'
    })));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/parent/exams', async (req, res, next) => {
  try {
    const { studentIds } = await currentParentScope(req);
    const studentUserIds = await studentUserIdsForStudentRecords(studentIds);
    const results = studentUserIds.length
      ? await Result.find({ student: { $in: studentUserIds }, isDeleted: false })
        .populate('student', 'name studentId')
        .populate('exam', 'title date totalMarks examType')
        .populate('subjectId', 'title name')
        .sort({ createdAt: -1 })
        .limit(maxItems)
        .lean<AnyRecord[]>()
      : [];
    ok(res, results.map((item) => ({
      ...item,
      id: String(item._id),
      averageScore: item.score,
      title: item.exam?.title ?? item.subjectId?.title ?? 'Exam result',
      studentName: item.student?.name ?? '',
      subjectName: item.subjectId?.title ?? item.subjectId?.name ?? '',
      examType: item.exam?.examType ?? item.examType ?? '',
      examDate: compactDate(item.exam?.date)
    })));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/parent/finance', async (req, res, next) => {
  try {
    const { studentIds } = await currentParentScope(req);
    const payments = studentIds.length
      ? await Payment.find({ studentId: { $in: studentIds }, isDeleted: false }).sort({ paymentDate: -1 }).limit(maxItems).lean<AnyRecord[]>()
      : [];
    ok(res, payments.map((item) => ({ ...item, id: String(item._id), amountAf: item.amount, dueDateLabel: compactDate(item.paymentDate), reference: item.invoiceNumber })));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/parent/messages', async (req, res, next) => {
  try {
    const records = await Message.find({
      $or: [{ senderId: req.user?.userId }, { recipientId: req.user?.userId }, { recipientRole: 'parent' }],
      isDeleted: false
    }).sort({ createdAt: -1 }).limit(maxItems).lean<AnyRecord[]>();
    ok(res, records.map((item) => messageDto(item, req.user?.userId)));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/teacher/dashboard', async (req, res, next) => {
  try {
    const userId = objectId(req.user?.userId);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const lang = String(req.query.lang || 'en');

    const [user, teacher] = await Promise.all([
      currentUser(req),
      currentTeacher(req)
    ]);

    const assignedClassIds = Array.isArray(teacher?.assignedClassIds)
      ? teacher.assignedClassIds.map(objectId).filter((id): id is mongoose.Types.ObjectId => Boolean(id))
      : [];
    const assignedSubjectIds = Array.isArray(teacher?.assignedSubjectIds)
      ? teacher.assignedSubjectIds.map(objectId).filter((id): id is mongoose.Types.ObjectId => Boolean(id))
      : [];

    const classScope: AnyRecord[] = [
      { teacherId: userId },
      { assignedTeachers: userId }
    ];
    if (assignedClassIds.length) classScope.push({ _id: { $in: assignedClassIds } });

    const classes = await ClassModel.find({
      $or: classScope,
      isDeleted: false
    })
      .populate('subjectId', 'title name subjectName')
      .populate('assignedSubjects', 'title name subjectName')
      .sort({ createdAt: -1 })
      .limit(maxItems)
      .lean<AnyRecord[]>();

    const classIds = classes.map((item) => objectId(item._id)).filter((id): id is mongoose.Types.ObjectId => Boolean(id));
    const classSubjectIds = classes.flatMap((item) => [
      objectId(item.subjectId?._id ?? item.subjectId),
      ...(Array.isArray(item.assignedSubjects)
        ? item.assignedSubjects.map((subject: AnyRecord) => objectId(subject?._id ?? subject))
        : [])
    ]).filter((id): id is mongoose.Types.ObjectId => Boolean(id));
    const subjectIds = Array.from(
      new Map([...assignedSubjectIds, ...classSubjectIds].map((id) => [String(id), id])).values()
    );

    const examScope: AnyRecord[] = [{ teacherId: userId }];
    if (classIds.length) examScope.push({ class: { $in: classIds } });
    if (subjectIds.length) examScope.push({ subject: { $in: subjectIds } });

    const messageScope: AnyRecord[] = [
      { senderId: userId },
      { recipientId: userId },
      { teacherId: userId },
      { recipientRole: 'teacher' },
      { targetGroup: 'teacher' }
    ];
    if (classIds.length) messageScope.push({ classId: { $in: classIds } });

    const notificationScope: AnyRecord[] = [
      { teacherId: userId },
      { recipientIds: userId },
      { recipientRoles: 'teacher' }
    ];
    if (classIds.length) notificationScope.push({ classId: { $in: classIds } });
    if (subjectIds.length) notificationScope.push({ subjectId: { $in: subjectIds } });

    const [
      assignedStudentsCount,
      courses,
      subjects,
      timetable,
      attendance,
      exams,
      salary,
      messages,
      notifications
    ] = await Promise.all([
      (async () => {
        const [directIds, classBasedIds, enrollmentIds] = await Promise.all([
          Student.distinct('_id', {
            teacherId: userId,
            status: 'active',
            isDeleted: false
          }),
          classIds.length
            ? Student.distinct('_id', {
              classId: { $in: classIds },
              status: 'active',
              isDeleted: false
            })
            : Promise.resolve([] as mongoose.Types.ObjectId[]),
          classIds.length
            ? Enrollment.distinct('studentId', {
              classId: { $in: classIds },
              status: 'active',
              isDeleted: { $ne: true }
            })
            : Promise.resolve([] as mongoose.Types.ObjectId[])
        ]);
        const unique = new Set<string>();
        directIds.forEach((id) => unique.add(String(id)));
        classBasedIds.forEach((id) => unique.add(String(id)));
        enrollmentIds.forEach((id) => unique.add(String(id)));
        return unique.size;
      })(),
      Course.find({
        isDeleted: false,
        $or: [
          { instructor: userId },
          { teacher: userId },
          ...(classIds.length ? [{ linkedClassId: { $in: classIds } }] : []),
          ...(subjectIds.length ? [{ subjects: { $in: subjectIds } }] : [])
        ]
      })
        .select('title linkedClassId subjects instructor teacher status')
        .limit(maxItems)
        .lean<AnyRecord[]>(),
      subjectIds.length
        ? Subject.find({ _id: { $in: subjectIds }, isDeleted: false })
          .select('title name subjectName')
          .limit(maxItems)
          .lean<AnyRecord[]>()
        : Promise.resolve([]),
      Timetable.find({ teacherId: userId, isDeleted: false, active: { $ne: false }, isActive: { $ne: false } })
        .select('classId subjectId dayOfWeek startTime endTime room deliveryMode onlineLink')
        .sort({ dayOfWeek: 1, startTime: 1 })
        .limit(maxItems)
        .lean<AnyRecord[]>(),
      Attendance.find({
        isDeleted: false,
        $or: [
          { teacherId: userId },
          ...(classIds.length ? [{ classId: { $in: classIds } }] : [])
        ]
      })
        .select('studentId classId subjectId status attendanceDate session')
        .sort({ attendanceDate: -1 })
        .limit(500)
        .lean<AnyRecord[]>(),
      Exam.find({ isDeleted: false, $or: examScope })
        .select('title date totalMarks passingMarks subject class teacherId status')
        .sort({ date: -1 })
        .limit(maxItems)
        .lean<AnyRecord[]>(),
      SalaryRecord.findOne({
        userId,
        role: 'teacher',
        isDeleted: false
      })
        .sort({ hijriYear: -1, hijriMonth: -1, calculatedAt: -1 })
        .lean<AnyRecord>(),
      Message.find({ isDeleted: false, $or: messageScope })
        .select('senderId recipientId senderName senderRole recipientRole subject body status createdAt classId')
        .sort({ createdAt: -1 })
        .limit(maxItems)
        .lean<AnyRecord[]>(),
      Notification.find({
        publishStatus: 'published',
        isDeleted: false,
        $or: notificationScope
      })
        .select('title message description category publishDate createdAt teacherId classId subjectId priority pinned')
        .sort({ pinned: -1, publishDate: -1, createdAt: -1 })
        .limit(maxItems)
        .lean<AnyRecord[]>()
    ]);

    const examIds = exams.map((item) => objectId(item._id)).filter((id): id is mongoose.Types.ObjectId => Boolean(id));
    const [examResults, legacyResults] = await Promise.all([
      examIds.length
        ? ExamResult.find({ examId: { $in: examIds }, isDeleted: false })
          .select('studentId examId subjectId score grade passed publishedAt')
          .limit(500)
          .lean<AnyRecord[]>()
        : Promise.resolve([]),
      Result.find({
        isDeleted: false,
        $or: [
          { teacherId: userId },
          ...(classIds.length ? [{ classId: { $in: classIds } }] : []),
          ...(subjectIds.length ? [{ subjectId: { $in: subjectIds } }] : []),
          ...(examIds.length ? [{ exam: { $in: examIds } }] : [])
        ]
      })
        .select('student exam classId subjectId teacherId score grade publishedAt')
        .limit(500)
        .lean<AnyRecord[]>()
    ]);

    const classById = new Map(classes.map((item) => [String(item._id), item]));
    const subjectById = new Map(subjects.map((item) => [String(item._id), item]));
    const examById = new Map(exams.map((item) => [String(item._id), item]));
    const subjectName = (id: string) => {
      const subject = subjectById.get(id);
      return resolveLocalizedText(subject?.title ?? subject?.name ?? subject?.subjectName, lang);
    };
    const today = new Date();
    const todayDay = today.getDay();
    const presentStatuses = new Set(['present', 'late', 'online_auto_marked']);
    const attendanceRate = attendance.length
      ? Math.round((attendance.filter((item) => presentStatuses.has(String(item.status))).length / attendance.length) * 100)
      : null;
    const pendingAttendance = timetable.filter((item) => Number(item.dayOfWeek) === todayDay).length;
    const pendingGrades = exams.filter((exam) => {
      const examResultCount = examResults.filter((result) => String(result.examId) === String(exam._id)).length;
      return assignedStudentsCount > 0 && examResultCount < assignedStudentsCount;
    }).length;

    const subjectScores = new Map<string, { total: number; count: number; subjectName: string; className: string; examTitle: string }>();
    for (const result of examResults) {
      const exam = examById.get(String(result.examId));
      const subjectId = String(result.subjectId ?? exam?.subject ?? '');
      const key = subjectId || String(result.examId);
      const current = subjectScores.get(key) ?? {
        total: 0,
        count: 0,
        subjectName: subjectName(subjectId),
        className: classById.get(String(exam?.class))?.className ?? classById.get(String(exam?.class))?.name ?? '',
        examTitle: exam?.title ?? ''
      };
      current.total += Number(result.score ?? 0);
      current.count += 1;
      subjectScores.set(key, current);
    }
    for (const result of legacyResults) {
      const exam = examById.get(String(result.exam));
      const subjectId = String(result.subjectId ?? exam?.subject ?? '');
      const classId = String(result.classId ?? exam?.class ?? '');
      const key = subjectId || String(result.exam);
      const current = subjectScores.get(key) ?? {
        total: 0,
        count: 0,
        subjectName: subjectName(subjectId),
        className: classById.get(classId)?.className ?? classById.get(classId)?.name ?? '',
        examTitle: exam?.title ?? ''
      };
      current.total += Number(result.score ?? 0);
      current.count += 1;
      subjectScores.set(key, current);
    }

    const analytics = Array.from(subjectScores.entries()).map(([id, item], index) => ({
      id,
      title: item.subjectName || item.examTitle || `trend-${index + 1}`,
      subjectName: item.subjectName,
      className: item.className,
      examTitle: item.examTitle,
      averageScore: item.count ? Math.round((item.total / item.count) * 10) / 10 : 0,
      studentCount: item.count,
      attendanceRate,
      type: 'student_trend'
    })).sort((a, b) => b.averageScore - a.averageScore).slice(0, 6);

    const upcomingExams = exams
      .filter((exam) => exam.date && new Date(exam.date).getTime() >= Date.now())
      .slice(0, 3);
    const recentMessages = messages.slice(0, 3);
    const recentNotifications = notifications.slice(0, 3);
    const classHighlights = classes.slice(0, 3).map((item) => ({
      id: String(item._id),
      title: item.className ?? item.name ?? '',
      message: classSchedule(item),
      className: item.className ?? item.name ?? '',
      meta: classSchedule(item),
      type: 'class'
    }));
    const highlights = [
      ...classHighlights,
      ...upcomingExams.map((exam) => ({
        id: String(exam._id),
        title: exam.title ?? '',
        message: compactDate(exam.date),
        examTitle: exam.title ?? '',
        meta: compactDate(exam.date),
        type: 'exam'
      })),
      ...recentMessages.map((message) => ({
        id: String(message._id),
        title: message.subject ?? message.senderName ?? '',
        message: message.body ?? '',
        meta: compactDate(message.createdAt),
        status: message.status ?? '',
        type: 'message'
      })),
      ...recentNotifications.map((notification) => ({
        id: String(notification._id),
        title: resolveLocalizedText(notification.title, lang),
        message: resolveLocalizedText(notification.message ?? notification.description, lang),
        meta: compactDate(notification.publishDate ?? notification.createdAt),
        type: 'announcement'
      }))
    ].filter((item) => String(item.title ?? '').trim()).slice(0, 8);

    const branchId = objectId(teacher?.branchId ?? user?.branchId);
    const branch = branchId
      ? await Branch.findById(branchId).select('name code').lean<AnyRecord>()
      : null;

    ok(res, {
      teacherId: String(userId),
      teacherProfileId: String(teacher?._id ?? ''),
      teacherName: user?.name ?? '',
      teacherCode: teacher?.teacherCode ?? '',
      branchName: branch?.name ?? '',
      employmentStatus: teacher?.active === false ? 'inactive' : (user?.status ?? 'active'),
      gender: teacher?.gender ?? '',
      salaryType: teacher?.salaryType ?? '',
      todayClasses: pendingAttendance,
      assignedStudents: assignedStudentsCount,
      assignedClasses: classes.length,
      assignedCourses: courses.length,
      assignedSubjects: subjectIds.length || subjects.length,
      timetableSessions: timetable.length,
      attendanceRecords: attendance.length,
      examsCount: exams.length,
      resultsCount: examResults.length + legacyResults.length,
      messagesCount: messages.length,
      unreadMessages: messages.filter((item) => item.status === 'unread' && String(item.recipientId ?? '') === String(userId)).length,
      announcementsCount: notifications.length,
      attendanceRate,
      pendingAttendance,
      pendingGrades,
      monthlySalaryAf: Number(
        salary?.netSalary ??
          salary?.netAmount ??
          teacher?.fixedSalary ??
          user?.fixedSalary ??
          0
      ),
      salaryPeriod: salary?.hijriYear && salary?.hijriMonth
        ? `${salary.hijriYear}-${String(salary.hijriMonth).padStart(2, '0')}`
        : salary?.monthKey ?? '',
      salaryPaymentStatus: (() => {
        const net = Number(salary?.netSalary ?? salary?.netAmount ?? 0);
        const paid = Number(salary?.paidAmount ?? 0);
        const status = String(salary?.paymentStatus ?? salary?.status ?? '').toLowerCase();
        if (status === 'paid' || (net > 0 && paid >= net - 0.009)) return 'paid';
        if (paid > 0 && paid < net - 0.009) return 'partially_paid';
        if (status === 'pending') return 'pending';
        return 'unpaid';
      })(),
      salaryPaidAmountAf: Number(salary?.paidAmount ?? 0),
      salaryRemainingAmountAf: Number(
        Math.max(
          0,
          Number(salary?.netSalary ?? salary?.netAmount ?? 0) - Number(salary?.paidAmount ?? 0)
        ).toFixed(2)
      ),
      highlights,
      analytics,
      summary: {
        students: assignedStudentsCount,
        classes: classes.length,
        courses: courses.length,
        subjects: subjectIds.length || subjects.length,
        timetable: timetable.length,
        attendance: attendance.length,
        exams: exams.length,
        results: examResults.length + legacyResults.length,
        messages: messages.length,
        announcements: notifications.length,
        attendanceRate
      }
    });
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/teacher/classes', async (req, res, next) => {
  try {
    const teacher = await currentTeacher(req);
    const teacherUserId = objectId(req.user?.userId);
    const assignedClassIds = Array.isArray(teacher?.assignedClassIds)
      ? teacher.assignedClassIds
        .map(objectId)
        .filter((id): id is mongoose.Types.ObjectId => Boolean(id))
      : [];
    const classScope: AnyRecord[] = [
      { teacherId: teacherUserId ?? req.user?.userId },
      { assignedTeachers: teacherUserId ?? req.user?.userId }
    ];
    if (assignedClassIds.length) {
      classScope.push({ _id: { $in: assignedClassIds } });
    }
    const classes = await ClassModel.find({ $or: classScope, isDeleted: false })
      .select('className name title classCode room weeklySchedule mode imageUrl thumbnailUrl galleryImages teacherId subjectId assignedTeachers assignedSubjects capacity description shortDescription genderRestriction startDate endDate active registrationOpen progress studentProgress courseName')
      .populate('subjectId', 'title name subjectName')
      .populate('teacherId', 'name firstName lastName')
      .limit(maxItems)
      .lean<AnyRecord[]>();
    const classIds = classes
      .map((item) => objectId(item._id))
      .filter((id): id is mongoose.Types.ObjectId => Boolean(id));
    const [countMap, timetableEntries] = await Promise.all([
      activeStudentCountsByClass(classIds),
      classIds.length
        ? Timetable.find({
          classId: { $in: classIds },
          isDeleted: false,
          active: { $ne: false },
          isActive: { $ne: false }
        })
          .select('classId subjectId teacherId dayOfWeek startTime endTime durationMinutes room deliveryMode onlineLink notes active isActive')
          .populate('subjectId', 'title name subjectName')
          .populate('teacherId', 'name firstName lastName')
          .sort({ dayOfWeek: 1, startTime: 1 })
          .lean<AnyRecord[]>()
        : Promise.resolve([])
    ]);
    const timetableByClass = new Map<string, AnyRecord[]>();
    timetableEntries.forEach((entry) => {
      const classId = String(entry.classId ?? '');
      if (!classId) return;
      const bucket = timetableByClass.get(classId) ?? [];
      bucket.push(entry);
      timetableByClass.set(classId, bucket);
    });
    ok(res, withClassStudentCounts(classes, countMap).map((item) =>
      classDto(item, { timetableByClass })
    ));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/teacher/courses', async (req, res, next) => {
  try {
    const teacherObjectId = objectId(req.user?.userId);
    if (!teacherObjectId) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }
    const language = String(req.query.lang || 'en');

    const [teacherClasses, teacherSubjects] = await Promise.all([
      ClassModel.find({
        $or: [{ teacherId: teacherObjectId }, { assignedTeachers: teacherObjectId }],
        isDeleted: false
      })
        .select('className name title classCode room subjectId assignedSubjects active schedule courseName')
        .populate('subjectId', 'title name subjectName')
        .populate('assignedSubjects', 'title name subjectName')
        .lean<AnyRecord[]>(),
      Subject.find({ teacher: teacherObjectId, isDeleted: false })
        .select('title name subjectName classId classIds code')
        .lean<AnyRecord[]>()
    ]);

    const classIds = teacherClasses
      .map((item) => objectId(item._id))
      .filter((id): id is mongoose.Types.ObjectId => Boolean(id));
    const subjectIdSet = new Set<string>();
    teacherSubjects.forEach((subject) => subjectIdSet.add(String(subject._id)));
    teacherClasses.forEach((klass) => {
      const primarySubjectId = klass.subjectId?._id ?? klass.subjectId;
      if (primarySubjectId) subjectIdSet.add(String(primarySubjectId));
      (Array.isArray(klass.assignedSubjects) ? klass.assignedSubjects : []).forEach((subject: AnyRecord) => {
        subjectIdSet.add(String(subject?._id ?? subject));
      });
    });
    const subjectIds = [...subjectIdSet]
      .map((id) => objectId(id))
      .filter((id): id is mongoose.Types.ObjectId => Boolean(id));

    const courseFilters: AnyRecord[] = [
      { $or: [{ teacher: teacherObjectId }, { instructor: teacherObjectId }] }
    ];
    if (classIds.length) courseFilters.push({ linkedClassId: { $in: classIds } });
    if (subjectIds.length) courseFilters.push({ subjects: { $in: subjectIds } });

    const courses = await Course.find({
      isDeleted: false,
      status: { $ne: 'archived' },
      $or: courseFilters
    })
      .populate('teacher', 'name firstName lastName')
      .populate('instructor', 'name firstName lastName')
      .populate('subjects', 'title name subjectName code')
      .populate('linkedClassId', 'className name title')
      .populate('branchId', 'name branchName')
      .sort({ startDate: 1, createdAt: -1 })
      .limit(maxItems)
      .lean<AnyRecord[]>();

    const countMap = classIds.length
      ? await activeStudentCountsByClass(classIds)
      : new Map<string, number>();

    const payload = await Promise.all(courses.map(async (course) => {
      const courseSubjectIds = new Set(
        (Array.isArray(course.subjects) ? course.subjects : []).map((subject: AnyRecord) =>
          String(subject?._id ?? subject)
        )
      );
      const linkedClassId = String(course.linkedClassId?._id ?? course.linkedClassId ?? '');

      const relatedClasses = teacherClasses
        .filter((klass) => {
          const classId = String(klass._id ?? '');
          if (linkedClassId && linkedClassId === classId) return true;
          const classSubjectIds = [
            String(klass.subjectId?._id ?? klass.subjectId ?? ''),
            ...(Array.isArray(klass.assignedSubjects) ? klass.assignedSubjects : []).map((subject: AnyRecord) =>
              String(subject?._id ?? subject)
            )
          ].filter(Boolean);
          return classSubjectIds.some((subjectId) => courseSubjectIds.has(subjectId));
        })
        .map((klass) => ({
          ...klass,
          enrolledStudentCount: countMap.get(String(klass._id)) ?? 0
        }));

      const relatedSubjects = teacherSubjects.filter((subject) =>
        courseSubjectIds.has(String(subject._id))
      );

      const relatedClassObjectIds = relatedClasses
        .map((klass) => objectId((klass as AnyRecord)._id))
        .filter((id): id is mongoose.Types.ObjectId => Boolean(id));
      const studentCount = await uniqueActiveStudentCountForClasses(relatedClassObjectIds);

      return teacherCourseDto(course, language, {
        relatedClasses,
        relatedSubjects,
        studentCount
      });
    }));

    ok(res, payload);
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/teacher/classes/:classId/participants', async (req, res, next) => {
  try {
    const classDoc = await teacherClassForRequest(req, req.params.classId);
    if (!classDoc) {
      return res.status(403).json({ success: false, message: 'Teacher is not assigned to this class' });
    }
    const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);
    const limit = Math.min(120, Math.max(1, Number(req.query.limit ?? 5) || 5));
    const classObjectId = objectId(classDoc._id);
    if (!classObjectId) {
      return res.status(400).json({ success: false, message: 'Invalid class reference' });
    }

    const allStudentIds = await activeStudentIdsForClass(classObjectId);
    const totalStudents = allStudentIds.length;
    const pageStudentIds = allStudentIds.slice(offset, offset + limit);
    const students = pageStudentIds.length
      ? await Student.find({
        _id: { $in: pageStudentIds },
        isDeleted: false,
        status: 'active'
      })
        .select('firstName lastName studentId profileImage parentProfileId classId')
        .sort({ firstName: 1, lastName: 1, studentId: 1 })
        .lean<AnyRecord[]>()
      : [];
    const studentObjectIds = students.map((item) => objectId(item._id)).filter(Boolean);
    const parentIds = students
      .map((item) => objectId(item.parentProfileId))
      .filter((id): id is mongoose.Types.ObjectId => Boolean(id));
    const [parents, timetableEntries, countMap] = await Promise.all([
      parentIds.length || studentObjectIds.length
        ? ParentProfile.find({
          isDeleted: false,
          $or: [
            parentIds.length ? { _id: { $in: parentIds } } : { _id: null },
            studentObjectIds.length ? { linkedStudentIds: { $in: studentObjectIds } } : { _id: null }
          ]
        }).select('guardianName guardianPhone guardianEmail linkedStudentIds').lean<AnyRecord[]>()
        : Promise.resolve([] as AnyRecord[]),
      Timetable.find({
        classId: classObjectId,
        isDeleted: false,
        active: { $ne: false },
        isActive: { $ne: false }
      })
        .select('classId subjectId teacherId dayOfWeek startTime endTime durationMinutes room deliveryMode onlineLink notes active isActive')
        .populate('subjectId', 'title name subjectName')
        .populate('teacherId', 'name firstName lastName')
        .sort({ dayOfWeek: 1, startTime: 1 })
        .lean<AnyRecord[]>(),
      activeStudentCountsByClass([classObjectId])
    ]);
    const parentsById = new Map(parents.map((parent) => [String(parent._id), parent]));
    const parentsByStudentId = new Map<string, AnyRecord>();
    parents.forEach((parent) => {
      (parent.linkedStudentIds ?? []).forEach((studentId: unknown) => {
        parentsByStudentId.set(String(studentId), parent);
      });
    });
    const timetableByClass = new Map<string, AnyRecord[]>([
      [String(classObjectId), timetableEntries]
    ]);
    const classPayload = withClassStudentCounts([classDoc], countMap)[0];
    ok(res, {
      class: classDto(classPayload, { timetableByClass }),
      students: students.map((student) => ({
        id: String(student._id),
        name: `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim() || 'Student',
        role: 'student',
        studentId: student.studentId ?? '',
        profileImage: student.profileImage ?? '',
        parentId: String(student.parentProfileId ?? '')
      })),
      parents: students
        .map((student) => parentDto(
          parentsById.get(String(student.parentProfileId)) ?? parentsByStudentId.get(String(student._id)) ?? null,
          student
        ))
        .filter((parent, index, list) => parent.id && list.findIndex((item) => item.id === parent.id) === index),
      totalStudents,
      offset,
      limit,
      hasMore: offset + students.length < totalStudents
    });
  } catch (error) {
    return next(error);
  }
});

mobileRouter.get('/teacher/parent-contacts', async (req, res, next) => {
  try {
    const teacherId = objectId(req.user?.userId);
    if (!teacherId) return ok(res, []);

    const classIds = await teacherAssignedClassIds(req.user?.userId);
    const studentScope: AnyRecord[] = [{ teacherId }];
    if (classIds.length) studentScope.push({ classId: { $in: classIds } });

    const students = await Student.find({
      $or: studentScope,
      isDeleted: false,
      status: { $ne: 'inactive' }
    })
      .select('firstName lastName studentId classId parentProfileId familyPhone whatsapp fatherName')
      .populate('classId', 'className name classCode')
      .limit(maxItems)
      .lean<AnyRecord[]>();

    const studentObjectIds = students.map((item) => objectId(item._id)).filter(Boolean);
    const parentIds = students
      .map((item) => objectId(item.parentProfileId))
      .filter((id): id is mongoose.Types.ObjectId => Boolean(id));

    const parents = parentIds.length || studentObjectIds.length
      ? await ParentProfile.find({
        isDeleted: false,
        $or: [
          parentIds.length ? { _id: { $in: parentIds } } : { _id: null },
          studentObjectIds.length ? { linkedStudentIds: { $in: studentObjectIds } } : { _id: null }
        ]
      }).select('userId guardianName guardianPhone guardianEmail relationType linkedStudentIds').lean<AnyRecord[]>()
      : [];

    const parentsById = new Map(parents.map((parent) => [String(parent._id), parent]));
    const parentsByStudentId = new Map<string, AnyRecord>();
    parents.forEach((parent) => {
      (parent.linkedStudentIds ?? []).forEach((studentId: unknown) => {
        parentsByStudentId.set(String(studentId), parent);
      });
    });

    ok(res, students
      .map((student) => parentDto(
        parentsById.get(String(student.parentProfileId)) ?? parentsByStudentId.get(String(student._id)) ?? null,
        student
      ))
      .filter((parent) => parent.id || parent.parentPhone)
      .filter((parent, index, list) => {
        const key = `${parent.parentId || parent.parentPhone}-${parent.studentId}`;
        return list.findIndex((item) => `${item.parentId || item.parentPhone}-${item.studentId}` === key) === index;
      }));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/teacher/students/:studentId/parent-contact', async (req, res, next) => {
  try {
    const teacherId = objectId(req.user?.userId);
    const studentDocId = objectId(req.params.studentId);
    if (!teacherId || !studentDocId) {
      return res.status(404).json({ success: false, message: 'Parent contact not found' });
    }

    const student = await teacherCanAccessStudent(teacherId, studentDocId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Parent contact not found' });
    }

    const populated = await Student.findById(student._id)
      .select('firstName lastName studentId classId parentProfileId familyPhone whatsapp fatherName')
      .populate('classId', 'className name classCode')
      .lean<AnyRecord>();

    if (!populated) {
      return res.status(404).json({ success: false, message: 'Parent contact not found' });
    }

    const parent = populated.parentProfileId
      ? await ParentProfile.findOne({
        _id: populated.parentProfileId,
        isDeleted: false
      }).select('userId guardianName guardianPhone guardianEmail relationType linkedStudentIds').lean<AnyRecord>()
      : await ParentProfile.findOne({
        linkedStudentIds: populated._id,
        isDeleted: false
      }).select('userId guardianName guardianPhone guardianEmail relationType linkedStudentIds').lean<AnyRecord>();

    ok(res, parentDto(parent, populated));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/teacher/parents/:parentId/whatsapp-qr', async (req, res, next) => {
  try {
    const teacherId = objectId(req.user?.userId);
    const parentId = objectId(req.params.parentId);
    if (!teacherId || !parentId) {
      return res.status(404).json({ success: false, message: 'Parent contact not found' });
    }

    const parent = await ParentProfile.findOne({
      _id: parentId,
      isDeleted: false
    }).select('guardianName guardianPhone guardianEmail linkedStudentIds').lean<AnyRecord>();
    if (!parent) {
      return res.status(404).json({ success: false, message: 'Parent contact not found' });
    }

    const linkedStudentIds = [
      ...((Array.isArray(parent.linkedStudentIds) ? parent.linkedStudentIds : [])
        .map(objectId)
        .filter((id): id is mongoose.Types.ObjectId => Boolean(id))),
      ...(await Student.find({
        parentProfileId: parentId,
        isDeleted: false
      }).select('_id').lean<AnyRecord[]>()).map((item) => objectId(item._id)).filter((id): id is mongoose.Types.ObjectId => Boolean(id))
    ];

    let linkedStudent: AnyRecord | null = null;
    for (const studentDocId of linkedStudentIds) {
      const accessible = await teacherCanAccessStudent(teacherId, studentDocId);
      if (accessible) {
        linkedStudent = accessible;
        break;
      }
    }

    if (!linkedStudent) {
      return res.status(403).json({ success: false, message: 'Parent is not linked to your students' });
    }

    const phoneSource = String(parent.guardianPhone ?? '').trim();
    const normalized = await normalizeAfghanWhatsappPhone(phoneSource);
    const whatsappUrl = normalized.whatsappUrl;
    const telUri = normalized.telUri;
    const qrCode = whatsappUrl || telUri;

    ok(res, {
      parentId: String(parentId),
      parentName: parent.guardianName ?? '',
      phone: normalized.phone || phoneSource,
      whatsapp: normalized.normalized || phoneSource,
      whatsappUrl,
      telUri,
      qrCode,
      url: qrCode,
      fallback: qrCode ? '' : 'No valid phone number is available for this parent.'
    });
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/teacher/classes/:classId/messages', async (req, res, next) => {
  try {
    const classDoc = await teacherClassForRequest(req, req.params.classId);
    if (!classDoc) {
      return res.status(403).json({ success: false, message: 'Teacher is not assigned to this class' });
    }
    const records = await Message.find({
      classId: classDoc._id,
      isDeleted: false,
      messageType: { $in: ['student_to_class_group', 'student_resource_share', 'teacher_to_class_group', 'teacher_resource_share'] }
    })
      .sort({ createdAt: 1 })
      .limit(250)
      .populate('senderId', 'name role profileImage')
      .lean<AnyRecord[]>();
    ok(res, records.map((item) => ({
      ...chatMessageDto(item),
      isMine: String(item.senderId?._id ?? item.senderId) === String(req.user?.userId)
    })));
  } catch (error) {
    return next(error);
  }
});

mobileRouter.post('/teacher/classes/:classId/messages', async (req, res, next) => {
  try {
    const classDoc = await teacherClassForRequest(req, req.params.classId);
    if (!classDoc) {
      return res.status(403).json({ success: false, message: 'Teacher is not assigned to this class' });
    }
    const user = await currentUser(req);
    const body = String(req.body?.message ?? req.body?.body ?? '').trim();
    if (!body) {
      return res.status(400).json({ success: false, message: 'Message body is required' });
    }
    const item = await Message.create({
      senderId: req.user?.userId,
      senderRole: 'teacher',
      senderName: user?.name ?? 'Teacher',
      senderEmail: user?.email ?? '',
      senderPhone: user?.phone ?? '',
      recipientId: null,
      recipientRole: 'student',
      targetGroup: 'class_group',
      teacherId: req.user?.userId,
      classId: classDoc._id,
      branchId: classDoc.branchId ?? req.user?.branchId ?? null,
      subject: String(req.body?.subject ?? classDoc.className ?? 'Class chat').slice(0, 200),
      body,
      category: 'teacher',
      messageType: 'teacher_to_class_group',
      attachments: Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 5).map(String) : [],
      status: 'unread',
      priority: 'normal'
    });
    return ok(res, { ...chatMessageDto(item.toObject()), isMine: true });
  } catch (error) {
    return next(error);
  }
});

mobileRouter.post('/teacher/resources/share', async (req, res, next) => {
  try {
    const rawClassIds: unknown[] = Array.isArray(req.body?.classIds)
      ? req.body.classIds
      : [req.body?.classId];
    const requestedClassIds = rawClassIds
      .map(objectId)
      .filter((id): id is mongoose.Types.ObjectId => Boolean(id));
    const uniqueClassIds = Array.from(new Set(requestedClassIds.map(String)))
      .map((id) => new mongoose.Types.ObjectId(id));
    if (!uniqueClassIds.length) {
      return res.status(400).json({ success: false, message: 'Select at least one class' });
    }
    const allowedClasses = await ClassModel.find({
      _id: { $in: uniqueClassIds },
      isDeleted: false,
      $or: [{ teacherId: req.user?.userId }, { assignedTeachers: req.user?.userId }]
    }).select('className branchId').lean<AnyRecord[]>();
    if (allowedClasses.length !== uniqueClassIds.length) {
      return res.status(403).json({ success: false, message: 'Teacher-class relationship validation failed' });
    }
    const title = String(req.body?.title ?? 'Shared resource').trim().slice(0, 200);
    const description = String(req.body?.description ?? '').trim().slice(0, 5000);
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 5).map(String) : [];
    if (!description && !attachments.length) {
      return res.status(400).json({ success: false, message: 'Resource content is required' });
    }
    const docs = allowedClasses.map((classDoc) => ({
      senderId: req.user?.userId,
      senderRole: 'teacher',
      recipientId: null,
      recipientRole: 'student',
      targetGroup: 'class_group',
      teacherId: req.user?.userId,
      classId: classDoc._id,
      branchId: classDoc.branchId ?? req.user?.branchId ?? null,
      subject: title,
      body: description || title,
      category: 'academic',
      messageType: 'teacher_resource_share',
      attachments,
      status: 'unread',
      priority: 'normal'
    }));
    const created = await Message.insertMany(docs);
    return ok(res, {
      sharedCount: created.length,
      classIds: allowedClasses.map((item) => String(item._id))
    });
  } catch (error) {
    return next(error);
  }
});

mobileRouter.get('/teacher/resources', async (req, res, next) => {
  try {
    const teacherId = objectId(req.user?.userId);
    if (!teacherId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const classFilter = await ClassModel.find({
      isDeleted: false,
      $or: [{ teacherId }, { assignedTeachers: teacherId }]
    }).select('_id').lean<AnyRecord[]>();
    const classIds = classFilter
      .map((item) => objectId(item._id))
      .filter((id): id is mongoose.Types.ObjectId => Boolean(id));

    const records = await LearningResource.find({
      isDeleted: false,
      $or: [
        { uploadedBy: teacherId },
        ...(classIds.length ? [{ classId: { $in: classIds } }] : [])
      ]
    })
      .populate('classId', 'className name')
      .populate('subjectId', 'title name subjectName')
      .populate('uploadedBy', 'name email')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(maxItems)
      .lean<AnyRecord[]>();

    ok(res, records.map(learningResourceDto));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/teacher/resources/:id', async (req, res, next) => {
  try {
    const teacherId = objectId(req.user?.userId);
    const resourceId = objectId(req.params.id);
    if (!teacherId || !resourceId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const item = await LearningResource.findOne({ _id: resourceId, isDeleted: false })
      .populate('classId', 'className name')
      .populate('subjectId', 'title name subjectName')
      .populate('uploadedBy', 'name email')
      .lean<AnyRecord>();
    if (!item) {
      return res.status(404).json({ success: false, message: 'Resource not found' });
    }
    const owns = String(item.uploadedBy?._id ?? item.uploadedBy ?? '') === String(teacherId);
    const classDoc = item.classId
      ? await teacherClassForRequest(req, item.classId?._id ?? item.classId)
      : null;
    if (!owns && !classDoc) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }
    ok(res, learningResourceDto(item));
  } catch (error) {
    next(error);
  }
});

mobileRouter.post(
  '/teacher/resources',
  (req, res, next) => {
    learningResourceUpload.single('file')(req, res, (error) => {
      if (!error) return next();
      const message = String((error as Error)?.message || '');
      if (message.toLowerCase().includes('file too large')) {
        return res.status(400).json({ success: false, message: 'File too large' });
      }
      return res.status(400).json({ success: false, message: message || 'Upload failed' });
    });
  },
  async (req, res, next) => {
    try {
      const teacherId = objectId(req.user?.userId);
      if (!teacherId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const title = String(req.body?.title ?? '').trim();
      const description = String(req.body?.description ?? '').trim();
      const classId = objectId(req.body?.classId);
      const published = String(req.body?.published ?? 'true').toLowerCase() !== 'false'
        && String(req.body?.publishStatus ?? 'published').toLowerCase() !== 'draft';
      const externalUrl = sanitizeExternalResourceUrl(req.body?.url ?? req.body?.link);
      const type = normalizeLearningResourceType(
        req.body?.type ?? req.body?.resourceType,
        req.file?.mimetype,
        req.file?.originalname
      );

      if (!title) {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, message: 'Title is required' });
      }
      if (!classId) {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, message: 'Class is required' });
      }
      if (type === 'link' && !externalUrl) {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, message: 'A valid HTTPS URL is required' });
      }
      if (type !== 'link' && !req.file && !externalUrl) {
        return res.status(400).json({ success: false, message: 'File or URL is required' });
      }

      const klass = await teacherClassForRequest(req, classId);
      if (!klass) {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(403).json({ success: false, message: 'You can only upload to your assigned classes' });
      }

      const subject = await assertTeacherSubjectForClass(req, classId, req.body?.subjectId);
      if (req.body?.subjectId && !subject) {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, message: 'Subject does not belong to the selected class' });
      }

      const uploaded = persistLearningResourceUpload(req.file);
      const resource = await LearningResource.create({
        title,
        description,
        type,
        classId,
        subjectId: subject?._id ?? null,
        branchId: klass.branchId ?? req.user?.branchId ?? null,
        uploadedBy: teacherId,
        accessRoles: ['student'],
        url: uploaded?.url || externalUrl,
        fileName: uploaded?.fileName || '',
        fileOriginalName: uploaded?.fileOriginalName || '',
        fileMimeType: uploaded?.fileMimeType || '',
        fileSize: uploaded?.fileSize || 0,
        published
      });

      const populated = await LearningResource.findById(resource._id)
        .populate('classId', 'className name')
        .populate('subjectId', 'title name subjectName')
        .populate('uploadedBy', 'name email')
        .lean<AnyRecord>();

      res.status(201).json({
        success: true,
        data: learningResourceDto(populated ?? resource.toObject()),
        message: 'Resource created successfully'
      });
    } catch (error) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      }
      next(error);
    }
  }
);

mobileRouter.patch('/teacher/resources/:id', async (req, res, next) => {
  try {
    const teacherId = objectId(req.user?.userId);
    const resourceId = objectId(req.params.id);
    if (!teacherId || !resourceId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const existing = await LearningResource.findOne({
      _id: resourceId,
      uploadedBy: teacherId,
      isDeleted: false
    }).lean<AnyRecord>();
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Resource not found' });
    }

    const updates: AnyRecord = {};
    if (req.body?.title !== undefined) {
      const title = String(req.body.title ?? '').trim();
      if (!title) return res.status(400).json({ success: false, message: 'Title is required' });
      updates.title = title;
    }
    if (req.body?.description !== undefined) {
      updates.description = String(req.body.description ?? '').trim();
    }
    if (req.body?.type !== undefined) {
      updates.type = normalizeLearningResourceType(req.body.type);
    }
    if (req.body?.url !== undefined || req.body?.link !== undefined) {
      const externalUrl = sanitizeExternalResourceUrl(req.body?.url ?? req.body?.link);
      if ((updates.type ?? existing.type) === 'link' && !externalUrl) {
        return res.status(400).json({ success: false, message: 'A valid HTTPS URL is required' });
      }
      if (externalUrl) updates.url = externalUrl;
    }
    if (req.body?.published !== undefined || req.body?.publishStatus !== undefined) {
      updates.published = String(req.body?.published ?? req.body?.publishStatus ?? 'true')
        .toLowerCase() !== 'false'
        && String(req.body?.publishStatus ?? 'published').toLowerCase() !== 'draft';
    }
    if (req.body?.classId !== undefined) {
      const classId = objectId(req.body.classId);
      if (!classId) return res.status(400).json({ success: false, message: 'Class is required' });
      const klass = await teacherClassForRequest(req, classId);
      if (!klass) {
        return res.status(403).json({ success: false, message: 'You can only upload to your assigned classes' });
      }
      updates.classId = classId;
      updates.branchId = klass.branchId ?? existing.branchId ?? req.user?.branchId ?? null;
    }
    if (req.body?.subjectId !== undefined) {
      const classId = objectId(updates.classId ?? existing.classId);
      if (!classId) return res.status(400).json({ success: false, message: 'Class is required' });
      if (!String(req.body.subjectId || '').trim()) {
        updates.subjectId = null;
      } else {
        const subject = await assertTeacherSubjectForClass(req, classId, req.body.subjectId);
        if (!subject) {
          return res.status(400).json({ success: false, message: 'Subject does not belong to the selected class' });
        }
        updates.subjectId = subject._id;
      }
    }

    const updated = await LearningResource.findByIdAndUpdate(
      resourceId,
      { $set: updates },
      { new: true, runValidators: true }
    )
      .populate('classId', 'className name')
      .populate('subjectId', 'title name subjectName')
      .populate('uploadedBy', 'name email')
      .lean<AnyRecord>();

    ok(res, learningResourceDto(updated ?? existing));
  } catch (error) {
    next(error);
  }
});

mobileRouter.delete('/teacher/resources/:id', async (req, res, next) => {
  try {
    const teacherId = objectId(req.user?.userId);
    const resourceId = objectId(req.params.id);
    if (!teacherId || !resourceId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const existing = await LearningResource.findOneAndUpdate(
      { _id: resourceId, uploadedBy: teacherId, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: teacherId, published: false } },
      { new: true }
    ).lean<AnyRecord>();
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Resource not found' });
    }
    ok(res, { id: String(existing._id), deleted: true });
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/teacher/resources/:id/download', async (req, res, next) => {
  try {
    const teacherId = objectId(req.user?.userId);
    const resourceId = objectId(req.params.id);
    if (!teacherId || !resourceId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const item = await LearningResource.findOne({ _id: resourceId, isDeleted: false }).lean<AnyRecord>();
    if (!item) return res.status(404).json({ success: false, message: 'Resource not found' });
    const owns = String(item.uploadedBy ?? '') === String(teacherId);
    const classDoc = item.classId ? await teacherClassForRequest(req, item.classId) : null;
    if (!owns && !classDoc) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }
    if (/^https?:\/\//i.test(String(item.url || ''))) {
      return res.redirect(String(item.url));
    }
    const filePath = resolveLearningResourceFilePath(item);
    if (!filePath) return res.status(404).json({ success: false, message: 'File not found' });
    res.setHeader('Content-Type', item.fileMimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(item.fileOriginalName || item.fileName || 'resource')}"`
    );
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/student/resources', async (req, res, next) => {
  try {
    const context = await currentStudentContext(req);
    if (!context?.studentId) return ok(res, []);

    const enrollments = await Enrollment.find({
      studentId: context.studentId,
      isDeleted: false
    }).select('classId subjectId').lean<AnyRecord[]>();

    const classIds = Array.from(new Set([
      String(context.classId ?? ''),
      ...enrollments.map((item) => String(item.classId ?? ''))
    ].filter(Boolean)))
      .filter(mongoose.Types.ObjectId.isValid)
      .map((id) => new mongoose.Types.ObjectId(id));

    const subjectIds = Array.from(new Set([
      String(context.student?.subjectId ?? ''),
      ...enrollments.map((item) => String(item.subjectId ?? ''))
    ].filter(Boolean)))
      .filter(mongoose.Types.ObjectId.isValid)
      .map((id) => new mongoose.Types.ObjectId(id));

    if (!classIds.length) return ok(res, []);

    const records = await LearningResource.find({
      published: true,
      isDeleted: false,
      $and: [
        {
          $or: [
            { accessRoles: { $size: 0 } },
            { accessRoles: { $in: ['student', 'family_student', 'all'] } }
          ]
        },
        {
          $or: [
            { classId: { $in: classIds } },
            { classId: null, ...(subjectIds.length ? { subjectId: { $in: subjectIds } } : {}) }
          ]
        }
      ]
    })
      .populate('classId', 'className name')
      .populate('subjectId', 'title name subjectName')
      .populate('uploadedBy', 'name email')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(maxItems)
      .lean<AnyRecord[]>();

    ok(res, records.map(learningResourceDto));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/student/resources/:id/download', async (req, res, next) => {
  try {
    const context = await currentStudentContext(req);
    const resourceId = objectId(req.params.id);
    if (!context?.studentId || !resourceId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const enrollments = await Enrollment.find({
      studentId: context.studentId,
      isDeleted: false
    }).select('classId').lean<AnyRecord[]>();
    const classIds = new Set([
      String(context.classId ?? ''),
      ...enrollments.map((item) => String(item.classId ?? ''))
    ].filter(Boolean));

    const item = await LearningResource.findOne({
      _id: resourceId,
      published: true,
      isDeleted: false
    }).lean<AnyRecord>();
    if (!item) return res.status(404).json({ success: false, message: 'Resource not found' });

    const itemClassId = String(item.classId ?? '');
    if (itemClassId && !classIds.has(itemClassId)) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    if (/^https?:\/\//i.test(String(item.url || ''))) {
      return res.redirect(String(item.url));
    }
    const filePath = resolveLearningResourceFilePath(item);
    if (!filePath) return res.status(404).json({ success: false, message: 'File not found' });
    res.setHeader('Content-Type', item.fileMimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(item.fileOriginalName || item.fileName || 'resource')}"`
    );
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/teacher/schedule', async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const teacherObjectId = objectId(userId);
    if (!teacherObjectId) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }
    const teacher = await currentTeacher(req);
    const assignedClassIds = Array.isArray(teacher?.assignedClassIds)
      ? teacher.assignedClassIds
        .map(objectId)
        .filter((id): id is mongoose.Types.ObjectId => Boolean(id))
      : [];
    const classScope: AnyRecord[] = [
      { teacherId: teacherObjectId },
      { assignedTeachers: teacherObjectId }
    ];
    if (assignedClassIds.length) {
      classScope.push({ _id: { $in: assignedClassIds } });
    }
    const classes = await ClassModel.find({
      $or: classScope,
      isDeleted: false
    })
      .select('className name title room weeklySchedule branchId subjectId teacherId mode courseName assignedSubjects')
      .populate('subjectId', 'title name subjectName')
      .populate('assignedSubjects', 'title name subjectName')
      .populate('teacherId', 'name firstName lastName')
      .lean<AnyRecord[]>();
    const classIds = classes
      .map((item) => objectId(item._id))
      .filter((id): id is mongoose.Types.ObjectId => Boolean(id));
    const classById = new Map(classes.map((item) => [String(item._id), item]));
    const timetableEntries = classIds.length
      ? await Timetable.find({
        classId: { $in: classIds },
        teacherId: teacherObjectId,
        isDeleted: false,
        active: { $ne: false },
        isActive: { $ne: false }
      })
        .select('classId subjectId teacherId branchId dayOfWeek startTime endTime durationMinutes room deliveryMode onlineLink notes active isActive')
        .populate('classId', 'className name title room subjectId teacherId courseName')
        .populate('subjectId', 'title name subjectName')
        .populate('teacherId', 'name firstName lastName')
        .populate('branchId', 'name branchName')
        .sort({ dayOfWeek: 1, startTime: 1 })
        .limit(maxItems)
        .lean<AnyRecord[]>()
      : [];

    const classesWithTimetable = new Set(
      timetableEntries.map((entry) => String(entry.classId?._id ?? entry.classId ?? ''))
    );
    const teacherIdKey = String(teacherObjectId);
    const fallbackSlots = classes.flatMap((item) => {
      const classId = String(item._id ?? '');
      if (!classId || classesWithTimetable.has(classId)) return [];
      const slots = resolveClassScheduleSlots(item);
      return slots.filter((slot) => {
        const slotTeacher = String(slot.teacherId ?? item.teacherId?._id ?? item.teacherId ?? '');
        if (!slotTeacher) {
          return String(item.teacherId?._id ?? item.teacherId ?? '') === teacherIdKey;
        }
        return slotTeacher === teacherIdKey;
      });
    });

    const current = await currentUser(req);
    const teacherDisplayName = String(current?.name ?? teacher?.name ?? '').trim();

    ok(res, [
      ...timetableEntries.map((entry) => {
        const dto = scheduleDto(entry, classById.get(String(entry.classId?._id ?? entry.classId ?? '')));
        return {
          ...dto,
          teacherName: dto.teacherName || teacherDisplayName,
          teacher: dto.teacher || teacherDisplayName
        };
      }),
      ...fallbackSlots.map((slot) => ({
        ...slot,
        teacherName: slot.teacherName || teacherDisplayName,
        teacher: slot.teacher || teacherDisplayName
      }))
    ]);
  } catch (error) {
    next(error);
  }
});

function getSessionForTime(date: Date) {
  const hourText = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kabul',
    hour: 'numeric',
    hour12: false
  }).format(date);
  const hour = Number(hourText);
  if (!Number.isFinite(hour) || hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function todayAttendanceRange() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kabul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  const dateKey = `${year}-${month}-${day}`;
  return {
    start: new Date(`${dateKey}T00:00:00+04:30`),
    end: new Date(`${dateKey}T23:59:59.999+04:30`),
    dateKey,
    dayOfWeek: new Date(`${dateKey}T12:00:00+04:30`).getUTCDay()
  };
}

function kabulWeekday(date = new Date()) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kabul',
    weekday: 'short'
  }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };
  return map[weekday] ?? todayAttendanceRange().dayOfWeek;
}

function normalizeTeacherAttendanceStatus(status: unknown) {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (normalized === 'leave') return 'excused';
  return normalized;
}

function isValidObjectId(value: unknown) {
  return mongoose.Types.ObjectId.isValid(String(value ?? '')) &&
    String(value).length === 24;
}

async function teacherAssignedClassIds(userId: unknown) {
  const teacherId = objectId(userId);
  if (!teacherId) return [] as mongoose.Types.ObjectId[];
  const teacher = await TeacherProfile.findOne({
    userId: teacherId,
    isDeleted: false
  })
    .select('assignedClassIds')
    .lean<AnyRecord>();
  const assignedClassIds = Array.isArray(teacher?.assignedClassIds)
    ? teacher.assignedClassIds
      .map(objectId)
      .filter((id): id is mongoose.Types.ObjectId => Boolean(id))
    : [];
  const classScope: AnyRecord[] = [
    { teacherId },
    { assignedTeachers: teacherId }
  ];
  if (assignedClassIds.length) {
    classScope.push({ _id: { $in: assignedClassIds } });
  }
  const classes = await ClassModel.find({
    isDeleted: false,
    $or: classScope
  })
    .select('_id')
    .lean<AnyRecord[]>();
  return classes
    .map((item) => objectId(item._id))
    .filter((id): id is mongoose.Types.ObjectId => Boolean(id));
}

function parseAttendanceQueryBound(value: string, bound: 'start' | 'end') {
  const raw = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return bound === 'start'
      ? new Date(`${raw}T00:00:00.000+04:30`)
      : new Date(`${raw}T23:59:59.999+04:30`);
  }
  return new Date(raw);
}

function attendanceDateRangeFromQuery(req: Request) {
  if (req.query.date) {
    return {
      $gte: parseAttendanceQueryBound(String(req.query.date), 'start'),
      $lte: parseAttendanceQueryBound(String(req.query.date), 'end')
    };
  }

  if (!req.query.from && !req.query.to) {
    return null;
  }

  const range: Record<string, Date> = {};
  if (req.query.from) {
    range.$gte = parseAttendanceQueryBound(String(req.query.from), 'start');
  }
  if (req.query.to) {
    range.$lte = parseAttendanceQueryBound(String(req.query.to), 'end');
  }
  return range;
}

async function buildTeacherAttendanceFilter(req: Request) {
  const userId = req.user?.userId;
  const teacherObjectId = objectId(userId);
  const classIds = await teacherAssignedClassIds(userId);
  const filter: AnyRecord = { isDeleted: false };

  if (req.query.classId && isValidObjectId(req.query.classId)) {
    const classDoc = await teacherClassForRequest(req, req.query.classId);
    filter.classId = classDoc?._id ?? { $in: [] };
  } else {
    filter.$or = [
      ...(teacherObjectId ? [{ teacherId: teacherObjectId }] : []),
      ...(userId ? [{ teacherId: userId }] : []),
      ...(classIds.length ? [{ classId: { $in: classIds } }] : [])
    ];
  }

  if (req.query.session) {
    filter.session = String(req.query.session);
  }
  if (req.query.status) {
    filter.status = String(req.query.status);
  }

  const attendanceDate = attendanceDateRangeFromQuery(req);
  if (attendanceDate) {
    filter.attendanceDate = attendanceDate;
  }

  return filter;
}

mobileRouter.post('/teacher/attendance/register', async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    const studentId = String(req.body?.studentId ?? '');
    const classId = String(req.body?.classId ?? '');
    const status = normalizeTeacherAttendanceStatus(req.body?.status);
    if (!isValidObjectId(studentId)) {
      return res.status(400).json({ success: false, message: 'Invalid studentId' });
    }
    if (!isValidObjectId(classId)) {
      return res.status(400).json({ success: false, message: 'Invalid classId' });
    }
    const allowedStatuses = new Set(['present', 'absent', 'late', 'excused']);
    if (!allowedStatuses.has(status)) {
      return res.status(400).json({ success: false, message: 'Invalid attendance status' });
    }

    const classDoc = await teacherClassForRequest(req, classId);
    if (!classDoc) {
      return res.status(403).json({ success: false, message: 'Teacher is not assigned to this class' });
    }

    const studentObjectId = objectId(studentId);
    const classObjectId = objectId(classDoc._id);
    if (!studentObjectId || !classObjectId) {
      return res.status(400).json({ success: false, message: 'Invalid attendance reference' });
    }

    const student = await activeStudentBelongsToClass(studentObjectId, classObjectId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found in this class' });
    }

    const now = new Date();
    const { start: attendanceDate, end: attendanceEnd } = todayAttendanceRange();
    const session = ['morning', 'afternoon', 'evening', 'online'].includes(String(req.body?.session ?? ''))
      ? String(req.body.session)
      : getSessionForTime(now);

    const teacherObjectId = objectId(userId);
    if (!teacherObjectId) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    const timetableEntries = await Timetable.find({
      classId: classDoc._id,
      isDeleted: false,
      isActive: { $ne: false },
      active: { $ne: false },
      dayOfWeek: kabulWeekday(now)
    })
      .sort({ startTime: 1 })
      .lean<AnyRecord[]>();

    const kabulMinutes = (() => {
      const hour = Number(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kabul',
        hour: 'numeric',
        hour12: false
      }).format(now));
      const minute = Number(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kabul',
        minute: 'numeric'
      }).format(now));
      return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
    })();

    const inWindow = (entry: AnyRecord) => {
      const [startHour, startMinute] = String(entry.startTime ?? '').split(':').map(Number);
      const [endHour, endMinute] = String(entry.endTime ?? '').split(':').map(Number);
      if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) return false;
      const start = startHour * 60 + (Number.isFinite(startMinute) ? startMinute : 0);
      const end = endHour * 60 + (Number.isFinite(endMinute) ? endMinute : 0);
      return kabulMinutes >= start && kabulMinutes <= end;
    };

    const windowEntries = timetableEntries.filter(inWindow);
    let activeTimetable =
      windowEntries.find((entry) => String(entry.teacherId ?? '') === String(teacherObjectId)) ??
      windowEntries.find((entry) => !entry.teacherId) ??
      windowEntries[0] ??
      null;

    if (!activeTimetable && timetableEntries.length === 0) {
      const todayDow = kabulWeekday(now);
      const weekly = resolveClassScheduleSlots(classDoc).filter(
        (slot) => Number(slot.dayOfWeek) === todayDow
      );
      const weeklyInWindow = weekly.filter(inWindow);
      activeTimetable = weeklyInWindow[0] ?? null;
      if (weekly.length > 0 && !activeTimetable) {
        return res.status(403).json({
          success: false,
          message: 'Attendance is not available at this time.'
        });
      }
    } else if (timetableEntries.length > 0 && !activeTimetable) {
      return res.status(403).json({
        success: false,
        message: 'Attendance is not available at this time.'
      });
    }

    const duplicateFilter: AnyRecord = {
      studentId: studentObjectId,
      classId: classDoc._id,
      session,
      attendanceDate: { $gte: attendanceDate, $lte: attendanceEnd },
      isDeleted: false
    };

    const existing = await Attendance.findOne(duplicateFilter).sort({ updatedAt: -1 });
    const hijriLabel = hijriShamsiDate(attendanceDate);
    const payload = {
      studentId: studentObjectId,
      classId: classDoc._id,
      teacherId: teacherObjectId,
      subjectId: student.subjectId ?? classDoc.subjectId ?? null,
      branchId: student.branchId ?? classDoc.branchId ?? null,
      timetableId: activeTimetable?._id ?? null,
      attendanceDate,
      session,
      status,
      source: 'teacher_marked',
      notes: String(req.body?.notes ?? req.body?.note ?? '').trim(),
      markedBy: teacherObjectId,
      checkInAt: ['absent', 'excused'].includes(status) ? null : now,
      sessionStartTime: activeTimetable?.startTime ?? '',
      sessionEndTime: activeTimetable?.endTime ?? ''
    };

    let saved: AnyRecord | null = null;
    try {
      saved = existing
        ? await Attendance.findByIdAndUpdate(
          existing._id,
          { $set: payload },
          { new: true, runValidators: true }
        ).lean<AnyRecord>()
        : await Attendance.create(payload).then((doc) => doc.toObject());
    } catch (error: any) {
      if (error?.code === 11000) {
        const conflict = await Attendance.findOne(duplicateFilter).sort({ updatedAt: -1 });
        if (conflict) {
          saved = await Attendance.findByIdAndUpdate(
            conflict._id,
            { $set: payload },
            { new: true, runValidators: true }
          ).lean<AnyRecord>();
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    const dto = attendanceDto(saved ?? payload);
    ok(res, {
      ...dto,
      hijriShamsiDate: dto.hijriShamsiDate || hijriLabel,
      hijriDate: dto.hijriShamsiDate || hijriLabel
    });
  } catch (error) {
    return next(error);
  }
});

mobileRouter.get('/teacher/attendance', async (req, res, next) => {
  try {
    const filter = await buildTeacherAttendanceFilter(req);
    const limit = Math.min(
      Math.max(Number(req.query.limit ?? maxItems) || maxItems, 1),
      500
    );
    const records = await Attendance.find(filter)
      .select('studentId classId subjectId teacherId branchId timetableId attendanceDate session status source notes sessionStartTime sessionEndTime checkInAt checkOutAt durationMinutes markedAutomatically createdAt updatedAt')
      .populate('studentId', 'firstName lastName studentId')
      .populate('classId', 'className name title room branchId')
      .populate('subjectId', 'title name subjectName')
      .populate('teacherId', 'name firstName lastName')
      .populate('branchId', 'name branchName')
      .populate('timetableId', 'startTime endTime durationMinutes room deliveryMode onlineLink')
      .sort({ attendanceDate: -1, createdAt: -1 })
      .limit(limit)
      .lean<AnyRecord[]>();
    ok(res, records.map(attendanceDto));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/teacher/salary', async (req, res, next) => {
  try {
    const userId = objectId(req.user?.userId);
    const role = String(req.user?.canonicalRole ?? req.user?.role ?? '');
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (role && role !== 'teacher' && !['super_admin', 'admin', 'owner', 'branch_manager'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Teacher access required' });
    }

    const { year: currentHijriYear, month: currentHijriMonth } = getHijriYearMonth();
    const period = String(req.query.period ?? 'all').trim().toLowerCase();
    const queryYear = Number(req.query.year || 0);
    const queryMonth = Number(req.query.month || 0);

    try {
      await calculateSalaryRecord({
        userId: String(userId),
        hijriYear: queryYear || currentHijriYear,
        hijriMonth: queryMonth || currentHijriMonth,
        actorId: String(userId),
        forceRecalculate: false
      });
    } catch {
      // Teachers can still view existing salary history if payroll settings are not ready.
    }

    const recordFilter: AnyRecord = {
      userId,
      role: 'teacher',
      isDeleted: false
    };
    if (period === 'this_month') {
      recordFilter.hijriYear = currentHijriYear;
      recordFilter.hijriMonth = currentHijriMonth;
    } else if (period === 'last_month') {
      const lastMonth = currentHijriMonth === 1 ? 12 : currentHijriMonth - 1;
      const lastYear = currentHijriMonth === 1 ? currentHijriYear - 1 : currentHijriYear;
      recordFilter.hijriYear = lastYear;
      recordFilter.hijriMonth = lastMonth;
    } else if (period === 'this_year') {
      recordFilter.hijriYear = currentHijriYear;
    } else if (queryYear > 0) {
      recordFilter.hijriYear = queryYear;
      if (queryMonth > 0) recordFilter.hijriMonth = queryMonth;
    }

    const fromDate = req.query.from ? new Date(String(req.query.from)) : null;
    const toDate = req.query.to ? new Date(String(req.query.to)) : null;
    const hasValidFrom = fromDate && !Number.isNaN(fromDate.getTime());
    const hasValidTo = toDate && !Number.isNaN(toDate.getTime());
    if (hasValidFrom || hasValidTo) {
      recordFilter.calculatedAt = {};
      if (hasValidFrom) recordFilter.calculatedAt.$gte = fromDate;
      if (hasValidTo) {
        const end = new Date(toDate!);
        end.setHours(23, 59, 59, 999);
        recordFilter.calculatedAt.$lte = end;
      }
    }

    const [payrollRecords, payoutRecords, paymentRecords] = await Promise.all([
      SalaryRecord.find(recordFilter)
        .populate('userId', 'name role email')
        .populate('branchId', 'name code')
        .sort({ hijriYear: -1, hijriMonth: -1, calculatedAt: -1 })
        .limit(maxItems)
        .lean<AnyRecord[]>(),
      Salary.find({
        employeeId: userId,
        isDeleted: false
      })
        .sort({ monthKey: -1, paidAt: -1, createdAt: -1 })
        .limit(maxItems)
        .lean<AnyRecord[]>(),
      Payment.find({
        payeeUserId: userId,
        paymentFor: 'teacher_salary',
        isDeleted: false,
        status: { $nin: ['cancelled', 'refunded'] }
      })
        .populate('collectedBy', 'name email')
        .populate('salaryRecordIds', 'hijriYear hijriMonth')
        .sort({ paymentDate: -1, createdAt: -1 })
        .limit(maxItems)
        .lean<AnyRecord[]>()
    ]);

    const payoutByMonth = new Map(
      payoutRecords.map((item) => [String(item.monthKey ?? ''), item])
    );

    const paymentMatchesPeriod = (item: AnyRecord) => {
      const linked = Array.isArray(item.salaryRecordIds) ? item.salaryRecordIds : [];
      const linkedPeriod = linked
        .map((record: AnyRecord) => {
          const year = Number(record?.hijriYear ?? 0);
          const month = Number(record?.hijriMonth ?? 0);
          if (!year || !month) return '';
          return `${year}-${String(month).padStart(2, '0')}`;
        })
        .find((value: string) => value);
      const paymentDate = item.paymentDate ? new Date(item.paymentDate) : null;
      if (period === 'this_month') {
        if (linkedPeriod) {
          return linkedPeriod === `${currentHijriYear}-${String(currentHijriMonth).padStart(2, '0')}`;
        }
        return Boolean(
          paymentDate &&
            !Number.isNaN(paymentDate.getTime()) &&
            paymentDate.getFullYear() === new Date().getFullYear() &&
            paymentDate.getMonth() === new Date().getMonth()
        );
      }
      if (period === 'last_month') {
        const lastMonth = currentHijriMonth === 1 ? 12 : currentHijriMonth - 1;
        const lastYear = currentHijriMonth === 1 ? currentHijriYear - 1 : currentHijriYear;
        if (linkedPeriod) {
          return linkedPeriod === `${lastYear}-${String(lastMonth).padStart(2, '0')}`;
        }
        const gregorian = new Date();
        gregorian.setMonth(gregorian.getMonth() - 1);
        return Boolean(
          paymentDate &&
            !Number.isNaN(paymentDate.getTime()) &&
            paymentDate.getFullYear() === gregorian.getFullYear() &&
            paymentDate.getMonth() === gregorian.getMonth()
        );
      }
      if (period === 'this_year') {
        if (linkedPeriod) return linkedPeriod.startsWith(`${currentHijriYear}-`);
        return Boolean(
          paymentDate &&
            !Number.isNaN(paymentDate.getTime()) &&
            paymentDate.getFullYear() === new Date().getFullYear()
        );
      }
      if (hasValidFrom || hasValidTo) {
        if (!paymentDate || Number.isNaN(paymentDate.getTime())) return false;
        if (hasValidFrom && paymentDate < fromDate!) return false;
        if (hasValidTo) {
          const end = new Date(toDate!);
          end.setHours(23, 59, 59, 999);
          if (paymentDate > end) return false;
        }
        return true;
      }
      return true;
    };

    const mapPaymentStatus = (net: number, paid: number, rawStatus: string) => {
      const status = String(rawStatus || '').toLowerCase();
      if (status === 'paid' || (net > 0 && paid >= net - 0.009)) return 'paid';
      if (paid > 0 && paid < net - 0.009) return 'partially_paid';
      if (status === 'pending') return 'pending';
      return 'unpaid';
    };

    const payrollRows = payrollRecords.map((item) => {
      const monthKey = `${item.hijriYear}-${String(item.hijriMonth).padStart(2, '0')}`;
      const payout = payoutByMonth.get(monthKey);
      const net = Number(Number(item.netSalary ?? 0).toFixed(2));
      const paid = Number(Number(item.paidAmount ?? payout?.paidAmount ?? 0).toFixed(2));
      const remaining = Number(Math.max(0, net - paid).toFixed(2));
      const paymentStatus = mapPaymentStatus(net, paid, String(item.paymentStatus ?? ''));
      return {
        id: String(item._id),
        _id: String(item._id),
        title: `Salary ${monthKey}`,
        description: item.taxExplanation ?? '',
        source: 'payroll',
        teacherId: String(item.userId?._id ?? item.userId ?? userId),
        teacherName: item.userId?.name ?? '',
        teacherEmail: item.userId?.email ?? '',
        branchName: item.branchId?.name ?? '',
        salaryPeriod: monthKey,
        hijriYear: item.hijriYear,
        hijriMonth: item.hijriMonth,
        grossSalaryAf: Number(Number(item.grossSalary ?? 0).toFixed(2)),
        fixedAmountAf: Number(Number(item.fixedAmount ?? 0).toFixed(2)),
        commissionAmountAf: Number(Number(item.commissionAmount ?? 0).toFixed(2)),
        totalStudentPaymentsUsedAf: Number(Number(item.totalStudentPaymentsUsed ?? 0).toFixed(2)),
        percentageUsed: Number(item.percentageUsed ?? 0),
        taxAmountAf: Number(Number(item.taxAmount ?? 0).toFixed(2)),
        deductionsAf: Number(Number(item.taxAmount ?? 0).toFixed(2)),
        bonusesAf: 0,
        allowancesAf: 0,
        penaltiesAf: 0,
        overtimeAf: 0,
        netSalaryAf: net,
        remainingAmountAf: remaining,
        taxCategory: item.taxCategory ?? '',
        taxFormula: item.taxFormula ?? '',
        taxExplanation: item.taxExplanation ?? '',
        isTaxExempt: Boolean(item.isTaxExempt),
        paymentStatus,
        status: paymentStatus,
        taxStatus: item.taxStatus ?? 'pending',
        calculatedAt: compactDate(item.calculatedAt),
        paidAt: compactDate(item.paidAt ?? payout?.paidAt),
        lastPaymentDate: compactDate(item.paidAt ?? payout?.paidAt),
        paidAmountAf: paid,
        currency: 'AFN',
        receiptAvailable: paid > 0
      };
    });

    const payrollMonthKeys = new Set(payrollRows.map((item) => item.salaryPeriod));
    const legacyRows = payoutRecords
      .filter((item) => {
        const key = String(item.monthKey ?? '');
        if (payrollMonthKeys.has(key)) return false;
        if (period === 'this_month') {
          const currentKey = `${currentHijriYear}-${String(currentHijriMonth).padStart(2, '0')}`;
          return key === currentKey;
        }
        if (period === 'last_month') {
          const lastMonth = currentHijriMonth === 1 ? 12 : currentHijriMonth - 1;
          const lastYear = currentHijriMonth === 1 ? currentHijriYear - 1 : currentHijriYear;
          return key === `${lastYear}-${String(lastMonth).padStart(2, '0')}`;
        }
        if (period === 'this_year') {
          return key.startsWith(`${currentHijriYear}-`);
        }
        return true;
      })
      .map((item) => {
        const net = Number(Number(item.netAmount ?? 0).toFixed(2));
        const paid = Number(Number(item.paidAmount ?? 0).toFixed(2));
        const remaining = Number(Math.max(0, net - paid).toFixed(2));
        const paymentStatus = mapPaymentStatus(net, paid, String(item.status ?? ''));
        return {
          id: String(item._id),
          _id: String(item._id),
          title: `Salary ${item.monthKey ?? ''}`.trim(),
          description: '',
          source: 'legacy_payout',
          teacherId: String(item.employeeId ?? userId),
          salaryPeriod: item.monthKey ?? '',
          grossSalaryAf: Number(Number(item.baseAmount ?? 0).toFixed(2)),
          fixedAmountAf: Number(Number(item.baseAmount ?? 0).toFixed(2)),
          commissionAmountAf: 0,
          totalStudentPaymentsUsedAf: 0,
          percentageUsed: 0,
          taxAmountAf: 0,
          deductionsAf: Number(Number(item.deductions ?? 0).toFixed(2)),
          bonusesAf: 0,
          allowancesAf: 0,
          penaltiesAf: 0,
          overtimeAf: 0,
          netSalaryAf: net,
          remainingAmountAf: remaining,
          paymentStatus,
          status: paymentStatus,
          paidAt: compactDate(item.paidAt),
          lastPaymentDate: compactDate(item.paidAt),
          paidAmountAf: paid,
          currency: item.currency ?? 'AFN',
          deductionsDetail: item.deductionsDetail ?? [],
          receiptAvailable: paid > 0
        };
      });

    const records = [...payrollRows, ...legacyRows];
    const current = records[0] ?? null;
    const totalNet = Number(records.reduce((sum, item) => sum + Number(item.netSalaryAf || 0), 0).toFixed(2));
    const totalPaid = Number(records.reduce((sum, item) => sum + Number(item.paidAmountAf || 0), 0).toFixed(2));
    const totalGross = Number(records.reduce((sum, item) => sum + Number(item.grossSalaryAf || 0), 0).toFixed(2));
    const totalRemaining = Number(Math.max(0, totalNet - totalPaid).toFixed(2));
    const summaryStatus = mapPaymentStatus(
      totalNet,
      totalPaid,
      current?.paymentStatus ?? 'unpaid'
    );

    const payments = paymentRecords
      .filter(paymentMatchesPeriod)
      .map((item) => {
        const linked = Array.isArray(item.salaryRecordIds) ? item.salaryRecordIds : [];
        const linkedPeriod = linked
          .map((record: AnyRecord) => {
            const year = Number(record?.hijriYear ?? 0);
            const month = Number(record?.hijriMonth ?? 0);
            if (!year || !month) return '';
            return `${year}-${String(month).padStart(2, '0')}`;
          })
          .find((value: string) => value) || '';
        const rawStatus = String(item.status ?? 'completed').toLowerCase();
        const paymentStatus = rawStatus === 'completed' || rawStatus === 'paid' ? 'paid' : rawStatus;
        return {
          id: String(item._id),
          _id: String(item._id),
          title: item.invoiceNumber || item.referenceNumber || 'Salary payment',
          amountAf: Number(Number(item.netAmount ?? item.amount ?? 0).toFixed(2)),
          grossSalaryAf: Number(Number(item.grossAmount ?? item.amount ?? 0).toFixed(2)),
          taxAmountAf: Number(Number(item.taxAmount ?? 0).toFixed(2)),
          netSalaryAf: Number(Number(item.netAmount ?? item.amount ?? 0).toFixed(2)),
          currency: item.currency ?? 'AFN',
          paymentDate: compactDate(item.paymentDate ?? item.createdAt),
          paymentMethod: item.method ?? item.paymentMethod ?? '',
          paymentStatus,
          status: paymentStatus,
          invoiceNumber: item.invoiceNumber ?? '',
          receiptNumber: item.invoiceNumber || item.referenceNumber || '',
          transactionReference: item.referenceNumber || '',
          salaryPeriod: linkedPeriod,
          collectedByName: item.collectedBy?.name ?? '',
          notes: item.notes ?? '',
          receiptAvailable: paymentStatus === 'paid'
        };
      });

    ok(res, {
      summary: {
        currency: current?.currency ?? 'AFN',
        currentPeriod: current?.salaryPeriod ?? '',
        grossSalaryAf: totalGross,
        netSalaryAf: totalNet,
        paidAmountAf: totalPaid,
        remainingAmountAf: totalRemaining,
        pendingAmountAf: totalRemaining,
        overdueAmountAf: 0,
        paymentStatus: summaryStatus,
        lastPaymentDate: current?.lastPaymentDate || payments[0]?.paymentDate || '',
        recordsCount: records.length,
        paymentsCount: payments.length
      },
      records,
      payments,
      items: records
    });
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/teacher/salary/payments/:paymentId/receipt', async (req, res, next) => {
  try {
    const userId = objectId(req.user?.userId);
    const paymentId = objectId(req.params.paymentId);
    const role = String(req.user?.canonicalRole ?? req.user?.role ?? '');
    if (!userId || !paymentId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (role && role !== 'teacher' && !['super_admin', 'admin', 'owner', 'branch_manager'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Teacher access required' });
    }

    const payment = await Payment.findOne({
      _id: paymentId,
      payeeUserId: userId,
      paymentFor: 'teacher_salary',
      isDeleted: false
    })
      .populate('collectedBy', 'name email')
      .populate('payeeUserId', 'name email role')
      .populate('salaryRecordIds', 'hijriYear hijriMonth')
      .lean<AnyRecord>();

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Receipt not found' });
    }

    const status = String(payment.status ?? '').toLowerCase();
    if (['cancelled', 'refunded'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Receipt is not available for this payment' });
    }

    const linked = Array.isArray(payment.salaryRecordIds) ? payment.salaryRecordIds : [];
    const linkedPeriod = linked
      .map((record: AnyRecord) => {
        const year = Number(record?.hijriYear ?? 0);
        const month = Number(record?.hijriMonth ?? 0);
        if (!year || !month) return '';
        return `${year}-${String(month).padStart(2, '0')}`;
      })
      .find((value: string) => value) || '';
    const paymentStatus = status === 'completed' || status === 'paid' ? 'paid' : status;

    ok(res, {
      id: String(payment._id),
      receiptNumber: payment.invoiceNumber || payment.referenceNumber || '',
      invoiceNumber: payment.invoiceNumber ?? '',
      transactionReference: payment.referenceNumber || '',
      teacherName: payment.payeeUserId?.name ?? '',
      teacherEmail: payment.payeeUserId?.email ?? '',
      amountAf: Number(Number(payment.netAmount ?? payment.amount ?? 0).toFixed(2)),
      grossSalaryAf: Number(Number(payment.grossAmount ?? payment.amount ?? 0).toFixed(2)),
      taxAmountAf: Number(Number(payment.taxAmount ?? 0).toFixed(2)),
      netSalaryAf: Number(Number(payment.netAmount ?? payment.amount ?? 0).toFixed(2)),
      currency: payment.currency ?? 'AFN',
      paymentDate: compactDate(payment.paymentDate ?? payment.createdAt),
      paymentMethod: payment.method ?? payment.paymentMethod ?? '',
      paymentStatus,
      salaryPeriod: linkedPeriod,
      collectedByName: payment.collectedBy?.name ?? '',
      notes: payment.notes ?? '',
      issuedAt: compactDate(payment.paymentDate ?? payment.createdAt)
    });
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/teacher/exams', async (req, res, next) => {
  try {
    const exams = await Exam.find({ teacherId: req.user?.userId, isDeleted: false })
      .populate('subject', 'title code')
      .populate('class', 'className name classCode')
      .populate('teacherId', 'name email')
      .sort({ date: 1 })
      .limit(maxItems)
      .lean<AnyRecord[]>();
    ok(res, exams.map((item) => {
      const googleFormUrl = String(item.googleFormUrl ?? '').trim();
      const onlineExamUrl = String(item.onlineExamUrl ?? '').trim();
      const mode = googleFormUrl || onlineExamUrl ? 'online' : 'offline';
      const examDate = item.date ? new Date(item.date) : null;
      return {
        ...item,
        id: String(item._id),
        subjectId: String(item.subject?._id ?? item.subject ?? ''),
        subjectName: item.subject?.title ?? item.subjectName ?? '',
        classId: String(item.class?._id ?? item.class ?? ''),
        className: item.class?.className ?? item.class?.name ?? item.className ?? '',
        teacherName: item.teacherId?.name ?? item.teacherName ?? '',
        scheduleLabel: compactDate(item.date),
        examDate: compactDate(item.date),
        date: compactDate(item.date),
        hijriShamsiDate: hijriShamsiDate(examDate),
        googleFormUrl,
        onlineExamUrl,
        examUrl: onlineExamUrl || googleFormUrl || '',
        link: onlineExamUrl || googleFormUrl || '',
        mode,
        deliveryMode: mode,
        totalMarks: Number(item.totalMarks ?? 0),
        passingMarks: Number(item.passingMarks ?? 0),
        status: item.status ?? 'draft'
      };
    }));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/teacher/exams/:examId/analysis', async (req, res, next) => {
  try {
    const exam = await Exam.findOne({
      _id: req.params.examId,
      teacherId: req.user?.userId,
      isDeleted: false
    })
      .populate('subject', 'title code')
      .populate('class', 'className name classCode')
      .lean<AnyRecord>();
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    const insight = await generateExamInsights(req.params.examId);
    ok(res, {
      ...insight,
      examId: String(exam._id),
      examTitle: exam.title ?? insight.examTitle ?? '',
      className: exam.class?.className ?? exam.class?.name ?? '',
      subjectName: exam.subject?.title ?? '',
      title: exam.title ?? 'Class analysis'
    });
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/teacher/grading', async (req, res, next) => {
  try {
    const classIdFilter = String(req.query.classId || '').trim();
    const teacherExamFilter: AnyRecord = {
      teacherId: req.user?.userId,
      isDeleted: false
    };
    if (classIdFilter) {
      teacherExamFilter.class = classIdFilter;
    }
    const teacherExamIds = await Exam.find(teacherExamFilter).select('_id').lean<AnyRecord[]>();
    const results = await Result.find({
      exam: { $in: teacherExamIds.map((item) => item._id) },
      isDeleted: false
    })
      .populate('student', 'name firstName lastName email studentId profileImage')
      .populate({
        path: 'exam',
        select: 'title date totalMarks passingMarks subject class teacherId',
        populate: [
          { path: 'subject', select: 'title code' },
          { path: 'class', select: 'className name classCode' },
          { path: 'teacherId', select: 'name email' }
        ]
      })
      .populate('gradedBy', 'name email')
      .sort({ updatedAt: -1 })
      .limit(maxItems)
      .lean<AnyRecord[]>();
    ok(res, results.map((item) => {
      const score = Number(item.score ?? 0);
      const passed = score >= 60;
      return {
        ...item,
        id: String(item._id),
        studentId: String(item.student?._id ?? item.student ?? ''),
        studentCode: item.student?.studentId ?? '',
        studentName: item.student?.name ?? [item.student?.firstName, item.student?.lastName].filter(Boolean).join(' ') ?? '',
        profileImage: item.student?.profileImage ?? '',
        examId: String(item.exam?._id ?? item.exam ?? ''),
        examTitle: item.exam?.title ?? '',
        classId: String(item.exam?.class?._id ?? item.classId ?? ''),
        className: item.exam?.class?.className ?? item.exam?.class?.name ?? '',
        subjectId: String(item.exam?.subject?._id ?? item.subjectId ?? ''),
        subjectName: item.exam?.subject?.title ?? '',
        teacherId: String(item.exam?.teacherId?._id ?? item.teacherId ?? ''),
        teacherName: item.exam?.teacherId?.name ?? '',
        checkedBy: item.gradedBy?.name ?? '',
        marks: score,
        score,
        totalScore: score,
        totalMarks: 100,
        maximumScore: 100,
        maxScore: 100,
        passingMarks: 60,
        percentage: score,
        passed,
        status: passed ? 'passed' : 'failed',
        grade: item.grade ?? (score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F'),
        dateLabel: compactDate(item.updatedAt ?? item.createdAt),
        examDate: compactDate(item.exam?.date)
      };
    }));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/teacher/results/:resultId/suggestion', async (req, res, next) => {
  try {
    const language = String(req.query.lang || req.body?.lang || 'en');
    const result = await Result.findById(req.params.resultId)
      .populate('student', 'name firstName lastName email branchId')
      .populate({
        path: 'exam',
        match: { teacherId: req.user?.userId },
        select: 'title date totalMarks subject class teacherId',
        populate: [
          { path: 'subject', select: 'title code' },
          { path: 'class', select: 'className name classCode' },
          { path: 'teacherId', select: 'name email' }
        ]
      })
      .populate('gradedBy', 'name email')
      .lean<AnyRecord>();
    if (!result || !result.exam) {
      return res.status(404).json({ success: false, message: 'Result not found' });
    }
    const score = Number(result.score ?? 0);
    const percentage = Math.round(score);
    const subjectName = result.exam?.subject?.title ?? 'this subject';
    const needsSupport = percentage < 60;
    const weakAreas = needsSupport ? [subjectName] : [];
    const subjectId = result.exam?.subject?._id ?? result.exam?.subject ?? result.subjectId ?? null;
    const classId = result.exam?.class?._id ?? result.exam?.class ?? result.classId ?? null;
    const resourceFilter: AnyRecord = { published: true };
    if (subjectId) resourceFilter.subjectId = subjectId;
    if (classId) resourceFilter.$or = [{ classId }, { classId: null }];
    const [learningResources, books] = await Promise.all([
      LearningResource.find(resourceFilter).select('title type url description').sort({ updatedAt: -1 }).limit(5).lean<AnyRecord[]>(),
      Book.find(
        subjectId
          ? { available: true, isDeleted: false, title: { $regex: String(result.exam?.subject?.title || ''), $options: 'i' } }
          : { available: true, isDeleted: false }
      ).select('title author category').sort({ updatedAt: -1 }).limit(3).lean<AnyRecord[]>()
    ]);
    const resources = [
      ...learningResources.map((item) => item.title || item.url).filter(Boolean),
      ...books.map((item) => item.title).filter(Boolean)
    ].slice(0, 8);
    const studyPlan = needsSupport
      ? [
          weakAreas.length
            ? (language === 'fa'
              ? `تمرکز روی نقاط ضعیف: ${weakAreas.join('، ')}`
              : language === 'ps'
                ? `پر کمزورو برخو تمرکز: ${weakAreas.join('، ')}`
                : `Focus on weak areas: ${weakAreas.join(', ')}`)
            : (language === 'fa' ? `روی ${subjectName} تمرکز کنید` : language === 'ps' ? `پر ${subjectName} تمرکز وکړئ` : `Focus on ${subjectName}`),
          language === 'fa' ? 'روزانه ۲۰ دقیقه تمرین' : language === 'ps' ? 'ورځني ۲۰ دقیقې تمرین' : 'Practice 20 minutes daily',
          language === 'fa' ? 'بازخورد معلم را کامل کنید' : language === 'ps' ? 'د ښوونکي فیډبک بشپړ کړئ' : 'Complete teacher feedback',
          language === 'fa' ? 'آزمون دوباره مبحث ضعیف' : language === 'ps' ? 'کمزوری مبحث بیا ازمویل' : 'Retake weak-topic quiz'
        ]
      : [
          language === 'fa' ? 'مرور هفتگی را ادامه دهید' : language === 'ps' ? 'اوونیز مرور دوام ورکړئ' : 'Maintain weekly revision',
          language === 'fa' ? 'تمرین سوالات پیشرفته' : language === 'ps' ? 'پرمختللي پوښتنې تمرین کړئ' : 'Practice advanced questions',
          language === 'fa' ? 'هدف امتحان بعدی را مشخص کنید' : language === 'ps' ? 'د راتلونکي ازموینې هدف وټاکئ' : 'Track next exam target'
        ];
    ok(res, {
      resultId: String(result._id),
      title: needsSupport
        ? (language === 'fa' ? 'برنامه بهبود پیشنهاد می‌شود' : language === 'ps' ? 'د ښه والي پلان سپارښتنه کېږي' : 'Improvement plan recommended')
        : (language === 'fa' ? 'تسلط خود را ادامه دهید' : language === 'ps' ? 'خپله پوهه نوره هم پیاوړې کړئ' : 'Keep building mastery'),
      executiveSummary: needsSupport
        ? (language === 'fa'
          ? `روی ${subjectName} تمرکز کنید. نقاط ضعیف را مرور کنید و تمرین روزانه انجام دهید.`
          : language === 'ps'
            ? `پر ${subjectName} تمرکز وکړئ. کمزورې برخې مرور کړئ او ورځنی تمرین وکړئ.`
            : `Focus on ${subjectName}. Review weak topics and practice daily.`)
        : (language === 'fa'
          ? `پیشرفت در ${subjectName} در حال رشد است. مرور هفتگی و تمرین را ادامه دهید.`
          : language === 'ps'
            ? `په ${subjectName} کې پرمختګ روان دی. اوونیز مرور او تمرین دوام ورکړئ.`
            : `Progress in ${subjectName} is developing. Continue weekly revision and practice.`),
      score,
      totalMarks: 100,
      percentage,
      weakAreas,
      resources,
      studyPlan,
      hasInternalResources: resources.length > 0
    });
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/teacher/results/:resultId/insight', async (req, res, next) => {
  try {
    const result = await Result.findById(req.params.resultId)
      .populate({ path: 'exam', match: { teacherId: req.user?.userId }, select: 'teacherId branchId' })
      .lean<AnyRecord>();
    if (!result || !result.exam) {
      return res.status(404).json({ success: false, message: 'Result not found' });
    }
    const insight = await upsertAIResultInsight({
      resultId: req.params.resultId,
      actorId: String(req.user?.userId ?? '')
    });
    ok(res, insight);
  } catch (error) {
    next(error);
  }
});

function sanitizePhoneInput(phone: string) {
  return String(phone || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

function isValidAfghanPhone(phone: string) {
  const cleaned = sanitizePhoneInput(phone);
  const digits = cleaned.replace(/\D/g, '');
  const normalized = digits.startsWith('00')
    ? digits.slice(2)
    : digits.startsWith('93')
      ? digits
      : digits.startsWith('0') && digits.length === 10
        ? `93${digits.slice(1)}`
        : digits.length === 9 && digits.startsWith('7')
          ? `93${digits}`
          : digits;
  return Boolean(normalized.startsWith('93') && normalized.length >= 11);
}

async function teacherCanAccessStudent(
  teacherId: mongoose.Types.ObjectId,
  studentDocId: mongoose.Types.ObjectId
) {
  const student = await Student.findOne({
    _id: studentDocId,
    isDeleted: false,
    status: { $ne: 'inactive' }
  })
    .select('_id branchId classId studentId loginEmail firstName lastName profileImage teacherId whatsapp familyPhone phone status')
    .lean<AnyRecord>();
  if (!student) return null;
  if (String(student.teacherId) === String(teacherId)) return student;

  const [enrollment, classDoc, timetableEntry] = await Promise.all([
    Enrollment.findOne({
      studentId: studentDocId,
      teacherId,
      status: 'active',
      isDeleted: { $ne: true }
    }).select('_id').lean<AnyRecord>(),
    ClassModel.findOne({
      _id: student.classId,
      isDeleted: false,
      $or: [{ teacherId }, { assignedTeachers: teacherId }]
    }).select('_id').lean<AnyRecord>(),
    Timetable.findOne({
      classId: student.classId,
      teacherId,
      isDeleted: { $ne: true }
    }).select('_id').lean<AnyRecord>()
  ]);

  if (enrollment || classDoc || timetableEntry) return student;
  return null;
}

type TeacherStudentChatScope = {
  teacherId: mongoose.Types.ObjectId;
  student: AnyRecord;
  studentUserId: mongoose.Types.ObjectId;
};

type TeacherStudentChatResolution =
  | { scope: TeacherStudentChatScope; error: null }
  | { scope: null; error: 'invalid_id' | 'access_denied' | 'account_not_linked' };

async function resolveTeacherStudentChat(
  req: Request,
  studentDocIdValue: unknown
): Promise<TeacherStudentChatResolution> {
  const teacherId = objectId(req.user?.userId);
  const studentDocId = objectId(studentDocIdValue);
  if (!teacherId || !studentDocId) {
    return { scope: null, error: 'invalid_id' };
  }
  const student = await teacherCanAccessStudent(teacherId, studentDocId);
  if (!student) {
    return { scope: null, error: 'access_denied' };
  }
  const studentUser = await studentUserForStudentId(student._id);
  const studentUserId = objectId(studentUser?._id);
  if (!studentUserId) {
    return { scope: null, error: 'account_not_linked' };
  }
  return {
    scope: { teacherId, student, studentUserId },
    error: null
  };
}

async function normalizeAfghanWhatsappPhone(phone: string) {
  const cleaned = sanitizePhoneInput(phone);
  const digits = cleaned.replace(/\D/g, '');
  const normalized = digits.startsWith('00')
    ? digits.slice(2)
    : digits.startsWith('93')
      ? digits
      : digits.startsWith('0') && digits.length === 10
        ? `93${digits.slice(1)}`
        : digits.length === 9 && digits.startsWith('7')
          ? `93${digits}`
          : digits;
  const valid = isValidAfghanPhone(normalized);
  const whatsappUrl = valid && normalized ? `https://wa.me/${normalized}` : '';
  const telUri = valid && normalized ? `tel:+${normalized}` : '';
  return {
    phone: cleaned,
    normalized: valid ? normalized : '',
    whatsappUrl,
    telUri,
    qrCode: whatsappUrl
  };
}

mobileRouter.get('/teacher/students/:studentId/whatsapp-qr', async (req, res, next) => {
  try {
    const teacherId = objectId(req.user?.userId);
    const studentDocId = objectId(req.params.studentId);
    if (!teacherId || !studentDocId) {
      return res.status(400).json({ success: false, message: 'Invalid student reference' });
    }
    const student = await teacherCanAccessStudent(teacherId, studentDocId);
    if (!student) {
      return res.status(403).json({ success: false, message: 'Student access denied' });
    }
    const phone = String(
      student.whatsapp ?? student.familyPhone ?? student.phone ?? ''
    ).trim();
    const contact = await normalizeAfghanWhatsappPhone(phone);
    ok(res, {
      studentId: String(student._id),
      studentName: `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim(),
      phone: contact.phone,
      whatsapp: contact.phone,
      whatsappUrl: contact.whatsappUrl,
      telUri: contact.telUri,
      qrCode: contact.qrCode,
      url: contact.qrCode,
      fallback: contact.qrCode ? '' : 'No WhatsApp number is available for this student.'
    });
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/teacher/chat/contacts', async (req, res, next) => {
  try {
    const teacherId = objectId(req.user?.userId);
    if (!teacherId) return ok(res, { students: [], parents: [], admins: [] });

    const classes = await ClassModel.find({
      isDeleted: false,
      $or: [{ teacherId }, { assignedTeachers: teacherId }]
    }).select('_id').lean<AnyRecord[]>();
    const classIds = classes
      .map((item) => objectId(item._id))
      .filter((id): id is mongoose.Types.ObjectId => Boolean(id));

    const studentScope: AnyRecord[] = [{ teacherId }];
    if (classIds.length) studentScope.push({ classId: { $in: classIds } });

    const students = await Student.find({
      $or: studentScope,
      isDeleted: false,
      status: { $ne: 'inactive' }
    })
      .select('_id firstName lastName studentId profileImage classId teacherId branchId parentProfileId fatherName')
      .populate('classId', 'className name')
      .limit(maxItems)
      .lean<AnyRecord[]>();

    const studentUsers = await Promise.all(students.map((item) => studentUserForStudentId(item._id)));
    const parentIds = students
      .map((item) => objectId(item.parentProfileId))
      .filter((id): id is mongoose.Types.ObjectId => Boolean(id));
    const parents = parentIds.length
      ? await ParentProfile.find({ _id: { $in: parentIds }, isDeleted: false })
        .select('_id userId guardianName guardianPhone guardianEmail linkedStudentIds')
        .lean<AnyRecord[]>()
      : [];
    const parentsById = new Map(parents.map((item) => [String(item._id), item]));

    const admins = await User.find({
      role: { $in: ['super_admin', 'admin', 'branch_manager'] },
      isDeleted: false,
      active: { $ne: false },
      $or: [
        ...(req.user?.branchId ? [{ branchId: req.user.branchId }] : []),
        { role: { $in: ['super_admin', 'admin'] } }
      ]
    }).select('name email role profileImage').limit(20).lean<AnyRecord[]>();

    const recentMessages = await Message.find({
      isDeleted: false,
      $or: [{ senderId: teacherId }, { recipientId: teacherId }]
    })
      .sort({ createdAt: -1 })
      .limit(400)
      .lean<AnyRecord[]>();

    const decorate = (contact: AnyRecord, matchIds: string[]): AnyRecord => {
      const idSet = new Set(matchIds.map(String).filter(Boolean));
      const relevant = recentMessages.filter((item) => {
        const senderId = String(item.senderId ?? '');
        const recipientId = String(item.recipientId ?? '');
        return idSet.has(senderId) || idSet.has(recipientId);
      });
      const last = relevant[0];
      const unreadCount = relevant.filter((item) => (
        item.status === 'unread' &&
        String(item.senderId ?? '') !== String(teacherId) &&
        String(item.recipientId ?? '') === String(teacherId)
      )).length;
      return {
        ...contact,
        lastMessage: last?.body ?? '',
        timestamp: compactDate(last?.createdAt),
        status: last?.status ?? '',
        unreadCount
      };
    };

    const studentsPayload = students.map((student, index) => {
      const userId = String(studentUsers[index]?._id ?? '');
      return decorate({
        id: String(student._id),
        studentId: String(student._id),
        studentCode: student.studentId ?? '',
        userId,
        name: `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim() || 'Student',
        role: 'student',
        profileImage: student.profileImage ?? '',
        classId: String(student.classId?._id ?? student.classId ?? ''),
        className: student.classId?.className ?? student.classId?.name ?? ''
      }, [userId]);
    }).filter((item) => Boolean(item.userId));

    const parentsByUser = new Map<string, AnyRecord>();
    for (const student of students) {
      const parent = parentsById.get(String(student.parentProfileId ?? ''));
      if (!parent?.userId) continue;
      const parentUserId = String(parent.userId);
      const existing = parentsByUser.get(parentUserId);
      const studentName = `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim();
      const className = student.classId?.className ?? student.classId?.name ?? '';
      if (existing) {
        const linked = Array.isArray(existing.linkedStudents) ? existing.linkedStudents : [];
        linked.push({
          studentId: String(student._id),
          studentCode: student.studentId ?? '',
          studentName,
          className
        });
        existing.linkedStudents = linked;
        if (!existing.studentId) {
          existing.studentId = String(student._id);
          existing.studentCode = student.studentId ?? '';
          existing.studentName = studentName;
          existing.className = className;
        }
        continue;
      }
      parentsByUser.set(parentUserId, decorate({
        id: parentUserId,
        parentId: String(parent._id),
        parentUserId,
        studentId: String(student._id),
        studentCode: student.studentId ?? '',
        studentName,
        name: parent.guardianName ?? student.fatherName ?? 'Parent',
        role: 'parent',
        profileImage: '',
        className,
        linkedStudents: [{
          studentId: String(student._id),
          studentCode: student.studentId ?? '',
          studentName,
          className
        }]
      }, [parentUserId]));
    }
    const parentsPayload = [...parentsByUser.values()];

    const adminsPayload = admins.map((admin) => decorate({
      id: String(admin._id),
      name: admin.name ?? 'Admin',
      role: 'admin',
      profileImage: admin.profileImage ?? ''
    }, [String(admin._id)]));

    const byUnreadThenTime = (a: AnyRecord, b: AnyRecord) => {
      const unreadDiff = Number(b.unreadCount ?? 0) - Number(a.unreadCount ?? 0);
      if (unreadDiff !== 0) return unreadDiff;
      return String(b.timestamp ?? '').localeCompare(String(a.timestamp ?? ''));
    };

    ok(res, {
      students: studentsPayload.sort(byUnreadThenTime),
      parents: parentsPayload.sort(byUnreadThenTime),
      admins: adminsPayload.sort(byUnreadThenTime)
    });
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/teacher/chat/messages', async (req, res, next) => {
  try {
    const teacherId = objectId(req.user?.userId);
    if (!teacherId) return ok(res, []);
    const targetType = String(req.query.targetType ?? '').toLowerCase();
    const targetId = String(req.query.targetId ?? '');
    const studentDocId = String(req.query.studentId ?? '');

    if (targetType === 'student') {
      const resolved = await resolveTeacherStudentChat(req, targetId);
      if (!resolved.scope) {
        const status = resolved.error === 'account_not_linked' ? 404 : 403;
        return res.status(status).json({
          success: false,
          message: resolved.error === 'account_not_linked'
            ? 'Student account was not found'
            : 'Student access denied'
        });
      }
      const scope = resolved.scope;
      await Message.updateMany(
        {
          senderId: scope.studentUserId,
          recipientId: scope.teacherId,
          status: 'unread',
          isDeleted: false
        },
        { status: 'read', readAt: new Date() }
      );
      const records = await Message.find({
        isDeleted: false,
        $or: [
          { senderId: scope.teacherId, recipientId: scope.studentUserId },
          { senderId: scope.studentUserId, recipientId: scope.teacherId }
        ]
      })
        .sort({ createdAt: 1 })
        .limit(200)
        .populate('senderId', 'name role profileImage')
        .populate('recipientId', 'name role profileImage')
        .lean<AnyRecord[]>();
      return ok(res, records.map((item) => ({
        ...chatMessageDto(item),
        isMine: String(item.senderId?._id ?? item.senderId) === String(scope.teacherId)
      })));
    }

    const targetObjectId = objectId(targetId);
    if (!targetObjectId || !['admin', 'parent'].includes(targetType)) {
      return ok(res, []);
    }

    if (targetType === 'parent') {
      const studentObjectId = objectId(studentDocId);
      if (!studentObjectId) {
        return res.status(400).json({ success: false, message: 'Student is required for parent messages' });
      }
      const student = await teacherCanAccessStudent(teacherId, studentObjectId);
      if (!student) {
        return res.status(403).json({ success: false, message: 'Parent is not linked to your students' });
      }
      const parent = await ParentProfile.findOne({
        userId: targetObjectId,
        isDeleted: false,
        $or: [
          { _id: student.parentProfileId },
          { linkedStudentIds: studentObjectId }
        ]
      }).select('_id').lean<AnyRecord>();
      if (!parent) {
        return res.status(403).json({ success: false, message: 'Parent is not linked to your students' });
      }
    }

    await Message.updateMany(
      {
        senderId: targetObjectId,
        recipientId: teacherId,
        status: 'unread',
        isDeleted: false
      },
      { status: 'read', readAt: new Date() }
    );

    const records = await Message.find({
      isDeleted: false,
      $or: [
        { senderId: teacherId, recipientId: targetObjectId },
        { senderId: targetObjectId, recipientId: teacherId }
      ]
    })
      .sort({ createdAt: 1 })
      .limit(200)
      .populate('senderId', 'name role profileImage')
      .populate('recipientId', 'name role profileImage')
      .lean<AnyRecord[]>();

    ok(res, records.map((item) => ({
      ...chatMessageDto(item),
      isMine: String(item.senderId?._id ?? item.senderId) === String(teacherId)
    })));
  } catch (error) {
    next(error);
  }
});

mobileRouter.post('/teacher/chat/messages', async (req, res, next) => {
  try {
    const teacherId = objectId(req.user?.userId);
    if (!teacherId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const body = String(req.body?.message ?? '').trim();
    if (!body) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }
    const targetType = String(req.body?.targetType ?? '').toLowerCase();
    const targetId = String(req.body?.targetId ?? '');
    const studentDocId = String(req.body?.studentId ?? '');

    if (targetType === 'student') {
      const resolved = await resolveTeacherStudentChat(req, targetId);
      if (!resolved.scope) {
        const status = resolved.error === 'account_not_linked' ? 404 : 403;
        return res.status(status).json({
          success: false,
          message: resolved.error === 'account_not_linked'
            ? 'Student account was not found'
            : 'Student access denied'
        });
      }
      const scope = resolved.scope;
      const user = await currentUser(req);
      const existingThread = await Message.findOne({
        isDeleted: false,
        $or: [
          { senderId: scope.teacherId, recipientId: scope.studentUserId },
          { senderId: scope.studentUserId, recipientId: scope.teacherId }
        ]
      })
        .sort({ createdAt: -1 })
        .select('threadId _id')
        .lean<AnyRecord>();
      const item = await Message.create({
        senderId: scope.teacherId,
        senderRole: 'teacher',
        senderName: user?.name ?? 'Teacher',
        senderEmail: user?.email ?? '',
        senderPhone: user?.phone ?? '',
        recipientId: scope.studentUserId,
        recipientRole: 'student',
        studentId: scope.student._id,
        teacherId: scope.teacherId,
        branchId: scope.student.branchId ?? req.user?.branchId ?? null,
        classId: scope.student.classId ?? null,
        subject: String(req.body?.subject ?? 'Teacher message').slice(0, 200),
        body,
        category: 'student',
        messageType: 'teacher_to_student',
        threadId: existingThread?.threadId ?? existingThread?._id ?? null,
        status: 'unread',
        priority: 'normal'
      });
      return ok(res, { ...chatMessageDto(item.toObject()), isMine: true });
    }

    const targetObjectId = objectId(targetId);
    if (!targetObjectId || !['admin', 'parent'].includes(targetType)) {
      return res.status(400).json({ success: false, message: 'Recipient is required' });
    }

    const user = await currentUser(req);
    let studentDoc: AnyRecord | null = null;
    if (targetType === 'parent') {
      const studentObjectId = objectId(studentDocId);
      if (!studentObjectId) {
        return res.status(400).json({ success: false, message: 'Student is required for parent messages' });
      }
      studentDoc = await teacherCanAccessStudent(teacherId, studentObjectId);
      if (!studentDoc) {
        return res.status(403).json({ success: false, message: 'Parent is not linked to your students' });
      }
      const parent = await ParentProfile.findOne({
        userId: targetObjectId,
        isDeleted: false,
        $or: [
          { _id: studentDoc.parentProfileId },
          { linkedStudentIds: studentObjectId }
        ]
      }).select('_id userId').lean<AnyRecord>();
      if (!parent) {
        return res.status(403).json({ success: false, message: 'Parent is not linked to your students' });
      }
    } else {
      const admin = await User.findOne({
        _id: targetObjectId,
        role: { $in: ['super_admin', 'admin', 'branch_manager'] },
        isDeleted: false
      }).select('_id').lean<AnyRecord>();
      if (!admin) {
        return res.status(404).json({ success: false, message: 'Admin not found' });
      }
    }

    const existingThread = await Message.findOne({
      isDeleted: false,
      $or: [
        { senderId: teacherId, recipientId: targetObjectId },
        { senderId: targetObjectId, recipientId: teacherId }
      ]
    })
      .sort({ createdAt: -1 })
      .select('threadId _id')
      .lean<AnyRecord>();

    const item = await Message.create({
      senderId: teacherId,
      senderRole: 'teacher',
      senderName: user?.name ?? 'Teacher',
      senderEmail: user?.email ?? '',
      senderPhone: user?.phone ?? '',
      recipientId: targetObjectId,
      recipientRole: targetType,
      studentId: studentDoc?._id ?? null,
      teacherId,
      branchId: studentDoc?.branchId ?? req.user?.branchId ?? null,
      classId: studentDoc?.classId ?? null,
      subject: String(req.body?.subject ?? (targetType === 'parent' ? 'Parent message' : 'Admin message')).slice(0, 200),
      body,
      category: targetType === 'parent' ? 'parent' : 'admin',
      messageType: targetType === 'parent' ? 'teacher_to_parent' : 'teacher_to_admin',
      threadId: existingThread?.threadId ?? existingThread?._id ?? null,
      status: 'unread',
      priority: 'normal',
      targetGroup: targetType === 'admin' ? 'admin' : undefined
    });
    return ok(res, { ...chatMessageDto(item.toObject()), isMine: true });
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/teacher/chat/students/:studentId/messages', async (req, res, next) => {
  try {
    const resolved = await resolveTeacherStudentChat(req, req.params.studentId);
    if (!resolved.scope) {
      const status = resolved.error === 'account_not_linked' ? 404 : 403;
      const message = resolved.error === 'account_not_linked'
        ? 'Student account was not found'
        : 'Student access denied';
      return res.status(status).json({ success: false, message });
    }
    const scope = resolved.scope;
    await Message.updateMany(
      {
        senderId: scope.studentUserId,
        recipientId: scope.teacherId,
        status: 'unread',
        isDeleted: false
      },
      { status: 'read', readAt: new Date() }
    );
    const records = await Message.find({
      isDeleted: false,
      $or: [
        { senderId: scope.teacherId, recipientId: scope.studentUserId },
        { senderId: scope.studentUserId, recipientId: scope.teacherId }
      ]
    })
      .sort({ createdAt: 1 })
      .limit(200)
      .populate('senderId', 'name role profileImage')
      .populate('recipientId', 'name role profileImage')
      .lean<AnyRecord[]>();
    ok(res, records.map((item) => ({
      ...chatMessageDto(item),
      isMine: String(item.senderId?._id ?? item.senderId) === String(scope.teacherId)
    })));
  } catch (error) {
    next(error);
  }
});

mobileRouter.post('/teacher/chat/students/:studentId/messages', async (req, res, next) => {
  try {
    const resolved = await resolveTeacherStudentChat(req, req.params.studentId);
    if (!resolved.scope) {
      const status = resolved.error === 'account_not_linked' ? 404 : 403;
      const message = resolved.error === 'account_not_linked'
        ? 'Student account was not found'
        : 'Student access denied';
      return res.status(status).json({ success: false, message });
    }
    const scope = resolved.scope;
    const user = await currentUser(req);
    const body = String(req.body?.message ?? '').trim();
    if (!body) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }
    const existingThread = await Message.findOne({
      isDeleted: false,
      $or: [
        { senderId: scope.teacherId, recipientId: scope.studentUserId },
        { senderId: scope.studentUserId, recipientId: scope.teacherId }
      ]
    })
      .sort({ createdAt: -1 })
      .select('threadId _id')
      .lean<AnyRecord>();
    const item = await Message.create({
      senderId: scope.teacherId,
      senderRole: 'teacher',
      senderName: user?.name ?? 'Teacher',
      senderEmail: user?.email ?? '',
      senderPhone: user?.phone ?? '',
      recipientId: scope.studentUserId,
      recipientRole: 'student',
      studentId: scope.student._id,
      teacherId: scope.teacherId,
      branchId: scope.student.branchId ?? req.user?.branchId ?? null,
      classId: scope.student.classId ?? null,
      subject: String(req.body?.subject ?? 'Teacher message').slice(0, 200),
      body,
      category: 'student',
      messageType: 'teacher_to_student',
      threadId: existingThread?.threadId ?? existingThread?._id ?? null,
      status: 'unread',
      priority: 'normal'
    });
    return ok(res, { ...chatMessageDto(item.toObject()), isMine: true });
  } catch (error) {
    return next(error);
  }
});

mobileRouter.get('/teacher/messages', async (req, res, next) => {
  try {
    const records = await Message.find({
      $or: [
        { senderId: req.user?.userId },
        { recipientId: req.user?.userId }
      ],
      ...branchFilter(req),
      isDeleted: false
    }).sort({ createdAt: -1 }).limit(maxItems).lean<AnyRecord[]>();
    ok(res, records.map((item) => messageDto(item, req.user?.userId)));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/teacher/notifications', async (req, res, next) => {
  try {
    const teacherId = objectId(req.user?.userId);
    if (!teacherId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const lang = String(req.query.lang ?? req.headers['accept-language'] ?? 'en');
    const roleCandidates = [
      req.user?.role,
      req.user?.canonicalRole,
      'teacher'
    ].filter(Boolean);
    const now = new Date();
    const receivedAudience: AnyRecord[] = [
      { recipientRoles: { $in: roleCandidates } },
      { recipientIds: teacherId }
    ];

    const records = await Notification.find({
      isDeleted: false,
      ...branchFilter(req),
      $or: [
        { teacherId },
        {
          publishStatus: 'published',
          $and: [
            { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
            { $or: receivedAudience }
          ]
        }
      ]
    })
      .populate('classId', 'className name classCode')
      .populate('subjectId', 'title name subjectName')
      .populate('teacherId', 'name email')
      .sort({ pinned: -1, priority: -1, publishDate: -1, createdAt: -1 })
      .limit(maxItems)
      .lean<AnyRecord[]>();

    ok(res, records.map((item) => {
      const teacherRef = String(item.teacherId?._id ?? item.teacherId ?? '');
      const roles = Array.isArray(item.recipientRoles)
        ? item.recipientRoles.map((role: unknown) => String(role).toLowerCase())
        : [];
      const targetsStudentsOrParents = roles.some((role) =>
        role === 'student' || role === 'parent' || role === 'family_student'
      );
      const createdVia = String(item.metadata?.createdVia ?? '');
      const owned = teacherRef === String(teacherId) && (
        targetsStudentsOrParents ||
        createdVia === 'mobile_teacher' ||
        item.category === 'class_notice'
      );
      const dto = notificationDto(item, lang, {
        viewerId: String(req.user?.userId ?? ''),
        owned
      });
      const read = Boolean(
        Array.isArray(item.readBy) &&
        item.readBy.some((id: unknown) => String(id) === String(req.user?.userId))
      );
      return {
        ...dto,
        status: owned
          ? (item.publishStatus === 'draft' ? 'draft' : (item.publishStatus || 'published'))
          : (read ? 'read' : 'unread')
      };
    }));
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/teacher/notifications/:id', async (req, res, next) => {
  try {
    const teacherId = objectId(req.user?.userId);
    const notificationId = objectId(req.params.id);
    if (!teacherId || !notificationId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const lang = String(req.query.lang ?? req.headers['accept-language'] ?? 'en');
    const roleCandidates = [
      req.user?.role,
      req.user?.canonicalRole,
      'teacher'
    ].filter(Boolean);

    const item = await Notification.findOne({
      _id: notificationId,
      isDeleted: false,
      ...branchFilter(req),
      $or: [
        { teacherId },
        {
          publishStatus: 'published',
          $or: [
            { recipientRoles: { $in: roleCandidates } },
            { recipientIds: teacherId }
          ]
        }
      ]
    })
      .populate('classId', 'className name classCode')
      .populate('subjectId', 'title name subjectName')
      .populate('teacherId', 'name email')
      .lean<AnyRecord>();

    if (!item) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }

    const teacherOwnsRecord = String(item.teacherId?._id ?? item.teacherId ?? '') === String(teacherId);
    const roles = Array.isArray(item.recipientRoles)
      ? item.recipientRoles.map((role: unknown) => String(role).toLowerCase())
      : [];
    const targetsStudentsOrParents = roles.some((role) =>
      role === 'student' || role === 'parent' || role === 'family_student'
    );
    const isAuthor = teacherOwnsRecord && (
      targetsStudentsOrParents ||
      String(item.metadata?.createdVia ?? '') === 'mobile_teacher' ||
      item.category === 'class_notice'
    );
    const recipientEstimate = isAuthor
      ? await estimateNotificationRecipients({
          classId: item.classId?._id ?? item.classId,
          recipientRoles: item.recipientRoles,
          recipientIds: item.recipientIds
        })
      : 0;

    const dto = notificationDto(
      { ...item, recipientEstimate },
      lang,
      { viewerId: String(req.user?.userId ?? ''), owned: isAuthor }
    );

    ok(res, {
      ...dto,
      totalRecipients: recipientEstimate,
      viewedCount: dto.viewedCount,
      unreadCount: Math.max(0, recipientEstimate - Number(dto.viewedCount ?? 0))
    });
  } catch (error) {
    next(error);
  }
});

mobileRouter.post('/teacher/notifications', async (req, res, next) => {
  try {
    const teacherId = objectId(req.user?.userId);
    if (!teacherId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const title = String(req.body?.title ?? '').trim();
    const description = String(
      req.body?.description ?? req.body?.message ?? req.body?.content ?? ''
    ).trim();
    const classId = objectId(req.body?.classId);
    const subjectId = objectId(req.body?.subjectId);
    const audienceRoles = mapAudienceRoles(
      req.body?.audience ?? req.body?.audienceType ?? req.body?.recipientRoles
    );
    const priority = String(req.body?.priority ?? 'normal').trim().toLowerCase();
    const publishStatus = String(req.body?.publishStatus ?? 'published').trim().toLowerCase() === 'draft'
      ? 'draft'
      : 'published';
    const category = String(req.body?.category ?? 'class_notice').trim() || 'class_notice';
    const pinned = Boolean(req.body?.pinned);
    const expiresAtRaw = req.body?.expiresAt;
    const publishDateRaw = req.body?.publishDate ?? req.body?.publishAt;

    if (!title) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }
    if (!description) {
      return res.status(400).json({ success: false, message: 'Content is required' });
    }
    if (!classId) {
      return res.status(400).json({ success: false, message: 'Class is required' });
    }
    if (!audienceRoles.length) {
      return res.status(400).json({ success: false, message: 'Audience is required' });
    }

    const allowedRoles = new Set(['student', 'parent', 'family_student']);
    if (audienceRoles.some((role) => !allowedRoles.has(role))) {
      return res.status(400).json({ success: false, message: 'Audience is not permitted for teachers' });
    }

    const allowedPriority = new Set(['low', 'normal', 'high', 'urgent']);
    if (!allowedPriority.has(priority)) {
      return res.status(400).json({ success: false, message: 'Invalid priority' });
    }

    const klass = await teacherClassForRequest(req, classId);
    if (!klass) {
      return res.status(403).json({ success: false, message: 'You can only announce to your assigned classes' });
    }

    if (subjectId) {
      const subject = await Subject.findOne({ _id: subjectId, isDeleted: false }).lean<AnyRecord>();
      if (!subject || String(subject.classId ?? '') !== String(classId)) {
        return res.status(400).json({ success: false, message: 'Subject does not belong to the selected class' });
      }
    }

    const publishDate = publishDateRaw ? new Date(publishDateRaw) : new Date();
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid expiry date' });
    }
    if (expiresAt && publishDate && expiresAt.getTime() < publishDate.getTime()) {
      return res.status(400).json({ success: false, message: 'Expiry must be after publish date' });
    }

    const notification = await Notification.create({
      title,
      description,
      message: description,
      classId,
      subjectId: subjectId ?? null,
      teacherId,
      category,
      publishDate: publishStatus === 'published' ? publishDate : null,
      expiresAt,
      publishStatus,
      priority,
      pinned,
      severity: priority === 'urgent' ? 'critical' : priority === 'high' ? 'warning' : 'info',
      branchId: req.user?.branchId ?? klass.branchId ?? null,
      recipientRoles: audienceRoles,
      recipientIds: [],
      readBy: [],
      metadata: {
        createdVia: 'mobile_teacher',
        audienceType: String(req.body?.audience ?? req.body?.audienceType ?? audienceRoles.join('_'))
      }
    });

    const populated = await Notification.findById(notification._id)
      .populate('classId', 'className name classCode')
      .populate('subjectId', 'title name subjectName')
      .populate('teacherId', 'name email')
      .lean<AnyRecord>();

    const lang = String(req.query.lang ?? req.headers['accept-language'] ?? 'en');
    const recipientEstimate = await estimateNotificationRecipients({
      classId,
      recipientRoles: audienceRoles
    });
    res.status(201).json({
      success: true,
      data: {
        ...notificationDto(
          { ...(populated ?? notification.toObject()), recipientEstimate },
          lang,
          { viewerId: String(teacherId), owned: true }
        ),
        totalRecipients: recipientEstimate
      },
      message: 'Announcement created successfully'
    });
  } catch (error) {
    next(error);
  }
});

mobileRouter.patch('/teacher/notifications/:id', async (req, res, next) => {
  try {
    const teacherId = objectId(req.user?.userId);
    const notificationId = objectId(req.params.id);
    if (!teacherId || !notificationId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const existing = await Notification.findOne({
      _id: notificationId,
      teacherId,
      isDeleted: false
    }).lean<AnyRecord>();
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }

    const updates: AnyRecord = {};
    if (req.body?.title !== undefined) {
      const title = String(req.body.title ?? '').trim();
      if (!title) return res.status(400).json({ success: false, message: 'Title is required' });
      updates.title = title;
    }
    if (req.body?.description !== undefined || req.body?.message !== undefined || req.body?.content !== undefined) {
      const description = String(
        req.body?.description ?? req.body?.message ?? req.body?.content ?? ''
      ).trim();
      if (!description) return res.status(400).json({ success: false, message: 'Content is required' });
      updates.description = description;
      updates.message = description;
    }
    if (req.body?.priority !== undefined) {
      const priority = String(req.body.priority).trim().toLowerCase();
      if (!['low', 'normal', 'high', 'urgent'].includes(priority)) {
        return res.status(400).json({ success: false, message: 'Invalid priority' });
      }
      updates.priority = priority;
      updates.severity = priority === 'urgent' ? 'critical' : priority === 'high' ? 'warning' : 'info';
    }
    if (req.body?.pinned !== undefined) updates.pinned = Boolean(req.body.pinned);
    if (req.body?.publishStatus !== undefined) {
      updates.publishStatus = String(req.body.publishStatus).trim().toLowerCase() === 'draft'
        ? 'draft'
        : 'published';
      if (updates.publishStatus === 'published' && !existing.publishDate) {
        updates.publishDate = new Date();
      }
    }
    if (req.body?.expiresAt !== undefined) {
      updates.expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
    }
    if (req.body?.classId !== undefined || req.body?.audience !== undefined || req.body?.audienceType !== undefined || req.body?.recipientRoles !== undefined) {
      const classId = objectId(req.body?.classId ?? existing.classId);
      if (!classId) {
        return res.status(400).json({ success: false, message: 'Class is required' });
      }
      const klass = await teacherClassForRequest(req, classId);
      if (!klass) {
        return res.status(403).json({ success: false, message: 'You can only announce to your assigned classes' });
      }
      const audienceRoles = mapAudienceRoles(
        req.body?.audience ?? req.body?.audienceType ?? req.body?.recipientRoles ?? existing.recipientRoles
      );
      if (!audienceRoles.length) {
        return res.status(400).json({ success: false, message: 'Audience is required' });
      }
      updates.classId = classId;
      updates.recipientRoles = audienceRoles;
      updates.recipientIds = [];
    }

    const updated = await Notification.findByIdAndUpdate(
      notificationId,
      { $set: updates },
      { new: true, runValidators: true }
    )
      .populate('classId', 'className name classCode')
      .populate('subjectId', 'title name subjectName')
      .populate('teacherId', 'name email')
      .lean<AnyRecord>();

    const lang = String(req.query.lang ?? req.headers['accept-language'] ?? 'en');
    ok(res, notificationDto(updated ?? existing, lang, {
      viewerId: String(teacherId),
      owned: true
    }));
  } catch (error) {
    next(error);
  }
});

mobileRouter.delete('/teacher/notifications/:id', async (req, res, next) => {
  try {
    const teacherId = objectId(req.user?.userId);
    const notificationId = objectId(req.params.id);
    if (!teacherId || !notificationId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const existing = await Notification.findOneAndUpdate(
      { _id: notificationId, teacherId, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: teacherId } },
      { new: true }
    ).lean<AnyRecord>();

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }

    ok(res, { id: String(existing._id), deleted: true });
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/teacher/ratings-summary', async (req, res, next) => {
  try {
    const teacherId = objectId(req.user?.userId);
    if (!teacherId) return ok(res, { averageRating: 0, totalRatings: 0, recent: [] });
    const filter = {
      teacherId,
      status: 'reviewed',
      isDeleted: false
    };
    const [summary, recent] = await Promise.all([
      TeacherRating.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$teacherId',
            averageRating: { $avg: '$rating' },
            totalRatings: { $sum: 1 }
          }
        }
      ]),
      TeacherRating.find(filter)
        .populate('studentId', 'firstName lastName studentId')
        .populate('classId', 'className name')
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(5)
        .lean<AnyRecord[]>()
    ]);
    const stats = summary[0] ?? {};
    ok(res, {
      averageRating: Number(Number(stats.averageRating ?? 0).toFixed(1)),
      totalRatings: Number(stats.totalRatings ?? 0),
      recent: recent.map((item) => ({
        id: String(item._id),
        rating: Number(item.rating ?? 0),
        comment: item.comment ?? '',
        studentName: item.studentId
          ? `${item.studentId.firstName ?? ''} ${item.studentId.lastName ?? ''}`.trim()
          : 'Student',
        className: item.classId?.className ?? item.classId?.name ?? '',
        createdAt: compactDate(item.createdAt)
      }))
    });
  } catch (error) {
    next(error);
  }
});

mobileRouter.get('/:role/messages/:id', async (req, res, next) => {
  try {
    const item = await Message.findOne({
      _id: req.params.id,
      $or: [
        { senderId: req.user?.userId },
        { recipientId: req.user?.userId },
        { recipientRole: req.params.role }
      ],
      isDeleted: false
    }).lean<AnyRecord>();
    if (!item) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }
    return ok(res, messageDto(item));
  } catch (error) {
    return next(error);
  }
});

mobileRouter.post('/:role/messages/:id', async (req, res, next) => {
  try {
    const user = await currentUser(req);
    const body = String(req.body?.message ?? req.body?.body ?? '').trim();
    if (!body) {
      return res.status(400).json({ success: false, message: 'Message body is required' });
    }
    const parentMessageId = objectId(req.params.id);
    const created = await Message.create({
      senderId: req.user?.userId,
      senderRole: req.user?.canonicalRole ?? req.user?.role ?? req.params.role,
      senderName: user?.name ?? '',
      senderEmail: user?.email ?? '',
      senderPhone: user?.phone ?? '',
      recipientRole: '',
      subject: 'Mobile reply',
      body,
      category: 'support',
      messageType: 'customer_to_admin',
      status: 'unread',
      parentMessageId,
      threadId: parentMessageId,
      branchId: req.user?.branchId ?? null
    });
    return ok(res, messageDto(created.toObject()));
  } catch (error) {
    return next(error);
  }
});
