import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const learningResourceSchema = createBaseSchema(
  {
    title: { type: String, required: true, trim: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null, index: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    type: { type: String, enum: ['document', 'video', 'link', 'assignment', 'book'], default: 'document' },
    accessRoles: [{ type: String, trim: true }],
    url: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    published: { type: Boolean, default: true },
    fileName: { type: String, default: '', trim: true },
    fileOriginalName: { type: String, default: '', trim: true },
    fileMimeType: { type: String, default: '', trim: true },
    fileSize: { type: Number, default: 0, min: 0 }
  },
  { collection: 'learning_resources' }
);

learningResourceSchema.index({ classId: 1, subjectId: 1, published: 1 });

export const LearningResource = mongoose.models.LearningResource ?? mongoose.model('LearningResource', learningResourceSchema);
