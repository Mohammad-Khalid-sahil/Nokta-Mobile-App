"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Enrollment = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const enrollmentSchema = (0, schema_1.createBaseSchema)({
    studentId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    classId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    subjectId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    teacherId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    academicYear: { type: String, required: true, trim: true },
    status: { type: String, enum: ['active', 'completed', 'suspended', 'cancelled'], default: 'active', index: true },
    enrolledAt: { type: Date, default: Date.now },
    registrationExpiryDate: { type: Date, default: null }
}, { collection: 'enrollments' });
enrollmentSchema.index({ studentId: 1, classId: 1, subjectId: 1, academicYear: 1 }, { unique: true });
exports.Enrollment = mongoose_1.default.models.Enrollment ?? mongoose_1.default.model('Enrollment', enrollmentSchema);
