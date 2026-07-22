import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const familyLinkSchema = createBaseSchema(
  {
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    relationType: { type: String, enum: ['father', 'mother', 'guardian', 'other'], default: 'guardian' },
    isPrimary: { type: Boolean, default: false }
  },
  { collection: 'family_links' }
);

familyLinkSchema.index({ parentId: 1, studentId: 1 }, { unique: true });

export const FamilyLink = mongoose.models.FamilyLink ?? mongoose.model('FamilyLink', familyLinkSchema);
