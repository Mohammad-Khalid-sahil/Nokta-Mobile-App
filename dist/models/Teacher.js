"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherProfile = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const teacherSchema = (0, schema_1.createBaseSchema)({
    userId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    teacherCode: { type: String, required: true, trim: true, unique: true },
    gender: { type: String, enum: ['male', 'female', 'other'], default: 'other' },
    salaryType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
    fixedSalary: { type: Number, default: 0 },
    percentageRate: { type: Number, default: 0 },
    assignedSubjectIds: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Subject' }],
    assignedClassIds: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Class' }],
    active: { type: Boolean, default: true, index: true }
}, { collection: 'teachers' });
teacherSchema.index({ branchId: 1, active: 1 });
exports.TeacherProfile = mongoose_1.default.models.Teacher ?? mongoose_1.default.model('Teacher', teacherSchema);
