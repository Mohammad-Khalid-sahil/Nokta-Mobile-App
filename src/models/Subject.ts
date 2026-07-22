import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const subjectSchema = createBaseSchema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    title: { type: String, required: true, trim: true, index: true },
    code: { type: String, required: true, trim: true, unique: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    classIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class', index: true }],
    feeAmount: { type: Number, default: 0 },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    examCount: { type: Number, default: 0 },
    activeStatus: { type: Boolean, default: true, index: true },
    description: { type: String, default: '', trim: true }
  },
  { collection: 'subjects' }
);

subjectSchema.index({ title: 1, code: 1 });
subjectSchema.index({ classId: 1, teacher: 1, activeStatus: 1 });
subjectSchema.index({ classIds: 1, activeStatus: 1 });

export const Subject = mongoose.models.Subject ?? mongoose.model('Subject', subjectSchema);
