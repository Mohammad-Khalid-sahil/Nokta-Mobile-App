"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Result = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
/**
 * Result score is a single 0–100 value.
 * Legacy component fields (classroomActivityScore, attendanceScore,
 * midtermScore, finalExamScore) were removed from the schema; a one-time
 * migration consolidates them into `score` and $unsets the old keys.
 */
const resultSchema = (0, schema_1.createBaseSchema)({
    student: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    exam: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    classId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Class', default: null, index: true },
    subjectId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Subject', default: null, index: true },
    teacherId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    grade: { type: String, required: true, trim: true },
    remarks: { type: String, default: '', trim: true },
    gradedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedAt: { type: Date, default: null, index: true },
    immutableAfterPublish: { type: Boolean, default: true },
    auditHistory: { type: [schema_1.auditHistorySchema], default: [] }
}, { collection: 'results' });
resultSchema.index({ student: 1, exam: 1 }, { unique: true });
exports.Result = mongoose_1.default.models.Result ?? mongoose_1.default.model('Result', resultSchema);
