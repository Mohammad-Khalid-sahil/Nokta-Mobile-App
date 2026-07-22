"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Exam = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const examSchema = (0, schema_1.createBaseSchema)({
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    title: { type: String, required: true, trim: true },
    subject: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    class: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    teacherId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: Date, required: true },
    totalMarks: { type: Number, default: 100 },
    passingMarks: { type: Number, default: 40 },
    examType: { type: String, enum: ['midterm', 'final', 'quiz'], default: 'midterm' },
    examCode: { type: String, required: true, unique: true, trim: true },
    onlineExamUrl: { type: String, trim: true, default: '' },
    googleFormUrl: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
    publishedAt: { type: Date, default: null }
}, { collection: 'exams' });
examSchema.index({ date: 1, subject: 1 });
examSchema.index({ class: 1, status: 1 });
exports.Exam = mongoose_1.default.models.Exam ?? mongoose_1.default.model('Exam', examSchema);
