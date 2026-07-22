"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enterpriseRouter = void 0;
exports.stopEnterpriseJobs = stopEnterpriseJobs;
const path_1 = __importDefault(require("path"));
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const multer_1 = __importDefault(require("multer"));
const node_cron_1 = __importDefault(require("node-cron"));
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const env_1 = require("../../config/env");
const Attendance_1 = require("../../models/Attendance");
const Result_1 = require("../../models/Result");
const Payment_1 = require("../../models/Payment");
const Student_1 = require("../../models/Student");
const enterprise_models_1 = require("./enterprise.models");
const enterprise_utils_1 = require("./enterprise.utils");
const Timetable_1 = require("../../models/Timetable");
exports.enterpriseRouter = (0, express_1.Router)();
const upload = (0, multer_1.default)({ dest: path_1.default.join(process.cwd(), 'uploads', 'enterprise') });
const enterpriseCronTasks = [];
const objectId = joi_1.default.string().hex().length(24);
const timetableSchema = joi_1.default.object({ body: joi_1.default.object({
        classId: objectId.required(),
        subjectId: objectId.required(),
        teacherId: objectId.required(),
        room: joi_1.default.string().trim().required(),
        branchId: objectId.allow('', null).optional(),
        dayOfWeek: joi_1.default.number().integer().min(0).max(6).required(),
        startTime: joi_1.default.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
        endTime: joi_1.default.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
        academicYear: joi_1.default.string().allow('', null).optional(),
        semester: joi_1.default.string().allow('', null).optional(),
        isActive: joi_1.default.boolean().optional()
    }) });
const transcriptSchema = joi_1.default.object({ body: joi_1.default.object({
        studentId: objectId.required(),
        branchId: objectId.allow('', null).optional(),
        semester: joi_1.default.string().required(),
        academicYear: joi_1.default.string().allow('', null).optional(),
        subjects: joi_1.default.array().items(joi_1.default.object({ subjectId: objectId.required(), subjectName: joi_1.default.string().allow('', null), grade: joi_1.default.number().min(0).max(100).required(), credits: joi_1.default.number().min(0).required() })).min(1).required()
    }) });
const onlineExamSchema = joi_1.default.object({ body: joi_1.default.object({
        classId: objectId.required(),
        subjectId: objectId.required(),
        teacherId: objectId.required(),
        branchId: objectId.allow('', null).optional(),
        title: joi_1.default.string().trim().required(),
        durationMinutes: joi_1.default.number().integer().min(1).required(),
        startsAt: joi_1.default.date().iso().required(),
        endsAt: joi_1.default.date().iso().required(),
        randomizeQuestions: joi_1.default.boolean().optional(),
        attemptLimit: joi_1.default.number().integer().min(1).optional(),
        questions: joi_1.default.array().items(joi_1.default.object({ type: joi_1.default.string().valid('mcq', 'essay').required(), prompt: joi_1.default.string().required(), options: joi_1.default.array().items(joi_1.default.string()).optional(), correctAnswer: joi_1.default.string().allow('', null), points: joi_1.default.number().min(0).optional() })).min(1).required(),
        isPublished: joi_1.default.boolean().optional()
    }) });
const attemptSubmitSchema = joi_1.default.object({ body: joi_1.default.object({ answers: joi_1.default.array().items(joi_1.default.object({ questionId: joi_1.default.string().required(), answer: joi_1.default.string().allow('', null) })).required() }) });
const assignmentSchema = joi_1.default.object({ body: joi_1.default.object({
        classId: objectId.required(),
        subjectId: objectId.required(),
        teacherId: objectId.required(),
        branchId: objectId.allow('', null).optional(),
        title: joi_1.default.string().trim().required(),
        description: joi_1.default.string().allow('', null).optional(),
        deadline: joi_1.default.date().iso().required(),
        maxScore: joi_1.default.number().min(0).optional(),
        isPublished: joi_1.default.boolean().optional()
    }) });
