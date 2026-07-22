import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const advertisementSchema = createBaseSchema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    imageUrl: { type: String, default: '', trim: true },
    targetUrl: { type: String, default: '', trim: true },
    startsAt: { type: Date, default: Date.now },
    endsAt: { type: Date, default: null, index: true },
    active: { type: Boolean, default: true, index: true }
  },
  { collection: 'advertisements' }
);

advertisementSchema.index({ active: 1, startsAt: 1, endsAt: 1 });

export const Advertisement = mongoose.models.Advertisement ?? mongoose.model('Advertisement', advertisementSchema);
