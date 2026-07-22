import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';
import { resolveLocalizedText } from '../utils/localizedText';

const localizedTextSchema = new mongoose.Schema(
  {
    en: { type: String, trim: true, default: '' },
    fa: { type: String, trim: true, default: '' },
    ps: { type: String, trim: true, default: '' }
  },
  { _id: false }
);

const notificationSchema = createBaseSchema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    title: { type: mongoose.Schema.Types.Mixed, required: true },
    description: { type: mongoose.Schema.Types.Mixed, required: true },
    message: { type: mongoose.Schema.Types.Mixed, required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
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
    recipientIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' }
  },
  { collection: 'notifications' }
);

notificationSchema.pre('validate', function syncDescription(this: any, next) {
  const description = resolveLocalizedText(this.description ?? this.message, 'en');
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

export const Notification = mongoose.models.Notification ?? mongoose.model('Notification', notificationSchema);
