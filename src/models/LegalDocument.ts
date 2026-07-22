import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const localizedTextSchema = {
  en: { type: String, trim: true, default: '' },
  fa: { type: String, trim: true, default: '' },
  ps: { type: String, trim: true, default: '' }
};

const legalDocumentSchema = createBaseSchema(
  {
    key: {
      type: String,
      enum: ['privacy_policy', 'terms_conditions', 'data_account_policy'],
      required: true,
      unique: true,
      index: true
    },
    title: localizedTextSchema,
    description: localizedTextSchema,
    content: localizedTextSchema,
    version: { type: String, trim: true, default: '1.0' },
    lastUpdatedAt: { type: Date, default: null },
    isPublished: { type: Boolean, default: false, index: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { collection: 'legal_documents' }
);

legalDocumentSchema.index({ key: 1, isDeleted: 1 });

export const LegalDocument =
  mongoose.models.LegalDocument ??
  mongoose.model('LegalDocument', legalDocumentSchema);
