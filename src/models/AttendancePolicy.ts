import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const attendancePolicySchema = createBaseSchema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    name: { type: String, required: true, trim: true },
    duplicateWindowMinutes: { type: Number, default: 720 },
    absenceSuspensionThreshold: { type: Number, default: 5 },
    onlineAutoMarkEnabled: { type: Boolean, default: true },
    minimumSessionDurationMinutes: { type: Number, default: 15, min: 1 },
    minimumSessionDurationPercent: { type: Number, default: 50, min: 1, max: 100 },
    salaryDeductionPerAbsence: { type: Number, default: 50 },
    reminderLeadDays: { type: Number, default: 3 },
    active: { type: Boolean, default: true, index: true }
  },
  { collection: 'attendance_policies' }
);

attendancePolicySchema.index({ branchId: 1, active: 1 });

export const AttendancePolicy = mongoose.models.AttendancePolicy ?? mongoose.model('AttendancePolicy', attendancePolicySchema);
