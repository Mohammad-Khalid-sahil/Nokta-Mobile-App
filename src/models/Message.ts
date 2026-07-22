import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const messageSchema = createBaseSchema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    senderRole: { type: String, required: true, trim: true, index: true },
    senderName: { type: String, default: '', trim: true },
    senderEmail: { type: String, default: '', trim: true, lowercase: true },
    senderPhone: { type: String, default: '', trim: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    recipientRole: { type: String, default: '', trim: true, index: true },
    targetGroup: {
      type: String,
      enum: ['admin', 'super_admin', 'teacher', 'student', 'class_group', ''],
      default: ''
    },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    subject: { type: String, default: '', trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    category: {
      type: String,
      enum: ['student', 'teacher', 'customer', 'support', 'academic', 'finance'],
      default: 'support',
      index: true
    },
    messageType: {
      type: String,
      enum: [
        'student_to_teacher',
        'student_to_admin',
        'student_to_student',
        'student_to_class_group',
        'student_resource_share',
        'teacher_to_admin',
        'teacher_to_student',
        'teacher_to_class_group',
        'teacher_resource_share',
        'admin_to_student',
        'admin_to_teacher',
        'customer_to_admin',
        'public_contact'
      ],
      default: 'customer_to_admin',
      index: true
    },
    status: {
      type: String,
      enum: ['unread', 'read', 'replied', 'closed'],
      default: 'unread',
      index: true
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high'],
      default: 'normal',
      index: true
    },
    parentMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null, index: true },
    threadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null, index: true },
    attachments: [{ type: String, trim: true }],
    readAt: { type: Date, default: null },
    repliedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null }
  },
  { collection: 'messages' }
);

messageSchema.index({ branchId: 1, status: 1, createdAt: -1 });
messageSchema.index({ recipientId: 1, status: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ category: 1, messageType: 1, createdAt: -1 });

export const Message = mongoose.models.Message ?? mongoose.model('Message', messageSchema);
