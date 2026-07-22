import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const stationerySaleSchema = createBaseSchema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', default: null, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    soldBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    receiptNumber: { type: String, trim: true, default: '', index: true },
    title: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    paymentStatus: { type: String, enum: ['paid', 'partial', 'unpaid'], default: 'paid', index: true },
    paidAmount: { type: Number, default: 0 },
    notes: { type: String, trim: true, default: '' },
    saleDate: { type: Date, default: Date.now, index: true }
  },
  { collection: 'stationery_sales' }
);

stationerySaleSchema.index({ branchId: 1, saleDate: -1 });
stationerySaleSchema.index({ receiptNumber: 1 }, { unique: true, sparse: true });

export const StationerySale = mongoose.models.StationerySale ?? mongoose.model('StationerySale', stationerySaleSchema);
