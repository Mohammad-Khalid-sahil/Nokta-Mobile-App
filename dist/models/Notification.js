"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Notification = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const localizedText_1 = require("../utils/localizedText");
const localizedTextSchema = new mongoose_1.default.Schema({
    en: { type: String, trim: true, default: '' },
    fa: { type: String, trim: true, default: '' },
    ps: { type: String, trim: true, default: '' }
}, { _id: false });
const notificationSchema = (0, schema_1.createBaseSchema)({
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    title: { type: mongoose_1.default.Schema.Types.Mixed, required: true },
    description: { type: mongoose_1.default.Schema.Types.Mixed, required: true },
    message: { type: mongoose_1.default.Schema.Types.Mixed, required: true },
    classId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Class', default: null, index: true },
    subjectId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Subject', default: null, index: true },
    teacherId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    category: { type: String, enum: ['general', 'holiday', 'emergency', 'class_notice', 'academic_reminder', 'event_update', 'exam_alert'], default: 'general', index: true },
    publishDate: { type: Date, default: null, index: true },
    expiresAt: { type: Date, default: null, index: true },
    publishStatus: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
    /** Explicit public academy feed flag. Default private — never assume public. */
    isPublic: { type: Boolean, default: false, index: true },
    /** public = academy visitors; private = authenticated audience; internal = staff-only. */
    visibility: { type: String, enum: ['public', 'private', 'internal'], default: 'private', index: true },
    priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal', index: true },
    pinned: { type: Boolean, default: false, index: true },
    recipientRoles: [{ type: String, required: true, trim: true }],
    recipientIds: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' }],
    readBy: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' }],
    metadata: { type: mongoose_1.default.Schema.Types.Mixed, default: {} },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' }
}, { collection: 'notifications' });
notificationSchema.pre('validate', function syncDescription(next) {
    const description = (0, localizedText_1.resolveLocalizedText)(this.description ?? this.message, 'en');
    this.description = this.description ?? this.message ?? description;
    this.message = this.message ?? this.description ?? description;
    if (this.publishStatus === 'published' && !this.publishDate) {
        this.publishDate = new Date();
    }
    next();
});
notificationSchema.index({ recipientRoles: 1 });
notificationSchema.index({ recipientIds: 1 });
notificationSchema.index({ branchId: 1, createdAt: -1 });
notificationSchema.index({ classId: 1, subjectId: 1, teacherId: 1 });
notificationSchema.index({ publishStatus: 1, publishDate: -1 });
notificationSchema.index({ isPublic: 1, visibility: 1, publishStatus: 1, publishDate: -1 });
exports.Notification = mongoose_1.default.models.Notification ?? mongoose_1.default.model('Notification', notificationSchema);
