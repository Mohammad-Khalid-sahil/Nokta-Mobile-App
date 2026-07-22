"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatJalaliDate = formatJalaliDate;
exports.hasTimeConflict = hasTimeConflict;
exports.calculateDurationMinutes = calculateDurationMinutes;
exports.assertEnterprisePermission = assertEnterprisePermission;
exports.assertClassSubjectDependency = assertClassSubjectDependency;
exports.validateTimetableEntry = validateTimetableEntry;
exports.calculateGradePoints = calculateGradePoints;
exports.calculateGpa = calculateGpa;
exports.streamCertificatePdf = streamCertificatePdf;
exports.createVerificationCode = createVerificationCode;
exports.calculateEnterpriseReadiness = calculateEnterpriseReadiness;
exports.createZipBackup = createZipBackup;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dayjs_1 = __importDefault(require("dayjs"));
const jalaliday_1 = __importDefault(require("jalaliday"));
const pdfkit_1 = __importDefault(require("pdfkit"));
const qrcode_1 = __importDefault(require("qrcode"));
const archiver_1 = __importDefault(require("archiver"));
const uuid_1 = require("uuid");
const Class_1 = require("../../models/Class");
const Curriculum_1 = require("../../models/Curriculum");
const Subject_1 = require("../../models/Subject");
const Timetable_1 = require("../../models/Timetable");
const Attendance_1 = require("../../models/Attendance");
const Student_1 = require("../../models/Student");
const User_1 = require("../../models/User");
const roleHelpers_1 = require("../../utils/roleHelpers");
const enterprise_models_1 = require("./enterprise.models");
dayjs_1.default.extend(jalaliday_1.default);
function formatJalaliDate(value = new Date()) {
    return (0, dayjs_1.default)(value).calendar('jalali').locale('fa').format('YYYY/MM/DD');
}
function timeToMinutes(value) {
    const [hours, minutes] = String(value).split(':').map(Number);
    return hours * 60 + minutes;
}
function hasTimeConflict(startA, endA, startB, endB) {
    return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(startB) < timeToMinutes(endA);
}
function calculateDurationMinutes(startTime, endTime) {
    return timeToMinutes(endTime) - timeToMinutes(startTime);
}
function assertEnterprisePermission(user, permission) {
    if (!(0, roleHelpers_1.hasPermission)(user, permission)) {
        throw Object.assign(new Error('Permission denied'), { statusCode: 403 });
    }
}
async function assertClassSubjectDependency(classId, subjectId) {
    const [klass, subject] = await Promise.all([
        Class_1.ClassModel.findOne({ _id: classId, isDeleted: false }).lean(),
        Subject_1.Subject.findOne({ _id: subjectId, isDeleted: false, activeStatus: true }).lean()
    ]);
    if (!klass)
        throw new Error('Selected class is invalid.');
    if (!subject)
        throw new Error('Selected subject is invalid.');
    const subjectClassIds = new Set([
        subject.classId ? String(subject.classId) : '',
        ...(Array.isArray(subject.classIds) ? subject.classIds.map((id) => String(id)) : [])
    ].filter(Boolean));
    const classSubjectIds = new Set((klass.assignedSubjects ?? []).map((id) => String(id)));
    if (!subjectClassIds.has(String(klass._id)) && !classSubjectIds.has(String(subject._id))) {
        throw new Error('This subject is not assigned to this class.');
    }
    const curriculumCount = await Curriculum_1.Curriculum.countDocuments({ classId: klass._id, isDeleted: false, active: true });
    if (curriculumCount > 0) {
        const match = await Curriculum_1.Curriculum.exists({ classId: klass._id, subjectId: subject._id, isDeleted: false, active: true });
        if (!match)
            throw new Error('Subject is not included in the selected class curriculum.');
    }
    return { klass, subject };
}
async function validateTimetableEntry(payload) {
    await assertClassSubjectDependency(payload.classId, payload.subjectId);
    const durationMinutes = calculateDurationMinutes(payload.startTime, payload.endTime);
    if (durationMinutes <= 0)
        throw new Error('End time must be after start time.');
    const filter = { isDeleted: false, isActive: true, dayOfWeek: payload.dayOfWeek };
    if (payload.branchId)
        filter.branchId = payload.branchId;
    if (payload.excludeId)
        filter._id = { $ne: payload.excludeId };
    const entries = await Timetable_1.Timetable.find(filter).lean();
    for (const entry of entries) {
        if (!hasTimeConflict(payload.startTime, payload.endTime, entry.startTime, entry.endTime))
            continue;
        if (String(entry.teacherId) === String(payload.teacherId))
            throw new Error('This teacher already has a class scheduled during this time.');
        if (entry.room && payload.room && String(entry.room).toLowerCase() === String(payload.room).toLowerCase())
            throw new Error(`Room ${payload.room} is already booked from ${entry.startTime} to ${entry.endTime}`);
        if (String(entry.classId) === String(payload.classId))
            throw new Error('This class already has another subject scheduled during this time.');
    }
    return { durationMinutes };
}
function calculateGradePoints(grade) {
    if (grade >= 90)
        return 4;
    if (grade >= 80)
        return 3;
    if (grade >= 70)
        return 2;
    if (grade >= 60)
        return 1;
    return 0;
}
function calculateGpa(subjects) {
    const totalCredits = subjects.reduce((sum, item) => sum + Number(item.credits || 0), 0);
    const weighted = subjects.reduce((sum, item) => sum + calculateGradePoints(Number(item.grade)) * Number(item.credits || 0), 0);
    return { totalCredits, gpa: totalCredits > 0 ? Number((weighted / totalCredits).toFixed(2)) : 0 };
}
async function streamCertificatePdf(res, payload) {
    const doc = new pdfkit_1.default({ size: 'A4', margin: 56 });
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
    const qr = await qrcode_1.default.toDataURL(payload.verificationCode);
    doc.image(Buffer.from(qr.split(',')[1], 'base64'), 240, 470, { width: 120 });
    doc.fontSize(10).text(`Verification: ${payload.verificationCode}`, 56, 620, { align: 'center' });
    doc.end();
}
function createVerificationCode(prefix) {
    return `${prefix}-${(0, uuid_1.v4)()}`;
}
function readinessScore(completed, total) {
    if (total <= 0)
        return 100;
    return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
}
function readinessStatus(score) {
    if (score >= 95)
        return 'global_ready';
    if (score >= 80)
        return 'strong';
    if (score >= 60)
        return 'needs_work';
    return 'critical';
}
function branchFilter(user) {
    const role = user?.canonicalRole ?? user?.role;
    const branchId = user?.branchId;
    if (!branchId || ['super_admin', 'owner'].includes(role))
        return {};
    return { branchId };
}
async function calculateEnterpriseReadiness(user) {
    const scoped = branchFilter(user);
    const [studentTotal, studentsMissingClass, teacherTotal, teachersUnassigned, classTotal, classesWithoutSubjects, classesWithoutSchedule, subjectTotal, subjectsUnassigned, timetableEntries, attendanceTotal, transcriptTotal, examTotal, assignmentTotal, certificateTotal, backupTotal, recentSuspiciousEvents] = await Promise.all([
        Student_1.Student.countDocuments({ isDeleted: false, ...scoped }),
        Student_1.Student.countDocuments({ isDeleted: false, ...scoped, $or: [{ classId: null }, { classId: { $exists: false } }] }),
        User_1.User.countDocuments({ role: 'teacher', isDeleted: false, ...scoped }),
        User_1.User.countDocuments({ role: 'teacher', isDeleted: false, ...scoped, $or: [{ assignedClasses: { $size: 0 } }, { assignedClasses: { $exists: false } }, { assignedSubjects: { $size: 0 } }, { assignedSubjects: { $exists: false } }] }),
        Class_1.ClassModel.countDocuments({ isDeleted: false, ...scoped }),
        Class_1.ClassModel.countDocuments({ isDeleted: false, ...scoped, $or: [{ assignedSubjects: { $size: 0 } }, { assignedSubjects: { $exists: false } }] }),
        Class_1.ClassModel.countDocuments({ isDeleted: false, ...scoped, $or: [{ weeklySchedule: { $size: 0 } }, { weeklySchedule: { $exists: false } }] }),
        Subject_1.Subject.countDocuments({ isDeleted: false, activeStatus: true, ...scoped }),
        Subject_1.Subject.countDocuments({ isDeleted: false, activeStatus: true, ...scoped, $or: [{ classId: null }, { classId: { $exists: false } }, { classIds: { $size: 0 } }, { classIds: { $exists: false } }] }),
        Timetable_1.Timetable.find({ isDeleted: false, isActive: true, ...scoped }).select('classId teacherId room branchId dayOfWeek startTime endTime').lean(),
        Attendance_1.Attendance.countDocuments({ isDeleted: false, ...scoped }),
        enterprise_models_1.EnterpriseTranscript.countDocuments({ isDeleted: false, ...scoped }),
        enterprise_models_1.EnterpriseOnlineExam.countDocuments({ isDeleted: false, ...scoped }),
        enterprise_models_1.EnterpriseAssignment.countDocuments({ isDeleted: false, ...scoped }),
        enterprise_models_1.EnterpriseCertificate.countDocuments({ isDeleted: false, ...scoped }),
        enterprise_models_1.EnterpriseBackup.countDocuments({ isDeleted: false }),
        enterprise_models_1.EnterpriseSecurityEvent.countDocuments({ isDeleted: false, type: 'suspicious', createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } })
    ]);
    const timetableConflicts = [];
    for (let i = 0; i < timetableEntries.length; i += 1) {
        for (let j = i + 1; j < timetableEntries.length; j += 1) {
            const a = timetableEntries[i];
            const b = timetableEntries[j];
            if (String(a.branchId ?? '') !== String(b.branchId ?? '') || a.dayOfWeek !== b.dayOfWeek || !hasTimeConflict(a.startTime, a.endTime, b.startTime, b.endTime)) {
                continue;
            }
            if (String(a.teacherId) === String(b.teacherId))
                timetableConflicts.push({ type: 'teacher', sourceId: String(a._id), targetId: String(b._id), message: 'Teacher has overlapping timetable entries.' });
            if (a.room && b.room && String(a.room).toLowerCase() === String(b.room).toLowerCase())
                timetableConflicts.push({ type: 'room', sourceId: String(a._id), targetId: String(b._id), message: `Room ${a.room} has overlapping timetable entries.` });
            if (String(a.classId) === String(b.classId))
                timetableConflicts.push({ type: 'class', sourceId: String(a._id), targetId: String(b._id), message: 'Class has overlapping timetable entries.' });
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
async function createZipBackup(sourceDir, targetDir) {
    fs_1.default.mkdirSync(targetDir, { recursive: true });
    const fileName = `nokta-backup-${Date.now()}.zip`;
    const filePath = path_1.default.join(targetDir, fileName);
    const output = fs_1.default.createWriteStream(filePath);
    const archive = (0, archiver_1.default)('zip', { zlib: { level: 9 } });
    archive.pipe(output);
    if (fs_1.default.existsSync(sourceDir))
        archive.directory(sourceDir, false);
    await archive.finalize();
    await new Promise((resolve, reject) => {
        output.on('close', () => resolve());
        archive.on('error', reject);
    });
    return { fileName, filePath, sizeBytes: fs_1.default.statSync(filePath).size };
}
