import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const qrContactSchema = createBaseSchema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    label: { type: String, required: true, trim: true },
    qrValue: { type: String, required: true, trim: true },
    contactType: { type: String, enum: ['student', 'teacher', 'parent', 'branch', 'support'], default: 'support' },
    active: { type: Boolean, default: true }
  },
  { collection: 'qr_contacts' }
);

qrContactSchema.index({ qrValue: 1 }, { unique: true });

export const QrContact = mongoose.models.QrContact ?? mongoose.model('QrContact', qrContactSchema);
