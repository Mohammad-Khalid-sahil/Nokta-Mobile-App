import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const aiClassExamInsightSchema = createBaseSchema(
  {
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    averageScore: { type: Number, default: 0 },
    passRate: { type: Number, default: 0 },
    failRate: { type: Number, default: 0 },
    topStrengths: [{ type: String, trim: true }],
    commonWeaknesses: [{ type: String, trim: true }],
    atRiskStudentCount: { type: Number, default: 0 },
    recommendations: [{ type: String, trim: true }],
    unusualScoreDistribution: { type: String, default: '', trim: true },
    generatedBy: { type: String, enum: ['rule_based', 'ai_provider'], default: 'rule_based' }
  },
  { collection: 'ai_class_exam_insights' }
);

aiClassExamInsightSchema.index({ examId: 1, classId: 1 }, { unique: true });

export const AIClassExamInsight = mongoose.models.AIClassExamInsight ?? mongoose.model('AIClassExamInsight', aiClassExamInsightSchema);
