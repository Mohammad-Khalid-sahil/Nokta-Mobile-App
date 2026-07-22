"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Question = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const questionSchema = (0, schema_1.createBaseSchema)({
    examId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    subjectId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    text: { type: String, required: true, trim: true },
    type: { type: String, enum: ['mcq', 'short_answer', 'essay', 'true_false'], default: 'mcq' },
    options: [{ type: String, trim: true }],
    correctAnswer: { type: mongoose_1.default.Schema.Types.Mixed, default: null },
    marks: { type: Number, default: 1 },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' }
}, { collection: 'questions' });
questionSchema.index({ examId: 1, subjectId: 1 });
exports.Question = mongoose_1.default.models.Question ?? mongoose_1.default.model('Question', questionSchema);
