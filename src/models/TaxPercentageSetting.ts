import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const taxPercentageSettingSchema = createBaseSchema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    quarterlyRate: { type: Number, min: 0, max: 100, required: true, default: 0 },
    annualRate: { type: Number, min: 0, max: 100, required: true, default: 0 },
    monthlyQuarterlyEnabled: { type: Boolean, default: false },
    showAnnualEstimatedShare: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    effectiveFrom: { type: Date, required: true, default: Date.now, index: true },
    effectiveTo: { type: Date, default: null, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { collection: 'tax_percentage_settings' }
);

taxPercentageSettingSchema.index({ branchId: 1, isActive: 1, effectiveFrom: -1 });

export const TaxPercentageSetting = mongoose.models.TaxPercentageSetting ?? mongoose.model('TaxPercentageSetting', taxPercentageSettingSchema);
