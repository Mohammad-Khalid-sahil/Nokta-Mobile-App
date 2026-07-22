import mongoose from 'mongoose';
import { createBaseSchema, auditHistorySchema } from '../utils/schema';

const paymentSchema = createBaseSchema(
  {
    paymentFor: {
      type: String,
      enum: ['student_fee', 'teacher_salary', 'manager_salary'],
      default: 'student_fee',
      index: true
    },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null, index: true },
    payeeUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    payeeRole: { type: String, enum: ['teacher', 'manager'], required: false, index: true },
    salaryRecordIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SalaryRecord' }],
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', default: null, index: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    amount: { type: Number, required: true },
    grossAmount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },
    remainingSalaryBalance: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'completed', 'paid', 'cancelled', 'refunded'],
      default: 'completed',
      index: true
    },
    currency: { type: String, default: 'AFN', trim: true },
    paymentDate: { type: Date, default: Date.now, index: true },
    method: { type: String, enum: ['cash', 'bank_transfer', 'mobile_money', 'card'], default: 'cash' },
    invoiceNumber: { type: String, required: true, trim: true, unique: true, index: true },
    referenceNumber: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true },
    immutableRecord: { type: Boolean, default: true },
    auditHistory: { type: [auditHistorySchema], default: [] }
  },
  { collection: 'payments' }
);

paymentSchema.index({ studentId: 1, paymentDate: -1 });
paymentSchema.index({ referenceNumber: 1 }, { sparse: true });
paymentSchema.index({ invoiceNumber: 1 }, { unique: true });

export const Payment = mongoose.models.Payment ?? mongoose.model('Payment', paymentSchema);
