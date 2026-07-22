import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const enrollmentSchema = createBaseSchema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    academicYear: { type: String, required: true, trim: true },
    status: { type: String, enum: ['active', 'completed', 'suspended', 'cancelled'], default: 'active', index: true },
    enrolledAt: { type: Date, default: Date.now },
    registrationExpiryDate: { type: Date, default: null }
  },
  { collection: 'enrollments' }
);

enrollmentSchema.index({ studentId: 1, classId: 1, subjectId: 1, academicYear: 1 }, { unique: true });

export const Enrollment = mongoose.models.Enrollment ?? mongoose.model('Enrollment', enrollmentSchema);