const certificateSchema = joi_1.default.object({ body: joi_1.default.object({ studentId: objectId.required(), branchId: objectId.allow('', null).optional(), type: joi_1.default.string().valid('graduation', 'attendance', 'completion').required(), title: joi_1.default.string().required() }) });
exports.enterpriseRouter.use(auth_1.authenticate);
exports.enterpriseRouter.get('/health', (req, res) => {
    (0, enterprise_utils_1.assertEnterprisePermission)(req.user, 'REPORT_VIEW');
    res.json((0, response_1.createResponse)({ status: 'enterprise-ready', jalaliDate: (0, enterprise_utils_1.formatJalaliDate)(), modules: 11 }));
});
exports.enterpriseRouter.get('/readiness', async (req, res, next) => {
    try {
        (0, enterprise_utils_1.assertEnterprisePermission)(req.user, 'REPORT_VIEW');
        const readiness = await (0, enterprise_utils_1.calculateEnterpriseReadiness)(req.user);
        res.json((0, response_1.createResponse)(readiness));
    }
    catch (error) {
        next(error);
    }
});
exports.enterpriseRouter.post('/timetable/validate', (0, validate_1.validate)(timetableSchema), async (req, res, next) => {
    try {
        (0, enterprise_utils_1.assertEnterprisePermission)(req.user, 'CLASS_UPDATE');
        const result = await (0, enterprise_utils_1.validateTimetableEntry)(req.body);
        res.json((0, response_1.createResponse)(result, 'Timetable entry is conflict-free'));
    }
    catch (error) {
        res.status(error.statusCode ?? 400).json((0, response_1.createError)(error.message));
    }
});
exports.enterpriseRouter.post('/timetable', (0, validate_1.validate)(timetableSchema), async (req, res) => {
    try {
        (0, enterprise_utils_1.assertEnterprisePermission)(req.user, 'CLASS_UPDATE');
        const validation = await (0, enterprise_utils_1.validateTimetableEntry)(req.body);
        const item = await Timetable_1.Timetable.create({ ...req.body, durationMinutes: validation.durationMinutes, active: req.body.isActive ?? true });
        res.status(201).json((0, response_1.createResponse)(item, 'Enterprise timetable item created'));
    }
    catch (error) {
        res.status(error.statusCode ?? 400).json((0, response_1.createError)(error.message));
    }
});
exports.enterpriseRouter.get('/attendance/active-sessions', async (req, res) => {
    (0, enterprise_utils_1.assertEnterprisePermission)(req.user, 'ATTENDANCE_VIEW');
    const now = new Date();
    const dayOfWeek = now.getDay();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const entries = await Timetable_1.Timetable.find({ isDeleted: false, isActive: true, dayOfWeek }).populate('classId', 'className').populate('subjectId', 'title').populate('teacherId', 'name').lean();
    const active = entries.filter((entry) => {
        const [startHour, startMinute] = entry.startTime.split(':').map(Number);
        const [endHour, endMinute] = entry.endTime.split(':').map(Number);
        return currentMinutes >= (startHour * 60 + startMinute - 10) && currentMinutes <= (endHour * 60 + endMinute + 15);
    });
    res.json((0, response_1.createResponse)(active.map((entry) => ({ ...entry, countdownClosesAt: entry.endTime, jalaliDate: (0, enterprise_utils_1.formatJalaliDate)() }))));
});
exports.enterpriseRouter.get('/subjects/by-class/:classId', async (req, res) => {
    (0, enterprise_utils_1.assertEnterprisePermission)(req.user, 'SUBJECT_VIEW');
    const subjects = await Promise.resolve().then(() => __importStar(require('../../models/Subject'))).then(({ Subject }) => Subject.find({ isDeleted: false, activeStatus: true, $or: [{ classId: req.params.classId }, { classIds: req.params.classId }] }).sort({ title: 1 }).lean());
    res.json((0, response_1.createResponse)(subjects));
});
exports.enterpriseRouter.post('/subjects/validate', async (req, res) => {
    try {
        (0, enterprise_utils_1.assertEnterprisePermission)(req.user, 'SUBJECT_VIEW');
        await (0, enterprise_utils_1.assertClassSubjectDependency)(req.body.classId, req.body.subjectId);
        res.json((0, response_1.createResponse)({ valid: true }));
    }
    catch (error) {
        res.status(error.statusCode ?? 400).json((0, response_1.createError)(error.message));
    }
});
exports.enterpriseRouter.post('/transcripts', (0, validate_1.validate)(transcriptSchema), async (req, res) => {
    try {
        (0, enterprise_utils_1.assertEnterprisePermission)(req.user, 'RESULT_CREATE');
        const { totalCredits, gpa } = (0, enterprise_utils_1.calculateGpa)(req.body.subjects);
        const previous = await enterprise_models_1.EnterpriseTranscript.find({ studentId: req.body.studentId, isDeleted: false }).lean();
        const cumulativeCredits = previous.reduce((sum, item) => sum + Number(item.totalCredits ?? 0), 0) + totalCredits;
        const cumulativeWeighted = previous.reduce((sum, item) => sum + Number(item.gpa ?? 0) * Number(item.totalCredits ?? 0), 0) + gpa * totalCredits;
        const transcript = await enterprise_models_1.EnterpriseTranscript.create({ ...req.body, totalCredits, gpa, cgpa: cumulativeCredits ? Number((cumulativeWeighted / cumulativeCredits).toFixed(2)) : gpa, verificationCode: (0, enterprise_utils_1.createVerificationCode)('TRN') });
        res.status(201).json((0, response_1.createResponse)(transcript));
    }
    catch (error) {
        res.status(error.statusCode ?? 400).json((0, response_1.createError)(error.message));
    }
});
exports.enterpriseRouter.get('/transcripts/:id/pdf', async (req, res) => {
    (0, enterprise_utils_1.assertEnterprisePermission)(req.user, 'RESULT_VIEW');
    const transcript = await enterprise_models_1.EnterpriseTranscript.findById(req.params.id).populate('studentId', 'firstName lastName').lean();
    if (!transcript)
        return res.status(404).json((0, response_1.createError)('Transcript not found'));
    return (0, enterprise_utils_1.streamCertificatePdf)(res, { title: `Transcript GPA ${transcript.gpa} CGPA ${transcript.cgpa}`, studentName: [transcript.studentId?.firstName, transcript.studentId?.lastName].filter(Boolean).join(' '), verificationCode: transcript.verificationCode, type: 'transcript' });
});
exports.enterpriseRouter.post('/online-exams', (0, validate_1.validate)(onlineExamSchema), async (req, res) => {
    try {
        (0, enterprise_utils_1.assertEnterprisePermission)(req.user, 'EXAM_CREATE');
        await (0, enterprise_utils_1.assertClassSubjectDependency)(req.body.classId, req.body.subjectId);
        const exam = await enterprise_models_1.EnterpriseOnlineExam.create(req.body);
        res.status(201).json((0, response_1.createResponse)(exam));
    }
    catch (error) {
        res.status(error.statusCode ?? 400).json((0, response_1.createError)(error.message));
    }
});
exports.enterpriseRouter.post('/online-exams/:id/start', async (req, res) => {
    try {
        (0, enterprise_utils_1.assertEnterprisePermission)(req.user, 'EXAM_VIEW');
        const student = await Student_1.Student.findOne({ studentId: req.user?.studentId, isDeleted: false }).lean();
        const studentId = req.body.studentId ?? student?._id;
        const attempt = await enterprise_models_1.EnterpriseExamAttempt.create({ examId: req.params.id, studentId, ipAddress: req.ip, userAgent: req.get('user-agent') ?? '', logs: [{ type: 'start', detail: 'Exam attempt started' }] });
        res.status(201).json((0, response_1.createResponse)(attempt));
    }
    catch (error) {
        res.status(409).json((0, response_1.createError)('Exam attempt already exists or cannot be started.'));
    }
});
exports.enterpriseRouter.post('/online-attempts/:id/submit', (0, validate_1.validate)(attemptSubmitSchema), async (req, res) => {
    try {
        (0, enterprise_utils_1.assertEnterprisePermission)(req.user, 'EXAM_VIEW');
        const attempt = await enterprise_models_1.EnterpriseExamAttempt.findOne({ _id: req.params.id, status: 'in_progress', isDeleted: false });
        if (!attempt)
            return res.status(409).json((0, response_1.createError)('Attempt is locked or already submitted.'));
        attempt.answers = req.body.answers;
        attempt.status = 'submitted';
        attempt.submittedAt = new Date();
        attempt.logs.push({ type: 'submit', detail: 'Submitted by user' });
        await attempt.save();
        res.json((0, response_1.createResponse)(attempt));
    }
    catch (error) {
        res.status(error.statusCode ?? 400).json((0, response_1.createError)(error.message));
    }
});
exports.enterpriseRouter.post('/assignments', upload.array('files'), (0, validate_1.validate)(assignmentSchema), async (req, res) => {
    try {
        (0, enterprise_utils_1.assertEnterprisePermission)(req.user, 'CURRICULUM_CREATE');
        await (0, enterprise_utils_1.assertClassSubjectDependency)(req.body.classId, req.body.subjectId);
        const files = (req.files ?? []).map((file) => file.path);
        const assignment = await enterprise_models_1.EnterpriseAssignment.create({ ...req.body, attachments: files });
        res.status(201).json((0, response_1.createResponse)(assignment));
    }
    catch (error) {
        res.status(error.statusCode ?? 400).json((0, response_1.createError)(error.message));
    }
});
exports.enterpriseRouter.post('/assignments/:id/submit', upload.array('files'), async (req, res) => {
    try {
        (0, enterprise_utils_1.assertEnterprisePermission)(req.user, 'CURRICULUM_VIEW');
        const assignment = await enterprise_models_1.EnterpriseAssignment.findById(req.params.id).lean();
        if (!assignment)
            return res.status(404).json((0, response_1.createError)('Assignment not found'));
        const files = (req.files ?? []).map((file) => file.path);
        const submission = await enterprise_models_1.EnterpriseAssignmentSubmission.create({ assignmentId: req.params.id, studentId: req.body.studentId, files, answerText: req.body.answerText ?? '', isLate: new Date() > new Date(assignment.deadline) });
        res.status(201).json((0, response_1.createResponse)(submission));
    }
    catch (error) {
        res.status(409).json((0, response_1.createError)(error.message));
    }
});
exports.enterpriseRouter.post('/certificates', (0, validate_1.validate)(certificateSchema), async (req, res) => {
    try {
        (0, enterprise_utils_1.assertEnterprisePermission)(req.user, 'RESULT_CREATE');
        const verificationCode = (0, enterprise_utils_1.createVerificationCode)('CERT');
        const cert = await enterprise_models_1.EnterpriseCertificate.create({ ...req.body, verificationCode, signedBy: req.user?.userId ?? null });
        res.status(201).json((0, response_1.createResponse)(cert));
    }
    catch (error) {
        res.status(error.statusCode ?? 400).json((0, response_1.createError)(error.message));
    }
});
exports.enterpriseRouter.get('/certificates/verify/:code', async (req, res) => {
    (0, enterprise_utils_1.assertEnterprisePermission)(req.user, 'RESULT_VIEW');
    const cert = await enterprise_models_1.EnterpriseCertificate.findOne({ verificationCode: req.params.code, isDeleted: false }).populate('studentId', 'firstName lastName').lean();
    res.json((0, response_1.createResponse)({ valid: Boolean(cert), certificate: cert ?? null }));
});
exports.enterpriseRouter.get('/certificates/:id/pdf', async (req, res) => {
    (0, enterprise_utils_1.assertEnterprisePermission)(req.user, 'RESULT_VIEW');
    const cert = await enterprise_models_1.EnterpriseCertificate.findById(req.params.id).populate('studentId', 'firstName lastName').lean();
    if (!cert)
        return res.status(404).json((0, response_1.createError)('Certificate not found'));
    return (0, enterprise_utils_1.streamCertificatePdf)(res, { title: cert.title, studentName: [cert.studentId?.firstName, cert.studentId?.lastName].filter(Boolean).join(' '), verificationCode: cert.verificationCode, type: cert.type });
});
exports.enterpriseRouter.get('/parents/:studentId/monitoring', async (req, res) => {
    (0, enterprise_utils_1.assertEnterprisePermission)(req.user, 'DASHBOARD_VIEW');
    const [attendance, results, payments] = await Promise.all([
        Attendance_1.Attendance.find({ studentId: req.params.studentId, isDeleted: false }).sort({ attendanceDate: -1 }).limit(30).lean(),
        Result_1.Result.find({ student: req.params.studentId, isDeleted: false }).sort({ createdAt: -1 }).limit(30).lean(),
        Payment_1.Payment.find({ studentId: req.params.studentId, isDeleted: false }).sort({ paymentDate: -1 }).limit(30).lean()
    ]);
    res.json((0, response_1.createResponse)({ attendance, results, payments }));
});
exports.enterpriseRouter.get('/analytics/advanced', async (req, res) => {
    (0, enterprise_utils_1.assertEnterprisePermission)(req.user, 'REPORT_VIEW');
    const [attendanceByStatus, teacherLoad, classUtilization] = await Promise.all([
        Attendance_1.Attendance.aggregate([{ $match: { isDeleted: false } }, { $group: { _id: '$status', total: { $sum: 1 } } }]),
        Timetable_1.Timetable.aggregate([{ $match: { isDeleted: false, isActive: true } }, { $group: { _id: '$teacherId', minutes: { $sum: '$durationMinutes' } } }]),
        Timetable_1.Timetable.aggregate([{ $match: { isDeleted: false, isActive: true } }, { $group: { _id: '$classId', sessions: { $sum: 1 } } }])
    ]);
    res.json((0, response_1.createResponse)({ attendanceByStatus, teacherLoad, classUtilization, jalaliDate: (0, enterprise_utils_1.formatJalaliDate)() }));
});
exports.enterpriseRouter.post('/backups/manual', async (req, res) => {
    try {
        (0, enterprise_utils_1.assertEnterprisePermission)(req.user, 'AUDIT_VIEW');
        const backup = await (0, enterprise_utils_1.createZipBackup)(path_1.default.join(process.cwd(), 'uploads'), path_1.default.join(process.cwd(), 'backups'));
        const record = await enterprise_models_1.EnterpriseBackup.create({ ...backup, requestedBy: req.user?.userId ?? null, createdAtJalali: (0, enterprise_utils_1.formatJalaliDate)() });
        res.status(201).json((0, response_1.createResponse)(record));
    }
    catch (error) {
        res.status(error.statusCode ?? 400).json((0, response_1.createError)(error.message));
    }
});
exports.enterpriseRouter.get('/backups/:id/download', async (req, res) => {
    (0, enterprise_utils_1.assertEnterprisePermission)(req.user, 'AUDIT_VIEW');
    const backup = await enterprise_models_1.EnterpriseBackup.findById(req.params.id).lean();
    if (!backup)
        return res.status(404).json((0, response_1.createError)('Backup not found'));
    return res.download(backup.filePath, backup.fileName);
});
exports.enterpriseRouter.post('/security/events', async (req, res) => {
    (0, enterprise_utils_1.assertEnterprisePermission)(req.user, 'AUDIT_VIEW');
    const riskScore = req.body.type === 'suspicious' ? 80 : 10;
    const event = await enterprise_models_1.EnterpriseSecurityEvent.create({ ...req.body, userId: req.body.userId ?? req.user?.userId ?? null, ipAddress: req.ip, userAgent: req.get('user-agent') ?? '', riskScore });
    res.status(201).json((0, response_1.createResponse)(event));
});
exports.enterpriseRouter.get('/security/events', async (req, res) => {
    (0, enterprise_utils_1.assertEnterprisePermission)(req.user, 'AUDIT_VIEW');
    const events = await enterprise_models_1.EnterpriseSecurityEvent.find({ isDeleted: false }).sort({ createdAt: -1 }).limit(100).lean();
    res.json((0, response_1.createResponse)(events));
});
if (env_1.config.enableJobs) {
    enterpriseCronTasks.push(node_cron_1.default.schedule('0 2 * * *', async () => {
        try {
            const backup = await (0, enterprise_utils_1.createZipBackup)(path_1.default.join(process.cwd(), 'uploads'), path_1.default.join(process.cwd(), 'backups'));
            await enterprise_models_1.EnterpriseBackup.create({ ...backup, createdAtJalali: (0, enterprise_utils_1.formatJalaliDate)() });
        }
        catch (error) {
            console.error('[ENTERPRISE BACKUP]', error);
        }
    }));
}
function stopEnterpriseJobs() {
    for (const task of enterpriseCronTasks) {
        task.stop();
        task.destroy();
    }
    enterpriseCronTasks.length = 0;
}
