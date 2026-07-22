import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const aiResultInsightSchema = createBaseSchema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null, index: true },
    resultId: { type: mongoose.Schema.Types.ObjectId, ref: 'Result', default: null, index: true },
    overallScore: { type: Number, required: true },
    sourceScore: { type: Number, default: null, index: true },
    grade: { type: String, required: true, trim: true },
    message: { type: String, default: '', trim: true },
    performanceBand: {
      type: String,
      enum: ['excellent', 'good', 'needs_improvement'],
      default: 'good',
      index: true
    },
    trendStatus: { type: String, enum: ['improving', 'stable', 'declining', 'unknown'], default: 'unknown', index: true },
    riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'medium', index: true },
    strengths: [{ type: String, trim: true }],
    weaknesses: [{ type: String, trim: true }],
    weakTopics: [{ type: String, trim: true }],
    recommendations: [{ type: String, trim: true }],
    teacherNotesSuggestion: { type: String, default: '', trim: true },
    parentSummary: { type: String, default: '', trim: true },
    studentSummary: { type: String, default: '', trim: true },
    classComparison: { type: String, default: '', trim: true },
    generatedBy: { type: String, enum: ['rule_based', 'ai_provider'], default: 'rule_based' },
    confidenceScore: { type: Number, min: 0, max: 1, default: 0.75 }
  },
  { collection: 'ai_result_insights' }
);

aiResultInsightSchema.index({ studentId: 1, examId: 1 }, { unique: true });
aiResultInsightSchema.index({ classId: 1, examId: 1, riskLevel: 1 });

export const AIResultInsight = mongoose.models.AIResultInsight ?? mongoose.model('AIResultInsight', aiResultInsightSchema);
