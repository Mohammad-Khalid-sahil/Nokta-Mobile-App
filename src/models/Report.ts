import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const reportSchema = createBaseSchema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    type: { type: String, enum: ['financial', 'attendance', 'academic', 'security', 'operations'], required: true, index: true },
    title: { type: String, required: true, trim: true },
    periodKey: { type: String, default: '', trim: true, index: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    exportedAt: { type: Date, default: null },
    status: { type: String, enum: ['draft', 'generated', 'exported'], default: 'generated', index: true }
  },
  { collection: 'reports' }
);

reportSchema.index({ type: 1, periodKey: 1, branchId: 1 });

export const Report = mongoose.models.Report ?? mongoose.model('Report', reportSchema);
