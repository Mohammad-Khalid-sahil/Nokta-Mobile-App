"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExamResult = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const examResultSchema = (0, schema_1.createBaseSchema)({
    studentId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    examId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    subjectId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    score: { type: Number, required: true },
    grade: { type: String, required: true, trim: true },
    passed: { type: Boolean, default: true },
    remarks: { type: String, default: '', trim: true },
    publishedAt: { type: Date, default: null, index: true },
    publishedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null },
    immutableAfterPublish: { type: Boolean, default: true },
    auditHistory: { type: [schema_1.auditHistorySchema], default: [] }
}, { collection: 'exam_results' });
examResultSchema.index({ studentId: 1, examId: 1 }, { unique: true });
exports.ExamResult = mongoose_1.default.models.ExamResult ?? mongoose_1.default.model('ExamResult', examResultSchema);
