"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherRating = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const teacherRatingSchema = (0, schema_1.createBaseSchema)({
    studentId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    studentUserId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teacherId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    classId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Class', default: null, index: true },
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 1200, default: '' },
    status: { type: String, enum: ['pending_admin_review', 'reviewed', 'archived'], default: 'pending_admin_review', index: true }
}, { collection: 'teacher_ratings' });
teacherRatingSchema.index({ teacherId: 1, studentUserId: 1, createdAt: -1 });
teacherRatingSchema.index({ studentId: 1, teacherId: 1, classId: 1 }, { unique: true });
exports.TeacherRating = mongoose_1.default.models.TeacherRating ?? mongoose_1.default.model('TeacherRating', teacherRatingSchema);
