"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LearningResource = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const learningResourceSchema = (0, schema_1.createBaseSchema)({
    title: { type: String, required: true, trim: true },
    subjectId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Subject', default: null, index: true },
    classId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Class', default: null, index: true },
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    uploadedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null },
    type: { type: String, enum: ['document', 'video', 'link', 'assignment', 'book'], default: 'document' },
    accessRoles: [{ type: String, trim: true }],
    url: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    published: { type: Boolean, default: true },
    fileName: { type: String, default: '', trim: true },
    fileOriginalName: { type: String, default: '', trim: true },
    fileMimeType: { type: String, default: '', trim: true },
    fileSize: { type: Number, default: 0, min: 0 }
}, { collection: 'learning_resources' });
learningResourceSchema.index({ classId: 1, subjectId: 1, published: 1 });
exports.LearningResource = mongoose_1.default.models.LearningResource ?? mongoose_1.default.model('LearningResource', learningResourceSchema);
