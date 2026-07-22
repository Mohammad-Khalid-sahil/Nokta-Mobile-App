import mongoose from 'mongoose';
import { createBaseSchema, auditHistorySchema } from '../utils/schema';

const branchSchema = createBaseSchema(
  {
    name: { type: String, required: true, trim: true, index: true },
    code: { type: String, required: true, trim: true, unique: true, uppercase: true },
    address: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    country: { type: String, default: 'Afghanistan', trim: true },
    phone: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', default: null, index: true },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    active: { type: Boolean, default: true, index: true },
    timezone: { type: String, default: 'Asia/Kabul' },
    deleteRequestedAt: { type: Date, default: null },
    deleteRequestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    ownerDeleteApprovedAt: { type: Date, default: null },
    ownerDeleteApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    auditHistory: { type: [auditHistorySchema], default: [] }
  },
  { collection: 'branches' }
);

branchSchema.index({ code: 1 }, { unique: true });
branchSchema.index({ ownerId: 1, active: 1 });

export const Branch = mongoose.models.Branch ?? mongoose.model('Branch', branchSchema);
