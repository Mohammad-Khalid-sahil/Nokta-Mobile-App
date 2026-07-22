import mongoose from 'mongoose';
import { createBaseSchema, auditHistorySchema } from '../utils/schema';

const examResultSchema = createBaseSchema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    score: { type: Number, required: true },
    grade: { type: String, required: true, trim: true },
    passed: { type: Boolean, default: true },
    remarks: { type: String, default: '', trim: true },
    publishedAt: { type: Date, default: null, index: true },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    immutableAfterPublish: { type: Boolean, default: true },
    auditHistory: { type: [auditHistorySchema], default: [] }
  },
  { collection: 'exam_results' }
);

examResultSchema.index({ studentId: 1, examId: 1 }, { unique: true });

export const ExamResult = mongoose.models.ExamResult ?? mongoose.model('ExamResult', examResultSchema);
