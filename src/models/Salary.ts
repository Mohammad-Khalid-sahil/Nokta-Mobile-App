import mongoose from 'mongoose';
import { createBaseSchema, auditHistorySchema } from '../utils/schema';

const salarySchema = createBaseSchema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    monthKey: { type: String, required: true, trim: true, index: true },
    baseAmount: { type: Number, required: true },
    deductions: { type: Number, default: 0 },
    deductionsDetail: [{ reason: { type: String, trim: true }, amount: { type: Number, default: 0 } }],
    netAmount: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['pending', 'paid'], default: 'pending', index: true },
    paidAt: { type: Date, default: null },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    currency: { type: String, default: 'AFN', trim: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    immutableRecord: { type: Boolean, default: true },
    auditHistory: { type: [auditHistorySchema], default: [] }
  },
  { collection: 'salaries' }
);

salarySchema.index({ employeeId: 1, monthKey: 1 }, { unique: true });

export const Salary = mongoose.models.Salary ?? mongoose.model('Salary', salarySchema);
