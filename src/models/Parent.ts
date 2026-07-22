import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const parentSchema = createBaseSchema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    guardianName: { type: String, required: true, trim: true },
    guardianPhone: { type: String, required: true, trim: true },
    guardianEmail: { type: String, default: '', trim: true, lowercase: true },
    relationType: { type: String, enum: ['father', 'mother', 'guardian', 'other'], default: 'guardian' },
    linkedStudentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
    readOnlyAccess: { type: Boolean, default: true }
  },
  { collection: 'parents' }
);

parentSchema.index({ guardianPhone: 1, branchId: 1 });

export const ParentProfile = mongoose.models.Parent ?? mongoose.model('Parent', parentSchema);
