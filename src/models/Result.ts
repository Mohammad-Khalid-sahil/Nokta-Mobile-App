import mongoose from 'mongoose';
import { createBaseSchema, auditHistorySchema } from '../utils/schema';

/**
 * Result score is a single 0–100 value.
 * Legacy component fields (classroomActivityScore, attendanceScore,
 * midtermScore, finalExamScore) were removed from the schema; a one-time
 * migration consolidates them into `score` and $unsets the old keys.
 */
const resultSchema = createBaseSchema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    grade: { type: String, required: true, trim: true },
    remarks: { type: String, default: '', trim: true },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedAt: { type: Date, default: null, index: true },
    immutableAfterPublish: { type: Boolean, default: true },
    auditHistory: { type: [auditHistorySchema], default: [] }
  },
  { collection: 'results' }
);

resultSchema.index({ student: 1, exam: 1 }, { unique: true });

export const Result = mongoose.models.Result ?? mongoose.model('Result', resultSchema);
