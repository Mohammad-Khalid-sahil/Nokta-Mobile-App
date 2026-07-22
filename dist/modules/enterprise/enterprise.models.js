"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnterpriseSecurityEvent = exports.EnterpriseBackup = exports.EnterpriseCertificate = exports.EnterpriseAssignmentSubmission = exports.EnterpriseAssignment = exports.EnterpriseExamAttempt = exports.EnterpriseOnlineExam = exports.EnterpriseTranscript = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../../utils/schema");
const transcriptSchema = (0, schema_1.createBaseSchema)({
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    studentId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    semester: { type: String, trim: true, required: true, index: true },
    academicYear: { type: String, trim: true, default: '' },
    subjects: [{
            subjectId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Subject', required: true },
            subjectName: { type: String, trim: true, default: '' },
            grade: { type: Number, min: 0, max: 100, required: true },
            credits: { type: Number, min: 0, required: true },
            points: { type: Number, min: 0, default: 0 }
        }],
    totalCredits: { type: Number, min: 0, default: 0 },
    gpa: { type: Number, min: 0, max: 4, default: 0 },
    cgpa: { type: Number, min: 0, max: 4, default: 0 },
    issuedAt: { type: Date, default: Date.now },
    verificationCode: { type: String, trim: true, unique: true, sparse: true, index: true }
}, { collection: 'enterprise_transcripts' });
const onlineExamSchema = (0, schema_1.createBaseSchema)({
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    classId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    subjectId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    teacherId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, trim: true, required: true },
    durationMinutes: { type: Number, min: 1, required: true },
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, required: true, index: true },
    randomizeQuestions: { type: Boolean, default: true },
    attemptLimit: { type: Number, min: 1, default: 1 },
    questions: [{
            type: { type: String, enum: ['mcq', 'essay'], required: true },
            prompt: { type: String, trim: true, required: true },
            options: [{ type: String, trim: true }],
            correctAnswer: { type: String, trim: true, default: '' },
            points: { type: Number, min: 0, default: 1 }
        }],
    isPublished: { type: Boolean, default: false, index: true }
}, { collection: 'enterprise_online_exams' });
const examAttemptSchema = (0, schema_1.createBaseSchema)({
    examId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'EnterpriseOnlineExam', required: true, index: true },
    studentId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date, default: null },
    answers: [{ questionId: String, answer: String }],
    score: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ['in_progress', 'submitted', 'auto_submitted', 'locked'], default: 'in_progress', index: true },
    logs: [{ type: { type: String, trim: true }, at: { type: Date, default: Date.now }, detail: { type: String, trim: true, default: '' } }],
    ipAddress: { type: String, trim: true, default: '' },
    userAgent: { type: String, trim: true, default: '' }
}, { collection: 'enterprise_exam_attempts' });
examAttemptSchema.index({ examId: 1, studentId: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
const assignmentSchema = (0, schema_1.createBaseSchema)({
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    classId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    subjectId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    teacherId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: '' },
    deadline: { type: Date, required: true, index: true },
    maxScore: { type: Number, min: 0, default: 100 },
    attachments: [{ type: String, trim: true }],
    isPublished: { type: Boolean, default: true, index: true }
}, { collection: 'enterprise_assignments' });
const assignmentSubmissionSchema = (0, schema_1.createBaseSchema)({
    assignmentId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'EnterpriseAssignment', required: true, index: true },
    studentId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    files: [{ type: String, trim: true }],
    answerText: { type: String, trim: true, default: '' },
    submittedAt: { type: Date, default: Date.now },
    isLate: { type: Boolean, default: false, index: true },
    grade: { type: Number, min: 0, default: null },
    feedback: { type: String, trim: true, default: '' },
    gradedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null }
}, { collection: 'enterprise_assignment_submissions' });
assignmentSubmissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
const certificateSchema = (0, schema_1.createBaseSchema)({
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    studentId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    type: { type: String, enum: ['graduation', 'attendance', 'completion'], required: true, index: true },
    title: { type: String, trim: true, required: true },
    issuedAt: { type: Date, default: Date.now },
    verificationCode: { type: String, trim: true, unique: true, index: true },
    qrDataUrl: { type: String, trim: true, default: '' },
    pdfPath: { type: String, trim: true, default: '' },
    signedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null }
}, { collection: 'enterprise_certificates' });
const backupSchema = (0, schema_1.createBaseSchema)({
    requestedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null },
    fileName: { type: String, trim: true, required: true },
    filePath: { type: String, trim: true, required: true },
    status: { type: String, enum: ['created', 'failed', 'restored'], default: 'created', index: true },
    sizeBytes: { type: Number, min: 0, default: 0 },
    createdAtJalali: { type: String, trim: true, default: '' }
}, { collection: 'enterprise_backups' });
const securityEventSchema = (0, schema_1.createBaseSchema)({
    userId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    type: { type: String, enum: ['login', 'logout', 'device', 'suspicious', 'two_factor'], required: true, index: true },
    ipAddress: { type: String, trim: true, default: '' },
    userAgent: { type: String, trim: true, default: '' },
    deviceId: { type: String, trim: true, default: '' },
    detail: { type: String, trim: true, default: '' },
    riskScore: { type: Number, min: 0, max: 100, default: 0 }
}, { collection: 'enterprise_security_events' });
exports.EnterpriseTranscript = mongoose_1.default.models.EnterpriseTranscript ?? mongoose_1.default.model('EnterpriseTranscript', transcriptSchema);
exports.EnterpriseOnlineExam = mongoose_1.default.models.EnterpriseOnlineExam ?? mongoose_1.default.model('EnterpriseOnlineExam', onlineExamSchema);
exports.EnterpriseExamAttempt = mongoose_1.default.models.EnterpriseExamAttempt ?? mongoose_1.default.model('EnterpriseExamAttempt', examAttemptSchema);
exports.EnterpriseAssignment = mongoose_1.default.models.EnterpriseAssignment ?? mongoose_1.default.model('EnterpriseAssignment', assignmentSchema);
exports.EnterpriseAssignmentSubmission = mongoose_1.default.models.EnterpriseAssignmentSubmission ?? mongoose_1.default.model('EnterpriseAssignmentSubmission', assignmentSubmissionSchema);
exports.EnterpriseCertificate = mongoose_1.default.models.EnterpriseCertificate ?? mongoose_1.default.model('EnterpriseCertificate', certificateSchema);
exports.EnterpriseBackup = mongoose_1.default.models.EnterpriseBackup ?? mongoose_1.default.model('EnterpriseBackup', backupSchema);
exports.EnterpriseSecurityEvent = mongoose_1.default.models.EnterpriseSecurityEvent ?? mongoose_1.default.model('EnterpriseSecurityEvent', securityEventSchema);
