import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const teacherSchema = createBaseSchema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    teacherCode: { type: String, required: true, trim: true, unique: true },
    gender: { type: String, enum: ['male', 'female', 'other'], default: 'other' },
    salaryType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
    fixedSalary: { type: Number, default: 0 },
    percentageRate: { type: Number, default: 0 },
    assignedSubjectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
    assignedClassIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],
    active: { type: Boolean, default: true, index: true }
  },
  { collection: 'teachers' }
);

teacherSchema.index({ branchId: 1, active: 1 });

export const TeacherProfile = mongoose.models.Teacher ?? mongoose.model('Teacher', teacherSchema);
