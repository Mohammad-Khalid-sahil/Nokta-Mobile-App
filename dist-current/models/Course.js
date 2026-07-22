"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Course = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const localizedTextSchema = new mongoose_1.default.Schema({
    en: { type: String, trim: true, default: '' },
    fa: { type: String, trim: true, default: '' },
    ps: { type: String, trim: true, default: '' }
}, { _id: false });
const courseSchema = (0, schema_1.createBaseSchema)({
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    title: { type: localizedTextSchema, required: true },
    shortDescription: { type: localizedTextSchema, default: () => ({}) },
    slug: { type: String, required: true, trim: true, lowercase: true, index: true },
    description: { type: localizedTextSchema, default: () => ({}) },
    linkedClassId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Class', default: null, index: true },
    level: { type: String, trim: true, default: '' },
    currency: { type: String, trim: true, default: 'AFN' },
    galleryImages: [{ type: String, trim: true }],
    registrationOpen: { type: Boolean, default: true, index: true },
    duration: { type: String, trim: true, default: '' },
    fee: { type: Number, min: 0, default: 0 },
    instructor: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    teacher: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    subjects: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Subject' }],
    schedule: { type: String, trim: true, default: '' },
    capacity: { type: Number, min: 0, default: 0 },
    enrolledCount: { type: Number, min: 0, default: 0 },
    enrollmentStatus: { type: String, enum: ['open', 'closed', 'waitlist'], default: 'open', index: true },
    imageUrl: { type: String, trim: true, default: '' },
    academicCategory: { type: String, trim: true, default: 'general', index: true },
    category: { type: String, trim: true, default: 'general', index: true },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    requirements: { type: localizedTextSchema, default: () => ({}) },
    learningOutcomes: { type: localizedTextSchema, default: () => ({}) },
    language: { type: String, enum: ['en', 'fa', 'ps', 'multilingual'], default: 'multilingual' },
    visibility: { type: String, enum: ['public', 'private'], default: 'public', index: true },
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft', index: true },
    featured: { type: Boolean, default: false, index: true },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null }
}, { collection: 'courses' });
courseSchema.index({ slug: 1, branchId: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
courseSchema.index({ status: 1, visibility: 1, featured: -1, createdAt: -1 });
exports.Course = mongoose_1.default.models.Course ?? mongoose_1.default.model('Course', courseSchema);
