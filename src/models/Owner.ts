import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const ownerSchema = createBaseSchema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    branchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }],
    title: { type: String, default: 'Owner', trim: true },
    policyAccess: { type: Boolean, default: true },
    analyticsAccess: { type: Boolean, default: true },
    dailyOperationsAccess: { type: Boolean, default: false }
  },
  { collection: 'owners' }
);

ownerSchema.index({ userId: 1 }, { unique: true });

export const Owner = mongoose.models.Owner ?? mongoose.model('Owner', ownerSchema);
export const OwnerProfile = Owner;
