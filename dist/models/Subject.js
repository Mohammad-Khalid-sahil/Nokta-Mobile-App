"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Subject = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const subjectSchema = (0, schema_1.createBaseSchema)({
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    title: { type: String, required: true, trim: true, index: true },
    code: { type: String, required: true, trim: true, unique: true },
    classId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    classIds: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Class', index: true }],
    feeAmount: { type: Number, default: 0 },
    teacher: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    examCount: { type: Number, default: 0 },
    activeStatus: { type: Boolean, default: true, index: true },
    description: { type: String, default: '', trim: true }
}, { collection: 'subjects' });
subjectSchema.index({ title: 1, code: 1 });
subjectSchema.index({ classId: 1, teacher: 1, activeStatus: 1 });
subjectSchema.index({ classIds: 1, activeStatus: 1 });
exports.Subject = mongoose_1.default.models.Subject ?? mongoose_1.default.model('Subject', subjectSchema);
