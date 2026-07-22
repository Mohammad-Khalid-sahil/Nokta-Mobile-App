import mongoose from 'mongoose';
import { createBaseSchema, auditHistorySchema } from '../utils/schema';

const financeEntrySchema = createBaseSchema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    title: { type: String, required: true, trim: true },
    amount: { type: Number, required: true },
    category: { type: String, required: true, trim: true, index: true },
    date: { type: Date, default: Date.now, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    source: { type: String, enum: ['manual_income', 'scholarship', 'donation', 'other'], default: 'manual_income' },
    notes: { type: String, default: '', trim: true },
    immutableRecord: { type: Boolean, default: true },
    auditHistory: { type: [auditHistorySchema], default: [] }
  },
  { collection: 'finance_entries' }
);

financeEntrySchema.index({ date: -1, branchId: 1 });

export const FinanceEntry = mongoose.models.FinanceEntry ?? mongoose.model('FinanceEntry', financeEntrySchema);
