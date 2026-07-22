import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const taxRuleSchema = createBaseSchema(
  {
    minAmount: { type: Number, required: true, min: 0, index: true },
    maxAmount: { type: Number, default: null },
    baseTax: { type: Number, required: true, min: 0, default: 0 },
    percentage: { type: Number, required: true, min: 0, max: 100, default: 0 },
    categoryNameDari: { type: String, required: true, trim: true },
    explanationDari: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    effectiveFrom: { type: Date, required: true, default: Date.now, index: true },
    effectiveTo: { type: Date, default: null, index: true }
  },
  { collection: 'tax_rules' }
);

taxRuleSchema.index({ effectiveFrom: 1, effectiveTo: 1, isActive: 1 });

export const TaxRule = mongoose.models.TaxRule ?? mongoose.model('TaxRule', taxRuleSchema);
