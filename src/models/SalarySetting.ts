import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const salarySettingSchema = createBaseSchema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['teacher', 'admin', 'manager'], required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    salaryType: { type: String, enum: ['fixed', 'percentage', 'fixed_plus_percentage'], required: true, default: 'fixed' },
    fixedAmount: { type: Number, min: 0, default: 0 },
    percentage: { type: Number, min: 0, max: 100, default: 0 },
    percentageScope: { type: String, enum: ['branch', 'all_system'], default: 'branch' },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { collection: 'salary_settings' }
);

salarySettingSchema.index({ userId: 1, role: 1, isActive: 1 });

export const SalarySetting = mongoose.models.SalarySetting ?? mongoose.model('SalarySetting', salarySettingSchema);
