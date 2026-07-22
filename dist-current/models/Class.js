"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClassModel = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
function generateClassCode() {
    const year = new Date().getFullYear();
    const prefix = `CLS-${year}-`;
    return `${prefix}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
}
const classSchema = (0, schema_1.createBaseSchema)({
    title: { type: String, trim: true, default: '' },
    shortDescription: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    fullDescription: { type: String, trim: true, default: '' },
    category: { type: String, trim: true, default: 'general', index: true },
    department: { type: String, trim: true, default: 'general' },
    level: { type: String, trim: true, default: '' },
    language: { type: String, enum: ['en', 'fa', 'ps', 'multilingual'], default: 'multilingual' },
    currency: { type: String, trim: true, default: 'AFN' },
    imageUrl: { type: String, trim: true, default: '' },
    thumbnailUrl: { type: String, trim: true, default: '' },
    galleryImages: [{ type: String, trim: true }],
    totalDurationWeeks: { type: Number, min: 0, default: 0 },
    registrationOpen: { type: Boolean, default: true, index: true },
    featured: { type: Boolean, default: false, index: true },
    subjectId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Subject', default: null, index: true },
    teacherId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    className: { type: String, required: true, trim: true, unique: true, index: true },
    name: { type: String, trim: true, index: true },
    classCode: {
        type: String,
        required: true,
        trim: true,
        unique: true,
        default: generateClassCode,
        set: (value) => {
            if (value === null || value === undefined || value === '')
                return undefined;
            return value;
        }
    },
    genderRestriction: { type: String, enum: ['male', 'female', 'coed'], default: 'coed', index: true },
    feeAmount: { type: Number, default: 0, min: 0 },
    assignedSubjects: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Subject' }],
    assignedTeachers: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' }],
    studentCount: { type: Number, default: 0 },
    examSchedule: [{ type: Date }],
    room: { type: String, trim: true, default: '' },
    capacity: { type: Number, default: 30 },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    weeklySchedule: [{
            dayOfWeek: { type: Number, min: 0, max: 6, required: true, index: true },
            startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
            endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
            durationMinutes: { type: Number, min: 1, required: true },
            attendanceOpensBeforeMinutes: { type: Number, min: 0, default: 0 },
            attendanceClosesAfterMinutes: { type: Number, min: 0, default: 0 }
        }],
    active: { type: Boolean, default: true, index: true },
    ownerApprovalRequiredForDeletion: { type: Boolean, default: true },
    ownerDeleteApprovedAt: { type: Date, default: null }
}, { collection: 'classes' });
classSchema.pre('validate', function ensureCodeAndName(next) {
    if (!this.classCode) {
        this.classCode = generateClassCode();
    }
    if (this.className) {
        this.name = this.className;
        this.title = this.title || this.className;
    }
    if (!this.teacherId && Array.isArray(this.assignedTeachers) && this.assignedTeachers[0]) {
        this.teacherId = this.assignedTeachers[0];
    }
    if (!this.subjectId && Array.isArray(this.assignedSubjects) && this.assignedSubjects[0]) {
        this.subjectId = this.assignedSubjects[0];
    }
    next();
});
classSchema.index({ isDeleted: 1, active: 1, registrationOpen: 1, featured: -1, className: 1 });
classSchema.index({ className: 1 }, { unique: true });
classSchema.index({ classCode: 1 }, { unique: true });
classSchema.index({ branchId: 1, genderRestriction: 1, active: 1 });
classSchema.index({ branchId: 1, active: 1, isDeleted: 1 });
classSchema.index({ teacherId: 1, active: 1, isDeleted: 1 });
classSchema.index({ 'weeklySchedule.dayOfWeek': 1 });
exports.ClassModel = mongoose_1.default.models.Class ?? mongoose_1.default.model('Class', classSchema);
