import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const teacherRatingSchema = createBaseSchema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    studentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 1200, default: '' },
    status: { type: String, enum: ['pending_admin_review', 'reviewed', 'archived'], default: 'pending_admin_review', index: true }
  },
  { collection: 'teacher_ratings' }
);

teacherRatingSchema.index({ teacherId: 1, studentUserId: 1, createdAt: -1 });
teacherRatingSchema.index({ studentId: 1, teacherId: 1, classId: 1 }, { unique: true });

export const TeacherRating = mongoose.models.TeacherRating ?? mongoose.model('TeacherRating', teacherRatingSchema);
