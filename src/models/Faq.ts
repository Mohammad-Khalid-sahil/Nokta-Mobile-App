import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const localizedTextSchema = {
  en: { type: String, trim: true, default: '' },
  fa: { type: String, trim: true, default: '' },
  ps: { type: String, trim: true, default: '' }
};

const faqSchema = createBaseSchema(
  {
    category: {
      type: String,
      enum: [
        'account',
        'auth',
        'classes',
        'attendance',
        'results',
        'payments',
        'books',
        'messages',
        'settings',
        'support',
        'technical'
      ],
      required: true,
      index: true
    },
    question: localizedTextSchema,
    answer: localizedTextSchema,
    roles: [{ type: String, trim: true }],
    tags: [{ type: String, trim: true }],
    sortOrder: { type: Number, default: 100 },
    isActive: { type: Boolean, default: true, index: true },
    maintainedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { collection: 'faqs' }
);

faqSchema.index({ category: 1, sortOrder: 1 });
faqSchema.index({ isActive: 1, isDeleted: 1 });

export const Faq = mongoose.models.Faq ?? mongoose.model('Faq', faqSchema);
