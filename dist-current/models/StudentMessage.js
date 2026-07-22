"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentMessage = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const studentMessageSchema = (0, schema_1.createBaseSchema)({
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    studentId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teacherId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, trim: true, default: '' },
    message: { type: String, required: true, trim: true },
    status: { type: String, enum: ['sent', 'read', 'answered', 'archived'], default: 'sent', index: true },
    whatsappLink: { type: String, trim: true, default: '' },
    readAt: { type: Date, default: null }
}, { collection: 'student_messages' });
studentMessageSchema.index({ studentId: 1, teacherId: 1, createdAt: -1 });
exports.StudentMessage = mongoose_1.default.models.StudentMessage ?? mongoose_1.default.model('StudentMessage', studentMessageSchema);
