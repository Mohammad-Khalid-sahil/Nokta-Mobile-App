import mongoose from 'mongoose';
import { createBaseSchema } from '../../utils/schema';

const transcriptSchema = createBaseSchema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    semester: { type: String, trim: true, required: true, index: true },
    academicYear: { type: String, trim: true, default: '' },
    subjects: [{
      subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
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
  },
  { collection: 'enterprise_transcripts' }
);

const onlineExamSchema = createBaseSchema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
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
  },
  { collection: 'enterprise_online_exams' }
);

const examAttemptSchema = createBaseSchema(
  {
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'EnterpriseOnlineExam', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date, default: null },
    answers: [{ questionId: String, answer: String }],
    score: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ['in_progress', 'submitted', 'auto_submitted', 'locked'], default: 'in_progress', index: true },
    logs: [{ type: { type: String, trim: true }, at: { type: Date, default: Date.now }, detail: { type: String, trim: true, default: '' } }],
    ipAddress: { type: String, trim: true, default: '' },
    userAgent: { type: String, trim: true, default: '' }
  },
  { collection: 'enterprise_exam_attempts' }
);

examAttemptSchema.index({ examId: 1, studentId: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });

const assignmentSchema = createBaseSchema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: '' },
    deadline: { type: Date, required: true, index: true },
    maxScore: { type: Number, min: 0, default: 100 },
    attachments: [{ type: String, trim: true }],
    isPublished: { type: Boolean, default: true, index: true }
  },
  { collection: 'enterprise_assignments' }
);

const assignmentSubmissionSchema = createBaseSchema(
  {
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'EnterpriseAssignment', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    files: [{ type: String, trim: true }],
    answerText: { type: String, trim: true, default: '' },
    submittedAt: { type: Date, default: Date.now },
    isLate: { type: Boolean, default: false, index: true },
    grade: { type: Number, min: 0, default: null },
    feedback: { type: String, trim: true, default: '' },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { collection: 'enterprise_assignment_submissions' }
);

assignmentSubmissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });

const certificateSchema = createBaseSchema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    type: { type: String, enum: ['graduation', 'attendance', 'completion'], required: true, index: true },
    title: { type: String, trim: true, required: true },
    issuedAt: { type: Date, default: Date.now },
    verificationCode: { type: String, trim: true, unique: true, index: true },
    qrDataUrl: { type: String, trim: true, default: '' },
    pdfPath: { type: String, trim: true, default: '' },
    signedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { collection: 'enterprise_certificates' }
);

const backupSchema = createBaseSchema(
  {
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    fileName: { type: String, trim: true, required: true },
    filePath: { type: String, trim: true, required: true },
    status: { type: String, enum: ['created', 'failed', 'restored'], default: 'created', index: true },
    sizeBytes: { type: Number, min: 0, default: 0 },
    createdAtJalali: { type: String, trim: true, default: '' }
  },
  { collection: 'enterprise_backups' }
);

const securityEventSchema = createBaseSchema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    type: { type: String, enum: ['login', 'logout', 'device', 'suspicious', 'two_factor'], required: true, index: true },
    ipAddress: { type: String, trim: true, default: '' },
    userAgent: { type: String, trim: true, default: '' },
    deviceId: { type: String, trim: true, default: '' },
    detail: { type: String, trim: true, default: '' },
    riskScore: { type: Number, min: 0, max: 100, default: 0 }
  },
  { collection: 'enterprise_security_events' }
);

export const EnterpriseTranscript = mongoose.models.EnterpriseTranscript ?? mongoose.model('EnterpriseTranscript', transcriptSchema);
export const EnterpriseOnlineExam = mongoose.models.EnterpriseOnlineExam ?? mongoose.model('EnterpriseOnlineExam', onlineExamSchema);
export const EnterpriseExamAttempt = mongoose.models.EnterpriseExamAttempt ?? mongoose.model('EnterpriseExamAttempt', examAttemptSchema);
export const EnterpriseAssignment = mongoose.models.EnterpriseAssignment ?? mongoose.model('EnterpriseAssignment', assignmentSchema);
export const EnterpriseAssignmentSubmission = mongoose.models.EnterpriseAssignmentSubmission ?? mongoose.model('EnterpriseAssignmentSubmission', assignmentSubmissionSchema);
export const EnterpriseCertificate = mongoose.models.EnterpriseCertificate ?? mongoose.model('EnterpriseCertificate', certificateSchema);
export const EnterpriseBackup = mongoose.models.EnterpriseBackup ?? mongoose.model('EnterpriseBackup', backupSchema);
export const EnterpriseSecurityEvent = mongoose.models.EnterpriseSecurityEvent ?? mongoose.model('EnterpriseSecurityEvent', securityEventSchema);
