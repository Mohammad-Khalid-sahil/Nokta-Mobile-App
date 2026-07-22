import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const studentMessageSchema = createBaseSchema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, trim: true, default: '' },
    message: { type: String, required: true, trim: true },
    status: { type: String, enum: ['sent', 'read', 'answered', 'archived'], default: 'sent', index: true },
    whatsappLink: { type: String, trim: true, default: '' },
    readAt: { type: Date, default: null }
  },
  { collection: 'student_messages' }
);

studentMessageSchema.index({ studentId: 1, teacherId: 1, createdAt: -1 });

export const StudentMessage = mongoose.models.StudentMessage ?? mongoose.model('StudentMessage', studentMessageSchema);
