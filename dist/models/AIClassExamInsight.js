"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIClassExamInsight = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const aiClassExamInsightSchema = (0, schema_1.createBaseSchema)({
    examId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    classId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    averageScore: { type: Number, default: 0 },
    passRate: { type: Number, default: 0 },
    failRate: { type: Number, default: 0 },
    topStrengths: [{ type: String, trim: true }],
    commonWeaknesses: [{ type: String, trim: true }],
    atRiskStudentCount: { type: Number, default: 0 },
    recommendations: [{ type: String, trim: true }],
    unusualScoreDistribution: { type: String, default: '', trim: true },
    generatedBy: { type: String, enum: ['rule_based', 'ai_provider'], default: 'rule_based' }
}, { collection: 'ai_class_exam_insights' });
aiClassExamInsightSchema.index({ examId: 1, classId: 1 }, { unique: true });
exports.AIClassExamInsight = mongoose_1.default.models.AIClassExamInsight ?? mongoose_1.default.model('AIClassExamInsight', aiClassExamInsightSchema);
