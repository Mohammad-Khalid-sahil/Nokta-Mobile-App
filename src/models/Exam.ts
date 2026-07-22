import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const examSchema = createBaseSchema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    title: { type: String, required: true, trim: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: Date, required: true },
    totalMarks: { type: Number, default: 100 },
    passingMarks: { type: Number, default: 60 },
    examType: { type: String, enum: ['weekly', 'monthly', 'book'], required: true, index: true },
    examCode: { type: String, required: true, unique: true, trim: true },
    onlineExamUrl: { type: String, trim: true, default: '' },
    googleFormUrl: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
    publishedAt: { type: Date, default: null }
  },
  { collection: 'exams' }
);

examSchema.index({ date: 1, subject: 1 });
examSchema.index({ class: 1, status: 1 });

export const Exam = mongoose.models.Exam ?? mongoose.model('Exam', examSchema);
